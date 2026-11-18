"""Single-stock prices from Alpha Vantage: adjusted closes, clear errors, never fatal."""

import json
from datetime import date
from pathlib import Path

import pytest

from spillover.ingest.config import Config, SeriesSpec
from spillover.ingest.http import FetchError
from spillover.ingest.prices import PriceError, parse_alphavantage
from spillover.ingest.store import ALPHAVANTAGE_KEY_ENV, FRED_KEY_ENV, build_cache

from .test_calendars_price_moves import walk, weekdays


def av_payload(levels: dict[date, float], split_on: date | None = None) -> str:
    rows = {}
    for d, v in levels.items():
        raw = v * 2 if split_on and d < split_on else v  # as traded: doubled before a 2:1 split
        rows[d.isoformat()] = {"4. close": f"{raw:.4f}", "5. adjusted close": f"{v:.4f}"}
    return json.dumps({"Meta Data": {"2. Symbol": "DAL"}, "Time Series (Daily)": rows})


def test_adjusted_closes_are_used_so_a_split_is_not_a_crash() -> None:
    days = weekdays(10)
    levels = {d: 100.0 + i for i, d in enumerate(days)}
    got = parse_alphavantage(av_payload(levels, split_on=days[5]), "DAL", days[2])
    assert list(got) == days[2:]
    assert got[days[5]] / got[days[4]] == pytest.approx(105 / 104)


@pytest.mark.parametrize(
    ("body", "said"),
    [
        ({"Error Message": "Invalid API call."}, "Invalid API call"),
        (
            {
                "Note": "Thank you for using Alpha Vantage! Our standard API rate limit is 25 requests per day."
            },
            "rate limit",
        ),
        ({"Information": "This is a premium endpoint."}, "premium"),
        ({"Time Series (Daily)": {}}, "no daily series"),
        ({"Time Series (Daily)": {"2026-01-02": {"4. close": "1"}}}, "adjusted closes"),
    ],
)
def test_the_providers_own_reason_is_reported(body: dict[str, object], said: str) -> None:
    with pytest.raises(PriceError, match=said):
        parse_alphavantage(json.dumps(body), "DAL", date(2020, 1, 1))


def config(tmp_path: Path) -> Config:
    return Config.model_validate(
        {
            "data": {"out": str(tmp_path / "cache"), "start": "2022-01-03"},
            "series": [
                SeriesSpec(symbol="SPX", provider="fred", id="SP500").model_dump(),
                SeriesSpec(symbol="DAL", provider="alphavantage", id="DAL").model_dump(),
                SeriesSpec(symbol="UAL", provider="alphavantage", id="UAL").model_dump(),
                {"symbol": "AIRLINE", "provider": "alias", "of": "UAL"},
            ],
            "events": [{"type": "price_moves", "symbol": "UAL"}],
        }
    )


def fred_payload(levels: dict[date, float]) -> str:
    return json.dumps(
        {"observations": [{"date": d.isoformat(), "value": str(v)} for d, v in levels.items()]}
    )


def test_a_stock_that_fails_to_load_is_skipped_and_everything_else_carries_on(
    tmp_path: Path,
) -> None:
    days = weekdays(300)

    def fetch(url: str) -> str:
        if "stlouisfed" in url:
            return fred_payload(walk(days, 1))
        if "symbol=DAL" in url:
            return av_payload(walk(days, 2))
        raise FetchError(
            "GET https://www.alphavantage.co/query?symbol=UAL&apikey=*** failed: HTTP 500"
        )

    env = {FRED_KEY_ENV: "f", ALPHAVANTAGE_KEY_ENV: "SECRETKEY123"}
    summary = build_cache(config(tmp_path), fetch, env, days[-1])
    assert summary.symbols == ["DAL", "SPX"]
    assert set(summary.skipped_series) == {"UAL", "AIRLINE"}
    assert any("price moves of UAL" in s for s in summary.skipped_events)
    manifest = (tmp_path / "cache" / "MANIFEST.json").read_text()
    assert "SECRETKEY123" not in manifest and "SECRETKEY123" not in str(summary)
    assert json.loads(manifest)["skipped_series"] == ["AIRLINE", "UAL"]


def test_without_a_key_stocks_are_skipped_not_fatal(tmp_path: Path) -> None:
    days = weekdays(300)
    summary = build_cache(
        config(tmp_path), lambda url: fred_payload(walk(days, 1)), {FRED_KEY_ENV: "f"}, days[-1]
    )
    assert summary.symbols == ["SPX"]
    assert "ALPHAVANTAGE_API_KEY is not set" in summary.skipped_series["DAL"]


def test_the_key_never_appears_in_a_fetch_error() -> None:
    from spillover.ingest.http import redact

    assert "SECRET" not in redact(
        "GET https://www.alphavantage.co/query?symbol=X&apikey=SECRET failed"
    )
