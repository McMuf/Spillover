"""Prediction ledger: frozen, hashed, append-only records of forward calls.

A prediction is written when a qualifying event appears *before* the claim's window closes, and
carries a SHA-256 hash of its canonical form. Editing any field changes the hash, so tampering is
detectable by anyone with the repo. Files are never overwritten (scoring rule 8). Timestamp proofs
(OpenTimestamps) live next to each prediction as ``<name>.json.ots`` (see ``stamp.py``).
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from importlib import metadata
from pathlib import Path
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from spillover.data import DataError, MarketData
from spillover.eventstudy import matching_events
from spillover.models import Claim, Instrument, Window, superseded_ids
from spillover.placebo_events import BACKTEST_ONLY_PREFIX

RULES_VERSION = "0.2"
# No headline extractor exists yet; events are supplied directly with their type already set.
EXTRACTOR_VERSION = "none"
PREDICTIONS_DIR = Path("predictions")

_SAFE_NAME = r"^[A-Za-z0-9][A-Za-z0-9._-]*$"


class LedgerError(RuntimeError):
    """Raised when a ledger record is invalid or would overwrite history."""


def engine_version() -> str:
    try:
        return metadata.version("spillover")
    except metadata.PackageNotFoundError:  # pragma: no cover - only when not installed
        return "unknown"


class Prediction(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    schema_version: Literal[1] = 1
    claim_id: Annotated[str, Field(pattern=_SAFE_NAME)]
    claim_version: Annotated[int, Field(ge=1)]
    event_id: Annotated[str, Field(pattern=_SAFE_NAME)]
    event_type: str
    event_date: date
    instrument: Instrument
    predicted_sign: Literal["positive", "negative"]
    window: Window
    baseline: str
    factor: str
    measure: str
    confidence: Annotated[float, Field(ge=0.5, le=0.99)] | None = None
    extractor_version: str
    engine_version: str
    rules_version: str
    created_at: datetime
    sha256: Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]


def _record_dict(record: BaseModel, **kwargs: Any) -> dict[str, Any]:
    """A record as plain JSON data. Optional fields added after the format was published (an
    instrument's ``basket``) are left out when unused, so older records keep their exact bytes
    and their hashes."""
    body = record.model_dump(mode="json", **kwargs)
    inst = body.get("instrument")
    if isinstance(inst, dict) and inst.get("basket") is None:
        inst.pop("basket", None)
    return body


def canonical_body(record: BaseModel) -> bytes:
    """Canonical bytes that are hashed: every field except the hash, sorted keys, no spaces."""
    body = _record_dict(record, exclude={"sha256"})
    return json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()


def hash_record(record: BaseModel) -> str:
    """SHA-256 of a ledger or outcome record's canonical form (shared by both record types)."""
    return hashlib.sha256(canonical_body(record)).hexdigest()


def compute_hash(prediction: Prediction) -> str:
    return hash_record(prediction)


def build_prediction(
    claim: Claim,
    event_id: str,
    event_date: date,
    created_at: datetime,
    extractor: str = EXTRACTOR_VERSION,
) -> Prediction:
    if created_at.tzinfo is None:
        raise LedgerError("created_at must be timezone-aware (UTC)")
    draft: dict[str, Any] = {
        "claim_id": claim.id,
        "claim_version": claim.version,
        "event_id": event_id,
        "event_type": claim.event_type,
        "event_date": event_date,
        "instrument": claim.instrument,
        "predicted_sign": claim.expected_sign,
        "window": claim.window,
        "baseline": claim.baseline,
        "factor": claim.factor_label,
        "measure": claim.measure,
        "confidence": claim.confidence,
        "extractor_version": extractor,
        "engine_version": engine_version(),
        "rules_version": RULES_VERSION,
        "created_at": created_at.astimezone(UTC),
        "sha256": "0" * 64,
    }
    provisional = Prediction.model_validate(draft)
    return provisional.model_copy(update={"sha256": compute_hash(provisional)})


def prediction_path(root: Path, prediction: Prediction) -> Path:
    return root / prediction.claim_id / f"{prediction.event_id}.json"


def write_prediction(root: Path, prediction: Prediction) -> Path:
    """Write a new record. Refuses to overwrite: history is append-only."""
    path = prediction_path(root, prediction)
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(_record_dict(prediction), indent=2, sort_keys=True) + "\n"
    try:
        with path.open("x", encoding="utf-8") as fh:
            fh.write(text)
    except FileExistsError:
        raise LedgerError(f"{path} already exists; the ledger is append-only") from None
    return path


def load_prediction(path: Path) -> Prediction:
    try:
        return Prediction.model_validate_json(path.read_text(encoding="utf-8"))
    except (OSError, ValidationError) as exc:
        raise LedgerError(f"{path}: unreadable prediction: {exc}") from exc


def prediction_files(root: Path) -> list[Path]:
    return sorted(root.glob("*/*.json")) if root.exists() else []


@dataclass(frozen=True)
class LedgerCheck:
    path: Path
    problems: list[str]
    proof: Literal["none", "present"]


def verify_ledger(root: Path) -> list[LedgerCheck]:
    """Re-derive every hash and check each record sits at the path its fields imply."""
    results: list[LedgerCheck] = []
    for path in prediction_files(root):
        problems: list[str] = []
        try:
            pred = load_prediction(path)
        except LedgerError as exc:
            results.append(LedgerCheck(path, [str(exc)], "none"))
            continue
        if compute_hash(pred) != pred.sha256:
            problems.append("hash mismatch: the record was edited after it was written")
        if prediction_path(root, pred) != path:
            problems.append("file location does not match claim_id/event_id inside the record")
        if pred.created_at.tzinfo is None:
            problems.append("created_at has no timezone")
        proof = "present" if path.with_name(path.name + ".ots").exists() else "none"
        results.append(LedgerCheck(path, problems, proof))
    return results


@dataclass(frozen=True)
class PredictSummary:
    written: list[Path]
    skipped_draft_claims: list[str]
    skipped_before_registration: int
    skipped_window_closed: int
    skipped_existing: int
    skipped_superseded_claims: list[str] = field(default_factory=lambda: list[str]())


def window_is_open(data: MarketData, event_date: date, end_offset: int) -> bool:
    """True while the event window is not yet fully observed in the data (no hindsight)."""
    day0 = data.day_index(event_date)
    if day0 is None:
        return True
    return day0 + end_offset > len(data.dates) - 1


def predict(claims: list[Claim], data: MarketData, root: Path, now: datetime) -> PredictSummary:
    """Freeze a prediction for each qualifying forward event whose window is still open.

    An event is forward only if it falls after the claim's ``registered_at`` date. An event whose
    window the data already covers is *not* predicted: writing it now would be hindsight.
    """
    written: list[Path] = []
    drafts: list[str] = []
    before = closed = existing = 0
    replaced = superseded_ids(claims)

    for claim in claims:
        registered = claim.registered_at_utc
        if registered is None:
            drafts.append(claim.id)
            continue
        if claim.id in replaced:
            continue
        # Judge "is the window still open" on the claim's own trading calendar. If its prices are
        # not in the cache at all, fall back to the shared calendar: freezing a forward prediction
        # never needs the instrument's prices, only grading does.
        try:
            cdata = data.restrict(claim.symbols)
        except DataError:
            cdata = data
        events = matching_events(claim, data)
        # Events from the extractor carry its version; calendar and CSV events carry "none".
        versions: dict[str, str] = (
            dict(
                zip(
                    events["event_id"].to_list(), events["extractor_version"].to_list(), strict=True
                )
            )
            if "extractor_version" in events.columns
            else {}
        )
        for event_id, when in zip(
            events["event_id"].to_list(), events["date"].to_list(), strict=True
        ):
            if event_id.startswith(BACKTEST_ONLY_PREFIX):
                continue  # drawn after the fact for backtests; never a forward event
            if when <= registered.date():
                before += 1
            elif not window_is_open(cdata, when, claim.window.end_offset):
                closed += 1
            else:
                pred = build_prediction(
                    claim, event_id, when, now, versions.get(event_id, EXTRACTOR_VERSION)
                )
                try:
                    written.append(write_prediction(root, pred))
                except LedgerError:
                    existing += 1

    return PredictSummary(written, drafts, before, closed, existing, sorted(replaced))
