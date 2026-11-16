"""Scheduled macro releases (CPI, the jobs report) from FRED's release calendar."""

import json
from datetime import date

import pytest

from spillover.ingest.config import EventsSpec
from spillover.ingest.prices import PriceError, fred_release_dates, parse_release_dates
from spillover.ingest.store import IngestError, build_events
from spillover.taxonomy import ALL_NAMES, EXTRACTABLE_NAMES

PAYLOAD = json.dumps(
    {
        "release_dates": [
            {"release_id": 10, "date": "2026-12-10"},
            {"release_id": 10, "date": "2020-01-14"},
            {"release_id": 10, "date": "2024-06-12"},
            {"release_id": 10, "date": "2024-06-12"},
        ]
    }
)


def test_release_dates_are_parsed_sorted_and_unique() -> None:
    assert parse_release_dates(PAYLOAD, 10) == [
        date(2020, 1, 14),
        date(2024, 6, 12),
        date(2026, 12, 10),
    ]
    with pytest.raises(PriceError, match="unexpected response"):
        parse_release_dates("<html>", 10)
    with pytest.raises(PriceError, match="no release dates"):
        parse_release_dates('{"release_dates": []}', 10)


def test_the_request_asks_for_history_and_scheduled_dates() -> None:
    seen: list[str] = []

    def fetch(url: str) -> str:
        seen.append(url)
        return PAYLOAD

    fred_release_dates(10, "KEY", fetch)
    url = seen[0]
    assert url.startswith("https://api.stlouisfed.org/fred/release/dates?")
    for part in (
        "release_id=10",
        "realtime_start=1776-07-04",
        "include_release_dates_with_no_data=true",
    ):
        assert part in url


def test_release_dates_become_scheduled_events_from_the_data_start() -> None:
    spec = EventsSpec(type="fred_release", release_id=10, event_type="CPI_RELEASE", entity="BLS")
    events, _, sources = build_events(
        [spec], lambda url: PAYLOAD, history=(date(2021, 1, 1), date(2026, 11, 16)), fred_key="KEY"
    )
    assert events["event_id"].to_list() == ["cpi_release_2024-06-12", "cpi_release_2026-12-10"]
    assert events["scheduled"].to_list() == [True, True]
    assert set(events["event_type"].to_list()) == {"CPI_RELEASE"}
    assert sources == ["https://fred.stlouisfed.org/releases/calendar?rid=10"]


def test_a_release_source_needs_its_fields_and_a_key() -> None:
    with pytest.raises(ValueError, match="need 'release_id'"):
        EventsSpec(type="fred_release", release_id=10)
    spec = EventsSpec(type="fred_release", release_id=50, event_type="JOBS_REPORT", entity="BLS")
    with pytest.raises(IngestError, match="FRED_API_KEY"):
        build_events([spec], lambda url: PAYLOAD)


def test_release_types_are_in_the_taxonomy_and_never_from_headlines() -> None:
    assert {"CPI_RELEASE", "JOBS_REPORT"} <= ALL_NAMES
    assert not {"CPI_RELEASE", "JOBS_REPORT"} & EXTRACTABLE_NAMES
