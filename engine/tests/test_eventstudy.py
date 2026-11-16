from datetime import date
from pathlib import Path

import numpy as np
import pytest
import yaml

from spillover.data import DataError, MarketData
from spillover.eventstudy import (
    EST_GAP,
    EST_LEN,
    bootstrap_mean,
    collapse_overlaps,
    compute_stat,
    fdr_adjust,
    has_history,
    run_backtest,
)
from spillover.models import load_claim
from spillover.placebo import placebo_rejection_rate

from .conftest import CLAIMS
from .test_models import write


def test_collapse_overlaps_keeps_first_of_overlapping_windows() -> None:
    assert collapse_overlaps([10, 11, 30, 31, 32, 50], 2) == [10, 30, 32, 50]
    assert collapse_overlaps([5, 1, 3], 2) == [1, 3, 5]
    assert collapse_overlaps([], 2) == []


def test_has_history_boundaries() -> None:
    first_ok = EST_GAP + EST_LEN - 1
    assert not has_history(1000, first_ok - 1, 1)
    assert has_history(1000, first_ok, 1)
    assert has_history(1000, 998, 1)
    assert not has_history(1000, 999, 1)


def test_bootstrap_interval_brackets_the_mean_and_is_reproducible() -> None:
    rng = np.random.default_rng(1)
    values = rng.normal(0.01, 0.02, 60)
    a = bootstrap_mean(values, n_boot=4000, seed=7)
    b = bootstrap_mean(values, n_boot=4000, seed=7)
    assert a == b
    assert a.lo < a.mean < a.hi
    assert a.p_value < 0.01  # mean is 3 standard errors from zero


def test_bootstrap_handles_tiny_samples() -> None:
    one = bootstrap_mean(np.array([0.5]))
    assert one.p_value == 1.0
    assert np.isnan(one.lo)
    assert np.isnan(bootstrap_mean(np.array([])).mean)


def test_bootstrap_null_is_not_rejected() -> None:
    values = np.random.default_rng(3).normal(0.0, 0.02, 40)
    assert bootstrap_mean(values, n_boot=4000, seed=0).p_value > 0.05


def test_market_model_recovers_alpha_and_beta() -> None:
    rng = np.random.default_rng(5)
    n = 400
    x = rng.normal(0, 0.01, n)
    y = 0.0002 + 1.3 * x + rng.normal(0, 0.002, n)
    day0 = 300
    y[day0] += 0.05  # an obvious abnormal return on the event day
    car, value, alpha, betas = compute_stat(y, x, day0, 0, "factor_only", "abnormal_return")
    assert betas[0] == pytest.approx(1.3, abs=0.1)
    assert alpha == pytest.approx(0.0002, abs=0.001)
    assert car == pytest.approx(0.05, abs=0.01)
    assert value == car


def test_estimation_window_excludes_the_event_period() -> None:
    # A huge jump just before the event (inside the 10-day gap) must not contaminate the fit.
    rng = np.random.default_rng(6)
    n = 400
    x = rng.normal(0, 0.01, n)
    y = 1.0 * x + rng.normal(0, 0.002, n)
    day0 = 300
    y[day0 - 5] += 0.5
    _, _, _, betas = compute_stat(y, x, day0, 0, "factor_only", "abnormal_return")
    assert betas[0] == pytest.approx(1.0, abs=0.1)


def test_fdr_adjust_is_monotone_and_never_smaller() -> None:
    p = [0.001, 0.02, 0.04, 0.5]
    q = fdr_adjust(p)
    assert all(qi >= pi for qi, pi in zip(q, p, strict=True))
    assert q == sorted(q)
    assert fdr_adjust([]) == []


# --- end-to-end on the synthetic fixtures, where the truth is known -----------------------------


def test_fomc_control_claim_recovers_the_injected_volatility_effect(market: MarketData) -> None:
    report = run_backtest(load_claim(CLAIMS / "clm_fomc_abs_move_spx_v1.yaml"), market)
    assert report.data_synthetic
    assert report.n_effective >= 30
    assert report.ci_lo > 0, "FOMC days were simulated with doubled volatility"
    assert report.verdict.startswith("Consistent with the claim")


def test_placebo_claim_finds_nothing_on_random_dates(market: MarketData) -> None:
    report = run_backtest(load_claim(CLAIMS / "clm_placebo_random_dates_v1.yaml"), market)
    assert report.ci_lo < 0 < report.ci_hi
    assert report.verdict.startswith("Interval includes zero")


def test_placebo_scheduled_overlap_is_excluded(market: MarketData) -> None:
    report = run_backtest(load_claim(CLAIMS / "clm_placebo_random_dates_v1.yaml"), market)
    # Random dates that land in an FOMC window are dropped, not silently kept.
    assert report.n_scheduled_overlap > 0
    assert report.n_effective == (
        report.n_matched
        - report.n_no_history
        - report.n_scheduled_overlap
        - report.n_overlap_collapsed
    )


def test_injected_shock_effect_is_recovered_in_sign_and_size(
    market: MarketData, tmp_path: Path
) -> None:
    path = write(
        tmp_path,
        id="clm_syn_shock_v1",
        event_type="SYN_SHOCK",
        trigger_entities=["SYNCO"],
        instrument={"venue": "us_equity", "symbol": "SYN2"},
        window={"start": "first_report", "end": "+1_trading_day"},
        expected_sign="negative",
    )
    report = run_backtest(load_claim(path), market)
    assert report.ci_hi < 0
    assert report.mean == pytest.approx(-0.012, abs=0.004)
    assert report.verdict.startswith("Consistent with the claim")


def test_wrong_expected_sign_is_reported_as_pointing_the_other_way(
    market: MarketData, tmp_path: Path
) -> None:
    path = write(
        tmp_path,
        id="clm_syn_wrong_v1",
        event_type="SYN_SHOCK",
        trigger_entities=["SYNCO"],
        instrument={"venue": "us_equity", "symbol": "SYN2"},
        expected_sign="positive",
    )
    assert run_backtest(load_claim(path), market).verdict.startswith("Points the other way")


def test_too_few_events_is_inconclusive(market: MarketData, tmp_path: Path) -> None:
    path = write(
        tmp_path,
        id="clm_syn_thin_v1",
        event_type="SYN_SHOCK",
        trigger_entities=["NOBODY"],
        instrument={"venue": "us_equity", "symbol": "SYN2"},
    )
    report = run_backtest(load_claim(path), market)
    assert report.n_effective == 0
    assert report.verdict.startswith("Inconclusive")


def test_unknown_instrument_is_a_clear_error(market: MarketData, tmp_path: Path) -> None:
    path = write(tmp_path, id="clm_nope_v1", instrument={"venue": "us_equity", "symbol": "NOPE"})
    with pytest.raises(DataError, match="NOPE"):
        run_backtest(load_claim(path), market)


def test_decompose_is_refused_rather_than_ignored(market: MarketData, tmp_path: Path) -> None:
    path = write(tmp_path, id="clm_decomp_v1", decompose=["mechanical_weight", "spillover"])
    with pytest.raises(DataError, match="decompose"):
        run_backtest(load_claim(path), market)


def test_report_is_deterministic_and_serializable(market: MarketData) -> None:
    claim = load_claim(CLAIMS / "clm_fomc_abs_move_spx_v1.yaml")
    a = run_backtest(claim, market, n_boot=2000, seed=1)
    b = run_backtest(claim, market, n_boot=2000, seed=1)
    assert a.to_dict() == b.to_dict()
    assert a.to_dict()["as_of"] == date.isoformat(market.as_of)
    yaml.safe_dump(a.to_dict())  # plain types only


def test_engine_is_calibrated_on_random_dates(market: MarketData) -> None:
    """Scoring rule 7: on random dates the engine must not 'find' effects more than chance."""
    rate = placebo_rejection_rate(market, "XLK", n_trials=100, n_events=40, seed=11)
    assert rate <= 0.12, f"placebo rejection rate {rate:.1%} is far above the nominal 5%"
