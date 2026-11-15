"""Event-study engine. The README (Architecture, section 5) gives the reasoning for each choice.

Pipeline for one claim:

1. Select events matching the claim, locate each event's day 0 on the trading calendar.
2. Drop events without enough history, and events whose window overlaps a scheduled event.
3. Collapse events whose windows overlap, so the effective sample counts independent tests.
4. Fit the baseline over a 120 trading-day estimation window that ends 10 days before the event.
5. Abnormal return = actual minus baseline-predicted; sum over the window to get the CAR.
6. Bootstrap the mean statistic across effective events for an interval and a p-value.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import date
from typing import Any, Literal

import numpy as np
import numpy.typing as npt
import statsmodels.api as sm
from statsmodels.stats.multitest import multipletests

from spillover.data import DataError, MarketData
from spillover.models import Claim

EST_LEN = 120  # trading days in the estimation window
EST_GAP = 10  # estimation window ends this many trading days before the event
DEFAULT_BOOT = 10_000
DEFAULT_SEED = 0

FloatArray = npt.NDArray[np.float64]
Baseline = Literal["factor_only", "constant_mean"]
Measure = Literal["abnormal_return", "abs_excess_return"]


@dataclass(frozen=True)
class EventStat:
    event_id: str
    event_date: date
    day0: int
    car: float  # cumulative abnormal return over the window
    value: float  # the statistic being tested (the CAR, or |CAR| minus its typical size)
    alpha: float
    beta: float


def has_history(n_days: int, day0: int, end_offset: int) -> bool:
    """Is there a full estimation window before the event and a full event window after it?"""
    return day0 - EST_GAP - EST_LEN + 1 >= 0 and day0 + end_offset < n_days


def compute_stat(
    y: FloatArray,
    x: FloatArray | None,
    day0: int,
    end_offset: int,
    baseline: Baseline,
    measure: Measure,
) -> tuple[float, float, float, float]:
    """Return (car, value, alpha, beta) for one event. Caller must check ``has_history``."""
    est_end = day0 - EST_GAP
    est = slice(est_end - EST_LEN + 1, est_end + 1)
    win = slice(day0, day0 + end_offset + 1)

    if baseline == "factor_only":
        if x is None:
            raise DataError("baseline 'factor_only' needs a factor series")
        fit = sm.OLS(y[est], sm.add_constant(x[est])).fit()
        alpha, beta = float(fit.params[0]), float(fit.params[1])
    else:
        alpha, beta = float(np.mean(y[est])), 0.0

    def normal(slc: slice) -> FloatArray:
        base = np.full_like(y[slc], alpha)
        return base if x is None else base + beta * x[slc]

    car = float(np.sum(y[win] - normal(win)))
    if measure == "abnormal_return":
        return car, car, alpha, beta

    # abs_excess_return: compare |CAR| with the typical |CAR| of same-length windows in the
    # estimation period (rolling sums of the estimation residuals).
    resid = y[est] - normal(est)
    length = end_offset + 1
    rolling = np.convolve(resid, np.ones(length), mode="valid")
    typical = float(np.mean(np.abs(rolling)))
    return car, abs(car) - typical, alpha, beta


def collapse_overlaps(day0s: list[int], n_days_window: int) -> list[int]:
    """Keep the first of any events whose windows overlap. Input need not be sorted."""
    kept: list[int] = []
    for t in sorted(day0s):
        if not kept or t >= kept[-1] + n_days_window:
            kept.append(t)
    return kept


@dataclass(frozen=True)
class BootResult:
    mean: float
    lo: float
    hi: float
    p_value: float


def bootstrap_mean(
    values: FloatArray, n_boot: int = DEFAULT_BOOT, seed: int = DEFAULT_SEED, level: float = 0.95
) -> BootResult:
    """Percentile interval for the mean, plus a two-sided p-value for H0: mean = 0.

    The p-value comes from a bootstrap of the mean-centered sample (the null distribution), so it
    does not assume normal returns. With fewer than 2 values nothing can be said.
    """
    n = len(values)
    if n < 2:
        mean = float(values[0]) if n == 1 else float("nan")
        return BootResult(mean, float("nan"), float("nan"), 1.0)
    rng = np.random.default_rng(seed)
    mean = float(np.mean(values))
    idx = rng.integers(0, n, size=(n_boot, n))
    boot_means = values[idx].mean(axis=1)
    tail = (1.0 - level) / 2.0
    lo, hi = np.quantile(boot_means, [tail, 1.0 - tail])
    null_dev = np.abs(boot_means - mean)
    p = float((np.sum(null_dev >= abs(mean)) + 1) / (n_boot + 1))
    return BootResult(mean, float(lo), float(hi), min(p, 1.0))


def fdr_adjust(p_values: list[float]) -> list[float]:
    """Benjamini-Hochberg false-discovery-rate adjustment across a set of claims."""
    if not p_values:
        return []
    return [float(q) for q in multipletests(p_values, method="fdr_bh")[1]]


@dataclass(frozen=True)
class BacktestReport:
    claim_id: str
    statement: str
    instrument: str
    baseline: str
    measure: str
    expected_sign: str
    window_days: int
    data_root: str
    data_synthetic: bool
    as_of: date
    n_matched: int
    n_no_history: int
    n_scheduled_overlap: int
    n_overlap_collapsed: int
    n_effective: int
    min_events: int
    mean: float
    ci_lo: float
    ci_hi: float
    p_value: float
    n_boot: int
    seed: int
    verdict: str
    events: list[EventStat]

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["as_of"] = self.as_of.isoformat()
        for e in d["events"]:
            e["event_date"] = e["event_date"].isoformat()
        return d


def backtest_verdict(report_mean: float, lo: float, hi: float, n_eff: int, claim: Claim) -> str:
    """Plain-language backtest outcome. Backtests are never called 'Supported'."""
    if n_eff < claim.success.min_forward_events:
        return (
            f"Inconclusive: {n_eff} effective events, fewer than the "
            f"{claim.success.min_forward_events} the claim requires"
        )
    excludes_zero = lo > 0 or hi < 0
    sign = 1.0 if claim.expected_sign == "positive" else -1.0
    if not excludes_zero:
        return (
            "Interval includes zero: in this sample the data cannot tell the claim from no effect"
        )
    if sign * report_mean > 0:
        return (
            "Consistent with the claim in sample (interval excludes zero in the stated direction)"
        )
    return "Points the other way: interval excludes zero in the opposite direction"


def run_backtest(
    claim: Claim, data: MarketData, n_boot: int = DEFAULT_BOOT, seed: int = DEFAULT_SEED
) -> BacktestReport:
    if claim.decompose:
        raise DataError(
            "decompose (mechanical weight vs spillover) is not implemented yet; "
            "it needs index-weight data. Remove 'decompose' or wait for that milestone."
        )

    y = data.series(claim.instrument.symbol)
    x = data.series(claim.factor) if claim.baseline == "factor_only" else None
    end_offset = claim.window.end_offset
    n_days = len(data.dates)

    ev = data.events
    matched = ev.filter(
        (ev["event_type"] == claim.event_type) & ev["entity"].is_in(claim.trigger_entities)
    ).unique(subset="event_id", keep="first", maintain_order=True)

    # Scheduled events of *other* types (central-bank decisions etc.) contaminate a window.
    sched = ev.filter(ev["scheduled"] & (ev["event_type"] != claim.event_type))
    sched_idx = [i for d in sched["date"].to_list() if (i := data.day_index(d)) is not None]

    n_no_history = n_sched = 0
    candidates: dict[int, tuple[str, date]] = {}
    for event_id, when in zip(
        matched["event_id"].to_list(), matched["date"].to_list(), strict=True
    ):
        t0 = data.day_index(when)
        if t0 is None or not has_history(n_days, t0, end_offset):
            n_no_history += 1
        elif any(t0 <= s <= t0 + end_offset for s in sched_idx):
            n_sched += 1
        else:
            candidates.setdefault(t0, (event_id, when))

    kept = collapse_overlaps(list(candidates), claim.window.n_days)
    n_collapsed = len(candidates) - len(kept)

    stats: list[EventStat] = []
    for t0 in kept:
        event_id, when = candidates[t0]
        car, value, alpha, beta = compute_stat(y, x, t0, end_offset, claim.baseline, claim.measure)
        stats.append(EventStat(event_id, when, t0, car, value, alpha, beta))

    values = np.array([s.value for s in stats], dtype=np.float64)
    boot = bootstrap_mean(values, n_boot=n_boot, seed=seed)

    return BacktestReport(
        claim_id=claim.id,
        statement=" ".join(claim.statement.split()),
        instrument=f"{claim.instrument.symbol} · {claim.instrument.venue}",
        baseline=claim.baseline,
        measure=claim.measure,
        expected_sign=claim.expected_sign,
        window_days=claim.window.n_days,
        data_root=str(data.root),
        data_synthetic=data.synthetic,
        as_of=data.as_of,
        n_matched=matched.height,
        n_no_history=n_no_history,
        n_scheduled_overlap=n_sched,
        n_overlap_collapsed=n_collapsed,
        n_effective=len(stats),
        min_events=claim.success.min_forward_events,
        mean=boot.mean,
        ci_lo=boot.lo,
        ci_hi=boot.hi,
        p_value=boot.p_value,
        n_boot=n_boot,
        seed=seed,
        verdict=backtest_verdict(boot.mean, boot.lo, boot.hi, len(stats), claim),
        events=stats,
    )
