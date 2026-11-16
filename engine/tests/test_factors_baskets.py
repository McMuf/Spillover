"""Multi-factor baselines and equal-weighted baskets (needed by seed claims 1 and 5)."""

import hashlib
import json
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

import numpy as np
import polars as pl
import pytest
from pydantic import ValidationError

from spillover.data import MarketData
from spillover.eventstudy import compute_stat, run_backtest
from spillover.lanes import Changes, apply_changes
from spillover.ledger import build_prediction, load_prediction, verify_ledger, write_prediction
from spillover.models import Claim
from spillover.scoring import grade_prediction

N = 700
SHOCK = -0.03
BOOST = 0.02


def _calendar(n: int) -> list[date]:
    out: list[date] = []
    d = date(2022, 1, 3)
    while len(out) < n:
        if d.weekday() < 5:
            out.append(d)
        d += timedelta(days=1)
    return out


@pytest.fixture(scope="module")
def market() -> MarketData:
    """Synthetic crypto and equity series with known effects on known days."""
    rng = np.random.default_rng(11)
    dates = _calendar(N)
    event_idx = list(range(160, N - 10, 22))

    btc = rng.normal(0.0, 0.03, N)
    eth = 0.6 * btc + rng.normal(0.0, 0.03, N)
    tok = 0.7 * btc + 0.9 * eth + rng.normal(0.0, 0.008, N)
    tok[event_idx] += SHOCK  # unlock days: an extra drop

    mkt = rng.normal(0.0003, 0.01, N)
    sup_a = 1.1 * mkt + rng.normal(0.0, 0.01, N)
    sup_b = 0.9 * mkt + rng.normal(0.0, 0.01, N)
    sup_c = 1.0 * mkt + rng.normal(0.0, 0.01, N)
    for i in event_idx:  # capex days: two of the three suppliers rise
        sup_a[i] += BOOST
        sup_b[i] += BOOST

    def rows(kind: str, entity: str) -> list[dict[str, Any]]:
        return [
            {
                "event_id": f"{kind.lower()}_{dates[i].isoformat()}",
                "event_type": kind,
                "entity": entity,
                "date": dates[i],
                "scheduled": False,
                "source": "test",
            }
            for i in event_idx
        ]

    events = pl.DataFrame(rows("TOKEN_UNLOCK", "TOK") + rows("CAPEX_RAISE", "HYPER"))
    returns = {
        "BTC": btc,
        "ETH": eth,
        "TOK": tok,
        "MKT": mkt,
        "SUPA": sup_a,
        "SUPB": sup_b,
        "SUPC": sup_c,
    }
    return MarketData(Path("memory"), True, dates, returns, events)


def claim(**over: Any) -> Claim:
    base: dict[str, Any] = {
        "id": "clm_test_v1",
        "statement": "A test claim about a known synthetic effect.",
        "event_type": "TOKEN_UNLOCK",
        "trigger_entities": ["TOK"],
        "instrument": {"venue": "crypto", "symbol": "TOK"},
        "window": {"start": "first_report", "end": "+1_trading_day"},
        "expected_sign": "negative",
        "success": {"spillover_ci_excludes_zero": True, "min_forward_events": 8},
        "falsifier": "The interval includes zero after eight forward events.",
        "registered_by": "tester",
        "registered_at": "2026-01-01T00:00:00Z",
    }
    base.update(over)
    return Claim.model_validate(base)


# --- the engine ------------------------------------------------------------------------------


def test_one_factor_as_a_matrix_gives_exactly_the_same_numbers(market: MarketData) -> None:
    """Existing single-factor claims must not move by a single bit."""
    y, x = market.series("TOK"), market.series("BTC")
    a = compute_stat(y, x, 300, 1, "factor_only", "abnormal_return")
    b = compute_stat(y, x.reshape(-1, 1), 300, 1, "factor_only", "abnormal_return")
    assert a == b
    assert len(a[3]) == 1


def test_two_factor_baseline_recovers_both_betas(market: MarketData) -> None:
    x = market.factor_matrix(["BTC", "ETH"])
    _, _, _, betas = compute_stat(market.series("TOK"), x, 400, 1, "factor_only", "abnormal_return")
    assert betas == pytest.approx((0.7, 0.9), abs=0.1)


def test_two_factors_isolate_the_shock_better_than_one(market: MarketData) -> None:
    both = run_backtest(claim(factors=["BTC", "ETH"]), market, n_boot=2000)
    one = run_backtest(claim(factor="BTC"), market, n_boot=2000)
    assert both.mean == pytest.approx(SHOCK, abs=0.004)
    assert both.ci_hi < 0  # the drop is detected
    # Leaving ETH out leaves its moves in the residual: a noisier, wider interval.
    assert (both.ci_hi - both.ci_lo) < (one.ci_hi - one.ci_lo)
    assert all(len(e.betas) == 2 for e in both.events)


def test_basket_return_is_the_equal_weighted_mean(market: MarketData) -> None:
    got = market.instrument_series("SUPPLIERS", ["SUPA", "SUPB", "SUPC"])
    want = (market.series("SUPA") + market.series("SUPB") + market.series("SUPC")) / 3
    assert np.allclose(got, want)


def test_basket_claim_finds_two_thirds_of_the_boost(market: MarketData) -> None:
    c = claim(
        event_type="CAPEX_RAISE",
        trigger_entities=["HYPER"],
        instrument={
            "venue": "us_equity",
            "symbol": "SUPPLIERS",
            "basket": ["SUPA", "SUPB", "SUPC"],
        },
        expected_sign="positive",
    )
    report = run_backtest(c, market, n_boot=2000)
    assert report.mean == pytest.approx(2 * BOOST / 3, abs=0.004)
    assert report.ci_lo > 0


# --- validation ------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("over", "message"),
    [
        ({"factors": ["BTC", "BTC"]}, "same series twice"),
        ({"factors": ["BTC"], "factor": "ETH"}, "either factor or factors"),
        ({"factors": ["BTC"], "baseline": "constant_mean"}, "factor baseline"),
        ({"factors": ["TOK"]}, "cannot also be the instrument"),
        ({"factor": "TOK"}, "cannot also be the instrument"),
        ({"factors": ["A", "B", "C", "D"]}, "at most 3"),
        ({"factors": ["BTC+ETH"]}, "pattern"),
        ({"instrument": {"venue": "x", "symbol": "B", "basket": ["A"]}}, "at least 2"),
        ({"instrument": {"venue": "x", "symbol": "B", "basket": ["A", "A"]}}, "same symbol twice"),
    ],
)
def test_bad_factor_and_basket_settings_are_rejected(over: dict[str, Any], message: str) -> None:
    with pytest.raises(ValidationError, match=message):
        claim(**over)


def test_factor_names_and_label() -> None:
    assert claim().factor_names == ["MKT"]
    assert claim(factors=["BTC", "ETH"]).factor_label == "BTC+ETH"
    assert (
        claim(
            baseline="constant_mean", instrument={"venue": "us_index", "symbol": "SPX"}
        ).factor_names
        == []
    )


# --- ledger and grading ------------------------------------------------------------------------


def test_an_ordinary_prediction_hashes_exactly_as_before(tmp_path: Path) -> None:
    """Adding optional fields must not change the canonical bytes of existing record types."""
    c = claim(factor="BTC")
    pred = build_prediction(c, "e1", date(2026, 2, 2), datetime(2026, 2, 2, 12, tzinfo=UTC))
    path = write_prediction(tmp_path, pred)
    stored = json.loads(path.read_text(encoding="utf-8"))
    assert "basket" not in stored["instrument"]
    # The published hashing rule: every field except the hash, sorted keys, no spaces.
    body = {k: v for k, v in stored.items() if k != "sha256"}
    canon = json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()
    assert hashlib.sha256(canon).hexdigest() == pred.sha256
    assert [c.problems for c in verify_ledger(tmp_path)] == [[]]


def test_basket_and_factors_are_frozen_into_the_prediction(tmp_path: Path) -> None:
    c = claim(
        factors=["BTC", "ETH"],
        instrument={"venue": "crypto", "symbol": "TOKS", "basket": ["TOK", "SUPA"]},
    )
    pred = build_prediction(c, "e1", date(2026, 2, 2), datetime(2026, 2, 2, 12, tzinfo=UTC))
    assert pred.factor == "BTC+ETH"
    assert pred.instrument.basket == ["TOK", "SUPA"]
    path = write_prediction(tmp_path, pred)
    assert load_prediction(path) == pred
    assert [c.problems for c in verify_ledger(tmp_path)] == [[]]


def test_grading_a_two_factor_prediction_matches_the_backtest(market: MarketData) -> None:
    c = claim(factors=["BTC", "ETH"])
    stat = run_backtest(c, market, n_boot=200).events[5]
    pred = build_prediction(
        c,
        stat.event_id,
        stat.event_date,
        datetime.combine(stat.event_date, datetime.min.time(), UTC),
    )
    outcome = grade_prediction(pred, market, datetime(2030, 1, 1, tzinfo=UTC))
    assert outcome is not None
    assert outcome.value == pytest.approx(stat.value)


# --- replications ------------------------------------------------------------------------------


def test_a_replication_can_swap_in_several_factors() -> None:
    variant = apply_changes(claim(factor="BTC"), Changes(factors=["BTC", "ETH"]))
    assert variant.factor_names == ["BTC", "ETH"]
    back = apply_changes(variant, Changes(factor="ETH"))
    assert back.factor_names == ["ETH"]
    with pytest.raises(ValidationError, match="either factor or factors"):
        Changes(factor="BTC", factors=["ETH"])
