"""The committed, append-only store of extracted events: ``events/YYYY-MM.jsonl``.

One JSON line per headline, appended and never edited. The same story from several sources is
several lines that share an ``event_key``; they are grouped into one event when the engine's cache
is built, so the sample is not inflated. Low-confidence extractions are stored too (flagged
``needs_review``) so they are not re-extracted, but they are excluded from scoring until a human
lists their ``event_key`` in ``labels/confirmed.txt``.
"""

from __future__ import annotations

import hashlib
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from pathlib import Path
from typing import Annotated, Any, Literal
from zoneinfo import ZoneInfo

import polars as pl
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from spillover.taxonomy import NONE

EVENTS_DIR = Path("events")
CONFIRMED_FILE = Path("labels/confirmed.txt")
# Event keys withdrawn after they were stored (a wrong rule, a wrong label). The store stays
# append-only; a retraction is a new, reviewed line here with its reason, never an edit.
RETRACTED_FILE = Path("labels/retracted.txt")
_NAME = r"^[A-Za-z0-9][A-Za-z0-9._-]*$"


class StoreError(RuntimeError):
    """The event store has an unreadable or inconsistent record."""


def event_key(event_type: str, entities: list[str], when: date) -> str:
    return f"{event_type}|{','.join(sorted(entities))}|{when.isoformat()}"


NEW_YORK = ZoneInfo("America/New_York")
MARKET_CLOSE = time(16, 0)  # the regular US session closes at 4 p.m. New York time

# How an event's date is set from its publication time. Part of the event definition, so it is
# recorded on every event: a stored event keeps the rule it was written with, forever.
#   utc_day     the publication's UTC calendar day (every event stored before 2026-11-18)
#   ny_session  the first US session that could react: the New York calendar day if published
#               before the 4 p.m. close, else the next day (a weekend or holiday then moves to
#               the next trading day, as for any event)
DateRule = Literal["utc_day", "ny_session"]
CURRENT_DATE_RULE: DateRule = "ny_session"


def session_date(published_at: datetime) -> date:
    """The first New York trading day a publication can move: after the close counts as tomorrow."""
    local = published_at.astimezone(NEW_YORK)
    return local.date() + timedelta(days=1) if local.time() >= MARKET_CLOSE else local.date()


def event_date(published_at: datetime, rule: DateRule) -> date:
    return (
        session_date(published_at) if rule == "ny_session" else published_at.astimezone(UTC).date()
    )


def event_id_for(key: str, event_type: str, when: date) -> str:
    return f"{event_type.lower()}_{when.isoformat()}_{hashlib.sha256(key.encode()).hexdigest()[:8]}"


class EventRecord(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    schema_version: Literal[1] = 1
    headline_id: Annotated[str, Field(pattern=_NAME)]
    title: Annotated[str, Field(min_length=1, max_length=300)]
    url: Annotated[str, Field(pattern=r"^https?://", max_length=500)]
    source: Annotated[str, Field(pattern=_NAME)]
    published_at: datetime
    event_type: str
    entities: list[str]
    confidence: Literal["high", "medium", "low"]
    needs_review: bool
    extractor_version: str
    event_key: str
    event_id: Annotated[str, Field(pattern=_NAME)]
    # Absent on events stored before the rule existed, which were dated by their UTC day.
    date_rule: DateRule = "utc_day"

    @property
    def date(self) -> date:
        return event_date(self.published_at, self.date_rule)


def make_record(
    *,
    headline_id: str,
    title: str,
    url: str,
    source: str,
    published_at: datetime,
    event_type: str,
    entities: list[str],
    confidence: Literal["high", "medium", "low"],
    needs_review: bool,
    extractor_version: str,
) -> EventRecord:
    when = event_date(published_at, CURRENT_DATE_RULE)
    key = event_key(event_type, entities, when)
    return EventRecord(
        headline_id=headline_id,
        title=title,
        url=url,
        source=source,
        published_at=published_at.astimezone(UTC),
        event_type=event_type,
        entities=entities,
        confidence=confidence,
        needs_review=needs_review,
        extractor_version=extractor_version,
        event_key=key,
        event_id=event_id_for(key, event_type, when),
        date_rule=CURRENT_DATE_RULE,
    )


def store_files(root: Path) -> list[Path]:
    return sorted(root.glob("????-??.jsonl")) if root.exists() else []


def load_records(root: Path) -> list[EventRecord]:
    out: list[EventRecord] = []
    for path in store_files(root):
        for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            if not line.strip():
                continue
            try:
                out.append(EventRecord.model_validate_json(line))
            except ValidationError as exc:
                raise StoreError(
                    f"{path} line {n}: invalid record: {exc.errors()[0]['msg']}"
                ) from None
    return out


def append_records(root: Path, records: Iterable[EventRecord]) -> int:
    """Append new records to their month's file. Already-stored headlines are skipped."""
    known = {r.headline_id for r in load_records(root)}
    written = 0
    for rec in sorted(records, key=lambda r: (r.published_at, r.headline_id)):
        if rec.headline_id in known:
            continue
        known.add(rec.headline_id)
        path = root / f"{rec.published_at:%Y-%m}.jsonl"
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as fh:
            fh.write(rec.model_dump_json() + "\n")
        written += 1
    return written


def read_retracted(path: Path) -> set[str]:
    """Event keys withdrawn from analysis (same format as the confirmed list)."""
    return read_confirmed(path)


def read_confirmed(path: Path) -> set[str]:
    """Event keys a human has confirmed (one per line; # starts a comment)."""
    if not path.exists():
        return set()
    lines = (ln.split("#", 1)[0].strip() for ln in path.read_text(encoding="utf-8").splitlines())
    return {ln for ln in lines if ln}


@dataclass(frozen=True)
class StoreFrame:
    events: pl.DataFrame
    n_groups: int
    n_needs_review: int


def events_frame(
    records: list[EventRecord],
    confirmed: set[str],
    schema: Mapping[str, Any],
    retracted: frozenset[str] = frozenset(),
) -> StoreFrame:
    """One row per (event, entity), for the engine's cache.

    Excludes NONE, retracted event keys, and low-confidence events unless confirmed. Several
    headlines with the same event_key become one event, dated and sourced by the earliest
    publication.
    """
    groups: dict[str, list[EventRecord]] = {}
    for r in records:
        groups.setdefault(r.event_key, []).append(r)
    rows: list[dict[str, object]] = []
    review = 0
    for key, recs in sorted(groups.items()):
        first = min(recs, key=lambda r: (r.published_at, r.headline_id))
        if first.event_type == NONE or not first.entities or key in retracted:
            continue
        if any(r.needs_review for r in recs) and key not in confirmed:
            review += 1
            continue
        for entity in first.entities:
            rows.append(
                {
                    "event_id": first.event_id,
                    "event_type": first.event_type,
                    "entity": entity,
                    "date": first.date,
                    "scheduled": False,
                    "source": first.url,
                    "extractor_version": first.extractor_version,
                }
            )
    return StoreFrame(pl.DataFrame(rows, schema=schema), len(groups), review)
