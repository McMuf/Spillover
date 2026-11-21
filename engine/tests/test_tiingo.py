"""Tiingo: adjusted daily closes for single stocks, read safely and skipped (never fatal) on failure."""

import json
from datetime import date

import pytest

from spillover.ingest.http import FetchError, redact
from spillover.ingest.prices import PriceError, parse_tiingo, tiingo_levels

ROWS = [
    {"date": "2024-06-07T00:00:00.000Z", "close": 1208.88, "adjClose": 120.888},
    {"date": "2024-06-10T00:00:00.000Z", "close": 121.79, "adjClose": 121.79},  # after a 10:1 split
]


def test_adjusted_closes_so_a_split_is_not_a_crash() -> None:
    levels = parse_tiingo(json.dumps(ROWS), "NVDA", date(2024, 1, 1))
    assert levels == {date(2024, 6, 7): 120.888, date(2024, 6, 10): 121.79}


def test_errors_say_what_the_provider_said() -> None:
    with pytest.raises(PriceError, match="Ticker not found"):
        parse_tiingo(json.dumps({"detail": "Error: Ticker not found"}), "ZZZZ", date(2024, 1, 1))
    with pytest.raises(PriceError, match="not JSON"):
        parse_tiingo("<html>", "NVDA", date(2024, 1, 1))
    with pytest.raises(PriceError, match="no prices on or after"):
        parse_tiingo(json.dumps(ROWS), "NVDA", date(2025, 1, 1))


def test_the_request_names_the_ticker_and_the_key_never_shows_in_errors() -> None:
    seen: list[str] = []

    def fetch(url: str) -> str:
        seen.append(url)
        raise FetchError(f"GET {redact(url)} failed: HTTP 401")

    with pytest.raises(FetchError) as info:
        tiingo_levels("NVDA", "secret-key-123", date(2024, 1, 1), fetch)
    assert seen[0].startswith(
        "https://api.tiingo.com/tiingo/daily/nvda/prices?startDate=2024-01-01"
    )
    assert "secret-key-123" not in str(info.value)


def test_anything_but_a_ticker_is_refused_before_a_request() -> None:
    def fetch(url: str) -> str:
        raise AssertionError("must not be called")

    with pytest.raises(PriceError, match="not a ticker"):
        tiingo_levels("../etc", "k", date(2024, 1, 1), fetch)
