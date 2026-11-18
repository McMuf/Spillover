"""An event is dated by the first New York trading session that could react to it."""

import json
from datetime import UTC, date, datetime
from pathlib import Path

import pytest

from spillover.eventstore import (
    CURRENT_DATE_RULE,
    EventRecord,
    event_date,
    load_records,
    make_record,
    session_date,
)

ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.parametrize(
    ("utc", "expected"),
    [
        # Winter (EST, UTC-5): the close is 21:00 UTC.
        (datetime(2026, 11, 17, 13, 0), date(2026, 11, 17)),  # 8 a.m. before the open: same day
        (datetime(2026, 11, 17, 20, 59), date(2026, 11, 17)),  # 3:59 p.m.: same day
        (datetime(2026, 11, 17, 21, 0), date(2026, 11, 18)),  # 4:00 p.m. close: next day
        (datetime(2026, 11, 17, 21, 35), date(2026, 11, 18)),  # 4:35 p.m. 8-K: next day
        (datetime(2026, 11, 18, 1, 0), date(2026, 11, 18)),  # 8 p.m. NY, already the 18th in UTC
        # Summer (EDT, UTC-4): the close is 20:00 UTC.
        (datetime(2026, 7, 15, 19, 59), date(2026, 7, 15)),
        (datetime(2026, 7, 15, 20, 0), date(2026, 7, 16)),
        # Friday after the close is Saturday; the engine moves it to Monday like any weekend date.
        (datetime(2026, 11, 20, 22, 0), date(2026, 11, 21)),
    ],
)
def test_after_the_close_counts_as_the_next_session(utc: datetime, expected: date) -> None:
    assert session_date(utc.replace(tzinfo=UTC)) == expected


def test_new_events_use_the_session_rule_and_record_it() -> None:
    rec = make_record(
        headline_id="h",
        title="t",
        url="https://example.com",
        source="s",
        published_at=datetime(2026, 11, 17, 21, 35, tzinfo=UTC),
        event_type="RESTATEMENT",
        entities=["CNTY"],
        confidence="high",
        needs_review=False,
        extractor_version="v",
    )
    assert CURRENT_DATE_RULE == "ny_session" and rec.date_rule == "ny_session"
    assert rec.date == date(2026, 11, 18) and rec.event_key == "RESTATEMENT|CNTY|2026-11-18"
    assert json.loads(rec.model_dump_json())["date_rule"] == "ny_session"


def test_events_stored_before_the_rule_keep_their_original_dates() -> None:
    """The store is append-only: a rule change must never move an event already written."""
    for rec in load_records(ROOT / "events"):
        assert rec.event_key.endswith(rec.date.isoformat()), rec.headline_id
        assert rec.event_id.split("_")[-2] == rec.date.isoformat(), rec.headline_id
    old = EventRecord.model_validate_json(
        '{"headline_id":"x","title":"t","url":"https://e.com","source":"s",'
        '"published_at":"2026-11-16T21:42:00Z","event_type":"RESTATEMENT","entities":["CNTY"],'
        '"confidence":"high","needs_review":false,"extractor_version":"v",'
        '"event_key":"RESTATEMENT|CNTY|2026-11-16","event_id":"restatement_2026-11-16_abcd1234"}'
    )
    assert old.date_rule == "utc_day" and old.date == date(2026, 11, 16)
    assert event_date(old.published_at, "ny_session") == date(2026, 11, 17)
