"""Measuring the extractor against a hand-labeled gold set.

The gold set is labeled by people (``labels/gold.jsonl``); this module only scores against it. The
published accuracy ties to the exact labels (a hash of the gold file) and the extractor version,
and is reported separately from market-impact results: a claim should not be blamed for a
mislabeled headline, and the extractor should not be credited for a lucky market move.

Caveat for backtests: a model may have seen how historical events played out. Gold headlines
should be recent, from after the model's training cutoff where possible.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict, ValidationError, field_validator

from spillover.eventstore import load_records
from spillover.extractor import (
    DEFAULT_MODEL,
    ExtractionError,
    Headline,
    Llm,
    NeedsLiveCall,
    clean_title,
    extract,
    extractor_version,
)
from spillover.taxonomy import ALL_NAMES, NONE

GOLD_FILE = Path("labels/gold.jsonl")
CANDIDATES_FILE = Path("labels/gold_candidates.jsonl")
_EPOCH = datetime(2000, 1, 1, tzinfo=UTC)


class GoldError(RuntimeError):
    """The gold file is missing, unlabeled or malformed."""


class GoldRow(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    title: str
    source: str
    expected_type: str
    expected_entities: list[str] = []

    @field_validator("expected_type")
    @classmethod
    def _labeled(cls, v: str) -> str:
        if v == "":
            raise ValueError("expected_type is blank: this headline has not been labeled yet")
        if v != NONE and v not in ALL_NAMES:
            raise ValueError(f"expected_type {v!r} is not in the taxonomy")
        return v


def load_gold(path: Path) -> tuple[list[GoldRow], str]:
    if not path.exists():
        raise GoldError(f"{path} not found. Label headlines first (see `spillover gold-template`).")
    raw = path.read_bytes()
    rows: list[GoldRow] = []
    for n, line in enumerate(raw.decode("utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        try:
            rows.append(GoldRow.model_validate_json(line))
        except ValidationError as exc:
            raise GoldError(f"{path} line {n}: {exc.errors()[0]['msg']}") from None
    if not rows:
        raise GoldError(f"{path} has no labeled rows")
    return rows, hashlib.sha256(raw).hexdigest()


# Accuracy is only meaningful once the gold set holds real events, not just "none of the above":
# on a set that is all NONE, a labeler that always answers NONE scores 100% and learns nothing.
MIN_POSITIVES = 20


@dataclass(frozen=True)
class GoldReport:
    extractor_version: str
    gold_sha256: str
    n_total: int
    n_scored: int
    n_unscored: int
    type_accuracy: float | None
    high_confidence_accuracy: float | None
    entity_precision: float | None
    entity_recall: float | None
    low_confidence_rate: float | None
    # How many gold rows are real events (not NONE), and what always answering the most common
    # label would score: the bar any labeler has to beat for its accuracy to mean anything.
    n_positive: int = 0
    majority_baseline: float | None = None
    # Of the real events in the gold set, the share typed right (recall); of the labeler's non-NONE
    # answers, the share that were right (precision). Both None without enough examples.
    event_recall: float | None = None
    event_precision: float | None = None
    measurable: bool = False
    mismatches: list[dict[str, Any]] = field(default_factory=lambda: list[dict[str, Any]]())

    def to_dict(self) -> dict[str, Any]:
        return self.__dict__.copy()


def _ratio(n: int, d: int) -> float | None:
    return n / d if d else None


def evaluate_gold(
    rows: list[GoldRow],
    gold_sha: str,
    llm: Llm | None,
    cache_root: Path,
    model_id: str = DEFAULT_MODEL,
) -> GoldReport:
    version = extractor_version(llm.model_id if llm is not None else model_id)
    correct = scored = high = high_ok = low = 0
    tp = fp = fn = 0
    pos = pos_ok = said_event = said_event_ok = 0
    labels: dict[str, int] = {}
    unscored = 0
    misses: list[dict[str, Any]] = []
    for r in rows:
        title = clean_title(r.title)
        # Gold rows have no real feed time; extraction sees only source and title.
        h = Headline("gold", title, "https://gold.invalid/", r.source, _EPOCH)
        try:
            got = extract(h, llm, cache_root, model_id)
        except (NeedsLiveCall, ExtractionError):
            unscored += 1
            continue
        scored += 1
        ex = got.extraction
        ok = ex.event_type == r.expected_type
        correct += ok
        if ex.confidence == "high":
            high += 1
            high_ok += ok
        low += ex.confidence == "low"
        if r.expected_type != NONE or ex.event_type != NONE:
            want, have = set(e.upper() for e in r.expected_entities), set(ex.entities)
            tp += len(want & have)
            fp += len(have - want)
            fn += len(want - have)
        labels[r.expected_type] = labels.get(r.expected_type, 0) + 1
        if r.expected_type != NONE:
            pos += 1
            pos_ok += ok
        if ex.event_type != NONE:
            said_event += 1
            said_event_ok += ok
        if not ok:
            misses.append({"title": title[:120], "expected": r.expected_type, "got": ex.event_type})
    return GoldReport(
        version,
        gold_sha,
        len(rows),
        scored,
        unscored,
        _ratio(correct, scored),
        _ratio(high_ok, high),
        _ratio(tp, tp + fp),
        _ratio(tp, tp + fn),
        _ratio(low, scored),
        n_positive=pos,
        majority_baseline=_ratio(max(labels.values(), default=0), scored),
        event_recall=_ratio(pos_ok, pos),
        event_precision=_ratio(said_event_ok, said_event),
        measurable=pos >= MIN_POSITIVES,
        mismatches=misses[:25],
    )


def write_candidates(store_root: Path, out: Path, n: int) -> int:
    """Unlabeled candidate headlines from the event store, for a person to label."""
    seen: set[str] = set()
    picked: list[dict[str, Any]] = []
    for rec in sorted(load_records(store_root), key=lambda r: r.published_at, reverse=True):
        if rec.title in seen:
            continue
        seen.add(rec.title)
        picked.append(
            {"title": rec.title, "source": rec.source, "expected_type": "", "expected_entities": []}
        )
        if len(picked) == n:
            break
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("".join(json.dumps(p) + "\n" for p in picked), encoding="utf-8")
    return len(picked)
