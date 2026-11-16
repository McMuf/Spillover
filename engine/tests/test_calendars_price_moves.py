"""Different market calendars and events derived from price moves (needed by seed claim 2)."""

from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

import numpy as np
import polars as pl
import pytest

from spillover.data import MarketData, load_market_data
from spillover.eventstudy import run_backtest
from spillover.ingest.config import EventsSpec
from spillover.ingest.store import IngestError, aligned_returns, build_events, own_calendar_returns
from spillover.ledger import predict
from spillover.models import Claim
from spillover.price_events import price_move_events
from spillover.taxonomy import ALL_NAMES, EXTRACTABLE_NAMES, MOVE_LOOKBACK


def weekdays(n: int, start: date = date(2022, 1, 3)) -> list[date]:
    out: list[date] = []
    d = start
    while len(out) < n:
        if d.weekday() < 5:
            out.append(d)
        d += timedelta(days=1)
    return out


def walk(days: list[date], seed: int, vol: float = 0.01) -> dict[date, float]:
    rng = np.random.default_rng(seed)
    level = 100.0
    out: dict[date, float] = {}
    for d in days:
        level *= 1.0 + rng.normal(0.0, vol)
        out[d] = level
    return out


def to_market(per_series: dict[str, tuple[list[date], list[float]]], tmp: Path) -> MarketData:
    """Write long-format returns exactly as ingest does, then load them back."""
    frame = pl.concat(
        [pl.DataFrame({"date": ds, "symbol": s, "ret": rs}) for s, (ds, rs) in per_series.items()]
    ).with_columns(pl.col("date").cast(pl.Date), pl.col("ret").cast(pl.Float64))
    tmp.mkdir(parents=True, exist_ok=True)
    frame.write_parquet(tmp / "prices.parquet")
    pl.DataFrame(
        schema={
            "event_id": pl.String,
            "event_type": pl.String,
            "entity": pl.String,
            "date": pl.Date,
            "scheduled": pl.Boolean,
            "source": pl.String,
        }
    ).write_parquet(tmp / "events.parquet")
    return load_market_data(tmp)


# --- calendars ---------------------------------------------------------------------------------


def test_data_without_gaps_is_returned_untouched(tmp_path: Path) -> None:
    days = weekdays(300)
    per = own_calendar_returns({"A": walk(days, 1), "B": walk(days, 2)}, days[0], 0.5)
    market = to_market(per, tmp_path)
    assert market.restrict(["A", "B"]) is market


def test_restricting_equals_computing_returns_on_the_shared_days(tmp_path: Path) -> None:
    """Compounding across the other market's holidays gives exactly the price-ratio returns."""
    days = weekdays(400)
    a, b = walk(days, 1), walk(days, 2)
    for i in (50, 51, 120, 300):  # B's holidays
        del b[days[i]]
    del a[days[200]]  # and one of A's
    reference_days, reference, _ = aligned_returns({"A": a, "B": b}, days[0], 0.5)

    market = to_market(own_calendar_returns({"A": a, "B": b}, days[0], 0.5), tmp_path)
    assert np.isnan(market.series("B")).sum() == 4  # gaps survive loading as "did not trade"
    view = market.restrict(["A", "B"])
    # The view starts one day later (its first return needs a previous shared day).
    assert view.dates[1:] == reference_days[1:]
    for s in ("A", "B"):
        assert np.allclose(view.series(s)[1:], reference[s][1:], rtol=0, atol=1e-12)


def test_an_event_on_another_markets_day_lands_on_the_next_session(tmp_path: Path) -> None:
    days = weekdays(300)
    us = {d: v for d, v in walk(days, 3).items() if d != days[200]}  # a US-only holiday
    market = to_market(own_calendar_returns({"US": us}, days[0], 0.5), tmp_path).restrict(["US"])
    seoul_day = days[200]  # Seoul traded, New York was closed
    t0 = market.day_index(seoul_day)
    assert t0 is not None and market.dates[t0] == days[201]
    assert market.dates[market.day_index(days[150]) or 0] == days[150]  # same date otherwise


# --- price-move events ---------------------------------------------------------------------------


def test_moves_beyond_three_sigma_of_the_prior_window_become_events() -> None:
    days = weekdays(200)
    rng = np.random.default_rng(4)
    r = list(rng.normal(0.0, 0.01, 200))
    r[100], r[150] = 0.08, -0.07
    ev = price_move_events("SKH", days, r)
    got = {(row["date"], row["event_type"]) for row in ev.iter_rows(named=True)}
    assert (days[100], "LARGE_MOVE_UP") in got and (days[150], "LARGE_MOVE_DOWN") in got
    assert all(d >= days[MOVE_LOOKBACK] for d, _ in got), "needs a full history before the day"
    assert ev["event_id"].to_list()[0].startswith("move_skh_")


def test_a_move_is_judged_only_on_data_before_it() -> None:
    """Changing later returns must never change whether an earlier day was an event."""
    days = weekdays(200)
    r = list(np.random.default_rng(5).normal(0.0, 0.01, 200))
    r[100] = 0.06
    before = price_move_events("X", days, r).filter(pl.col("date") <= days[100])
    r2 = r[:101] + [x * 10 for x in r[101:]]
    after = price_move_events("X", days, r2).filter(pl.col("date") <= days[100])
    assert before.equals(after)


def test_price_move_types_are_in_the_taxonomy_but_never_from_headlines() -> None:
    assert {"LARGE_MOVE_UP", "LARGE_MOVE_DOWN"} <= ALL_NAMES
    assert not {"LARGE_MOVE_UP", "LARGE_MOVE_DOWN"} & EXTRACTABLE_NAMES


def test_price_move_sources_must_name_a_configured_series() -> None:
    with pytest.raises(ValueError, match="need 'symbol'"):
        EventsSpec(type="price_moves")
    with pytest.raises(IngestError, match="not a configured series"):
        build_events([EventsSpec(type="price_moves", symbol="NOPE")], lambda url: "", {})


# --- seed claim 2, end to end on synthetic data ------------------------------------------------


@pytest.fixture
def seoul_to_new_york(tmp_path: Path) -> MarketData:
    """A Korean chip maker with Korean holidays; US memory names that react the next US session."""
    days = weekdays(700)
    rng = np.random.default_rng(9)
    kr_days = [d for i, d in enumerate(days) if i % 37 != 5]  # Korean holidays
    us_days = [d for i, d in enumerate(days) if i % 41 != 7]  # US holidays

    kr_r = rng.normal(0.0, 0.015, len(kr_days))
    shocks = list(range(150, len(kr_days) - 5, 30))
    for i in shocks:
        kr_r[i] = 0.09  # a big up day in Seoul
    kr_level = 100 * np.cumprod(1 + kr_r)

    mkt_r = rng.normal(0.0003, 0.01, len(us_days))
    us_index = {d: i for i, d in enumerate(us_days)}
    boost = np.zeros(len(us_days))
    for i in shocks:
        j = next(k for k, d in enumerate(us_days) if d >= kr_days[i])  # next US session
        boost[j] += 0.02
    levels: dict[str, dict[date, float]] = {
        "SKH": dict(zip(kr_days, kr_level, strict=True)),
        "MKT": dict(zip(us_days, 100 * np.cumprod(1 + mkt_r), strict=True)),
    }
    for name, seed in (("MU", 1), ("WDC", 2)):
        own = np.random.default_rng(seed).normal(0.0, 0.01, len(us_days))
        levels[name] = dict(
            zip(us_days, 100 * np.cumprod(1 + 1.1 * mkt_r + own + boost), strict=True)
        )
    assert len(us_index) == len(us_days)

    per = own_calendar_returns(levels, days[0], 0.5)
    market = to_market(per, tmp_path)
    events, _, _ = build_events([EventsSpec(type="price_moves", symbol="SKH")], lambda u: "", per)
    return MarketData(market.root, True, market.dates, market.returns, events)


def claim2(**over: Any) -> Claim:
    base: dict[str, Any] = {
        "id": "clm_korea_memory_us_v1",
        "statement": "After a large up day for SK Hynix in Seoul, US memory names rise the next US session.",
        "event_type": "LARGE_MOVE_UP",
        "trigger_entities": ["SKH"],
        "instrument": {"venue": "us_equity", "symbol": "US_MEMORY", "basket": ["MU", "WDC"]},
        "window": {"start": "first_report", "end": "+1_trading_day"},
        "expected_sign": "positive",
        "success": {"spillover_ci_excludes_zero": True, "min_forward_events": 8},
        "falsifier": "The interval includes zero after eight forward events.",
        "registered_by": "tester",
        "registered_at": "2030-01-01T00:00:00Z",
    }
    base.update(over)
    return Claim.model_validate(base)


def test_seed_claim_2_finds_the_next_session_effect(seoul_to_new_york: MarketData) -> None:
    report = run_backtest(claim2(), seoul_to_new_york, n_boot=2000)
    assert report.n_effective >= 10
    assert report.mean == pytest.approx(0.02, abs=0.006)
    assert report.ci_lo > 0


def test_predict_still_freezes_when_a_claims_prices_are_not_cached(
    seoul_to_new_york: MarketData, tmp_path: Path
) -> None:
    """Forward predictions need only the calendar; missing prices matter at grading, not before."""
    c = claim2(
        instrument={"venue": "us_equity", "symbol": "NOT_CACHED"},
        registered_at="2020-01-01T00:00:00Z",
    )
    when = seoul_to_new_york.dates[-1] + timedelta(days=3)
    future = pl.DataFrame(
        {
            "event_id": ["move_skh_future"],
            "event_type": ["LARGE_MOVE_UP"],
            "entity": ["SKH"],
            "date": [when],
            "scheduled": [False],
            "source": ["test"],
            "extractor_version": ["none"],
        }
    )
    data = MarketData(
        seoul_to_new_york.root,
        True,
        seoul_to_new_york.dates,
        seoul_to_new_york.returns,
        pl.concat([seoul_to_new_york.events, future]),
    )
    summary = predict([c], data, tmp_path / "preds", datetime(2030, 1, 1, tzinfo=UTC))
    assert [p.stem for p in summary.written] == ["move_skh_future"]
