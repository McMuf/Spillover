"""Grading: join a frozen prediction to what the market actually did, once its window closed.

Grading is a pure function of (prediction, market data, rules version): the same inputs give the
same outcome record, so anyone can recompute it. Records are append-only and hashed like
predictions. A correction is a *new* record whose ``corrects`` field points at the old hash;
nothing is edited or deleted (scoring rule 8).
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from spillover.data import DataError, MarketData
from spillover.eventstudy import Baseline, Measure, compute_stat, has_history
from spillover.ledger import (
    RULES_VERSION,
    LedgerError,
    Prediction,
    engine_version,
    hash_record,
    load_prediction,
    prediction_files,
    verify_ledger,
)

OUTCOMES_DIR = Path("outcomes")
_SAFE_NAME = r"^[A-Za-z0-9][A-Za-z0-9._-]*$"


class ScoreError(RuntimeError):
    """Raised when an outcome record is invalid or would overwrite history."""


class Outcome(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    schema_version: Literal[1] = 1
    prediction_sha256: Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
    claim_id: Annotated[str, Field(pattern=_SAFE_NAME)]
    claim_version: Annotated[int, Field(ge=1)]
    event_id: Annotated[str, Field(pattern=_SAFE_NAME)]
    event_date: date
    window_start: date  # date of day 0
    window_end: date  # date of the last day in the window
    predicted_sign: Literal["positive", "negative"]
    measure: str
    baseline: str
    car: float  # cumulative abnormal return over the window
    value: float  # the tested statistic (the CAR, or |CAR| minus its typical size)
    hit: bool  # the statistic has the predicted sign
    scheduled_overlap: bool  # another scheduled event fell in the window (excluded when scoring)
    confidence: Annotated[float, Field(ge=0.5, le=0.99)] | None = None
    data_synthetic: bool
    data_as_of: date
    rules_version: str
    engine_version: str
    graded_at: datetime
    corrects: Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")] | None = None
    sha256: Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]


def outcome_path(root: Path, outcome: Outcome) -> Path:
    """Where a record lives. A correction sits next to the record it supersedes, never over it."""
    stem = outcome.event_id
    if outcome.corrects is not None:
        stem = f"{stem}.corrects-{outcome.corrects[:12]}"
    return root / outcome.claim_id / f"{stem}.json"


def seal(outcome: Outcome) -> Outcome:
    """Return the outcome with its hash filled in."""
    return outcome.model_copy(update={"sha256": hash_record(outcome)})


def write_outcome(root: Path, outcome: Outcome) -> Path:
    path = outcome_path(root, outcome)
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(outcome.model_dump(mode="json"), indent=2, sort_keys=True) + "\n"
    try:
        with path.open("x", encoding="utf-8") as fh:
            fh.write(text)
    except FileExistsError:
        raise ScoreError(f"{path} already exists; outcomes are append-only") from None
    return path


def load_outcome(path: Path) -> Outcome:
    try:
        return Outcome.model_validate_json(path.read_text(encoding="utf-8"))
    except (OSError, ValidationError) as exc:
        raise ScoreError(f"{path}: unreadable outcome: {exc}") from exc


def outcome_files(root: Path) -> list[Path]:
    return sorted(root.glob("*/*.json")) if root.exists() else []


def is_hit(value: float, predicted_sign: str) -> bool:
    """Did the realized statistic have the predicted sign? Exactly zero is not a hit."""
    return value > 0 if predicted_sign == "positive" else value < 0


def window_closed(data: MarketData, event_date: date, end_offset: int) -> bool:
    day0 = data.day_index(event_date)
    return day0 is not None and day0 + end_offset <= len(data.dates) - 1


def prediction_symbols(pred: Prediction) -> list[str]:
    """Every series a frozen prediction needs: its instrument (or basket) and its factors."""
    factors = pred.factor.split("+") if pred.baseline == "factor_only" else []
    return [*pred.instrument.members, *factors]


def grade_prediction(pred: Prediction, data: MarketData, now: datetime) -> Outcome | None:
    """Score one prediction, or return None if its window has not closed in the data yet."""
    data = data.restrict(prediction_symbols(pred))  # the prediction's own trading calendar
    end_offset = pred.window.end_offset
    day0 = data.day_index(pred.event_date)
    if day0 is None or day0 + end_offset > len(data.dates) - 1:
        return None
    if not has_history(len(data.dates), day0, end_offset):
        raise ScoreError(f"{pred.event_id}: not enough history before the event to grade it")

    window_start, window_end = data.dates[day0], data.dates[day0 + end_offset]
    if pred.created_at.astimezone(UTC).date() > window_end:
        raise ScoreError(
            f"{pred.claim_id}/{pred.event_id}: written after its window closed "
            f"({pred.created_at.date()} > {window_end}); that is hindsight, not a prediction"
        )

    baseline: Baseline = "factor_only" if pred.baseline == "factor_only" else "constant_mean"
    measure: Measure = (
        "abs_excess_return" if pred.measure == "abs_excess_return" else "abnormal_return"
    )
    y = data.instrument_series(pred.instrument.symbol, pred.instrument.basket)
    # Several factors are stored as one string joined with "+" (symbols cannot contain "+").
    x = data.factor_matrix(pred.factor.split("+")) if baseline == "factor_only" else None
    car, value, _alpha, _betas = compute_stat(y, x, day0, end_offset, baseline, measure)

    ev = data.events
    sched = ev.filter(ev["scheduled"] & (ev["event_type"] != pred.event_type))
    sched_idx = [i for d in sched["date"].to_list() if (i := data.day_index(d)) is not None]
    overlap = any(day0 <= s <= day0 + end_offset for s in sched_idx)

    return seal(
        Outcome(
            prediction_sha256=pred.sha256,
            claim_id=pred.claim_id,
            claim_version=pred.claim_version,
            event_id=pred.event_id,
            event_date=pred.event_date,
            window_start=window_start,
            window_end=window_end,
            predicted_sign=pred.predicted_sign,
            measure=pred.measure,
            baseline=pred.baseline,
            car=car,
            value=value,
            hit=is_hit(value, pred.predicted_sign),
            scheduled_overlap=overlap,
            confidence=pred.confidence,
            data_synthetic=data.synthetic,
            data_as_of=data.as_of,
            rules_version=RULES_VERSION,
            engine_version=engine_version(),
            graded_at=now.astimezone(UTC),
            sha256="0" * 64,
        )
    )


@dataclass(frozen=True)
class GradeSummary:
    graded: list[Path] = field(default_factory=lambda: list[Path]())
    still_open: int = 0
    already_graded: int = 0
    refused: list[str] = field(default_factory=lambda: list[str]())
    # Not an error: the data to grade them is not available (yet), so they stay open.
    ungradable: list[str] = field(default_factory=lambda: list[str]())


def grade_all(
    predictions_root: Path, outcomes_root: Path, data: MarketData, now: datetime
) -> GradeSummary:
    """Grade every prediction whose window has closed and that has no outcome yet.

    Predictions that fail verification (edited after writing) or were written after their window
    closed are refused and reported, never silently graded.
    """
    tampered = {c.path for c in verify_ledger(predictions_root) if c.problems}
    graded: list[Path] = []
    refused: list[str] = []
    ungradable: list[str] = []
    still_open = already = 0

    for path in prediction_files(predictions_root):
        if path in tampered:
            refused.append(f"{path}: failed ledger verification, not graded")
            continue
        try:
            pred = load_prediction(path)
        except LedgerError as exc:
            refused.append(str(exc))
            continue
        if (outcomes_root / pred.claim_id / f"{pred.event_id}.json").exists():
            already += 1
            continue
        try:
            outcome = grade_prediction(pred, data, now)
        except DataError as exc:
            # Missing prices for one instrument must not stop everything else from being graded.
            ungradable.append(f"{pred.claim_id}/{pred.event_id}: {exc}")
            continue
        except ScoreError as exc:
            refused.append(str(exc))
            continue
        if outcome is None:
            still_open += 1
        else:
            graded.append(write_outcome(outcomes_root, outcome))

    return GradeSummary(graded, still_open, already, refused, ungradable)


@dataclass(frozen=True)
class OutcomeCheck:
    path: Path
    problems: list[str]


def verify_outcomes(outcomes_root: Path, predictions_root: Path) -> list[OutcomeCheck]:
    """Re-derive each outcome hash and check it links to an intact prediction."""
    pred_hashes: dict[tuple[str, str], str] = {}
    for p in prediction_files(predictions_root):
        try:
            pred = load_prediction(p)
        except LedgerError:
            continue
        pred_hashes[(pred.claim_id, pred.event_id)] = pred.sha256

    results: list[OutcomeCheck] = []
    for path in outcome_files(outcomes_root):
        problems: list[str] = []
        try:
            out = load_outcome(path)
        except ScoreError as exc:
            results.append(OutcomeCheck(path, [str(exc)]))
            continue
        if hash_record(out) != out.sha256:
            problems.append("hash mismatch: the record was edited after it was written")
        if outcome_path(outcomes_root, out) != path:
            problems.append("file location does not match claim_id/event_id inside the record")
        linked = pred_hashes.get((out.claim_id, out.event_id))
        if linked is None:
            problems.append("no matching prediction in the ledger")
        elif linked != out.prediction_sha256:
            problems.append("prediction hash differs from the one this outcome was graded against")
        results.append(OutcomeCheck(path, problems))
    return results


__all__ = [
    "OUTCOMES_DIR",
    "GradeSummary",
    "Outcome",
    "ScoreError",
    "grade_all",
    "grade_prediction",
    "is_hit",
    "load_outcome",
    "outcome_files",
    "seal",
    "verify_outcomes",
    "window_closed",
    "write_outcome",
]
