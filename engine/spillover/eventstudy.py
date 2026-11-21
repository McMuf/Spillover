"""Event-study engine. The README (Architecture, section 5) gives the reasoning for each choice.

Pipeline for one claim:

1. Select events matching the claim, locate each event's day 0 on the trading calendar.
2. Drop events without enough history, and events whose window overlaps a scheduled event.
3. Collapse events whose windows overlap, so the effective sample counts independent tests.
4. Fit the baseline over a 120 trading-day estimation window that ends 10 days before the event,
   leaving out days of other scheduled events and of the claim's own event type.
5. Abnormal return = actual minus baseline-predicted; sum over the window to get the CAR.
6. A Student-t interval and p-value for the mean statistic across effective events.
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass
from datetime import date
from typing import Any, Literal

import numpy as np
import numpy.typing as npt
import polars as pl
import statsmodels.api as sm
from scipy import stats as scipy_stats
from statsmodels.stats.multitest import multipletests

from spillover.data import DataError, MarketData
from spillover.models import Claim

EST_LEN = 120  # trading days in the estimation window
EST_GAP = 10  # estimation window ends this many trading days before the event
MIN_EST_DAYS = 60  # clean estimation days an event needs after dropping other events' days
LEVEL = 0.95  # two-sided interval level

FloatArray = npt.NDArray[np.float64]
IntArray = npt.NDArray[np.int64]
BoolArray = npt.NDArray[np.bool_]
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
    betas: tuple[float, ...]  # one per factor, in the claim's factor order (empty: constant_mean)


def matching_events(claim: Claim, data: MarketData) -> pl.DataFrame:
    """Events of the claim's type about its trigger entities. An event counts once."""
    ev = data.events
    return ev.filter(
        (ev["event_type"] == claim.event_type) & ev["entity"].is_in(claim.trigger_entities)
    ).unique(subset="event_id", keep="first", maintain_order=True)


def contaminated_days(data: MarketData, event_type: str, end_offset: int) -> BoolArray:
    """Days that are not "normal": every scheduled event (any type) and every event of the claim's
    own type, from its day 0 through the claim's window length. They are left out of estimation
    windows, so a normal day is fitted only on days with no known news of this kind (rules 0.2).
    """
    mask = np.zeros(len(data.dates), dtype=bool)
    ev = data.events
    rows = ev.filter(ev["scheduled"] | (ev["event_type"] == event_type))
    for d in rows["date"].to_list():
        i = data.day_index(d)
        if i is not None:
            mask[i : i + end_offset + 1] = True
    return mask


def estimation_days(day0: int, drop: BoolArray | None) -> IntArray:
    """Indices of the estimation window (EST_LEN days ending EST_GAP days before day 0), without
    contaminated days."""
    est_end = day0 - EST_GAP
    idx = np.arange(est_end - EST_LEN + 1, est_end + 1)
    return idx if drop is None else idx[~drop[idx]]


def has_history(n_days: int, day0: int, end_offset: int, drop: BoolArray | None = None) -> bool:
    """Is there a full estimation window before the event and a full event window after it?"""
    if not (day0 - EST_GAP - EST_LEN + 1 >= 0 and day0 + end_offset < n_days):
        return False
    return len(estimation_days(day0, drop)) >= MIN_EST_DAYS


def _as_matrix(x: FloatArray | None) -> FloatArray | None:
    """Factors as (days x k); a single 1-D series becomes one column."""
    if x is None:
        return None
    return x.reshape(-1, 1) if x.ndim == 1 else x


def compute_stat(
    y: FloatArray,
    x: FloatArray | None,
    day0: int,
    end_offset: int,
    baseline: Baseline,
    measure: Measure,
    drop: BoolArray | None = None,
) -> tuple[float, float, float, tuple[float, ...]]:
    """Return (car, value, alpha, betas) for one event. Caller must check ``has_history``.

    ``car`` is the cumulative abnormal return over the window. ``value`` is the statistic that is
    tested, centered so that 0 means "no effect":

    * ``abnormal_return``: the CAR itself.
    * ``abs_excess_return``: how the size of the move ranks among same-length windows in the
      estimation period, minus one half. +0.3 means the move was bigger than 80% of ordinary
      windows; 0 means typical. A rank, unlike a raw size difference, is close to uniform when
      nothing happens, which keeps the test honest with few events (see docs/methodology.md).

    ``x`` is one factor series (1-D) or several (days x k): the baseline is alpha + beta_1 * f_1 +
    ... + beta_k * f_k, fitted by OLS on the clean estimation days (``drop`` marks days left out).
    """
    est = estimation_days(day0, drop)
    win = slice(day0, day0 + end_offset + 1)
    xm = _as_matrix(x)

    if baseline == "factor_only":
        if xm is None:
            raise DataError("baseline 'factor_only' needs a factor series")
        fit = sm.OLS(y[est], sm.add_constant(xm[est], has_constant="add")).fit()
        alpha = float(fit.params[0])
        betas = tuple(float(b) for b in fit.params[1:])
    else:
        alpha, betas = float(np.mean(y[est])), ()

    def normal(rows: slice | IntArray) -> FloatArray:
        base = np.full(len(y[rows]), alpha)
        if xm is None or not betas:
            return base
        return base + xm[rows] @ np.asarray(betas, dtype=np.float64)

    car = float(np.sum(y[win] - normal(win)))
    if measure == "abnormal_return":
        return car, car, alpha, betas

    # abs_excess_return: rank |CAR| among |sums| of same-length runs of clean estimation days.
    length = end_offset + 1
    clean = np.zeros(len(y), dtype=bool)
    clean[est] = True
    resid = np.zeros(len(y))
    resid[est] = y[est] - normal(est)
    starts = [
        i for i in range(int(est[0]), int(est[-1]) - length + 2) if clean[i : i + length].all()
    ]
    sizes = np.abs(np.array([resid[i : i + length].sum() for i in starts]))
    if len(sizes) == 0:
        raise DataError("no clean estimation windows to compare the move with")
    rank = (np.sum(sizes < abs(car)) + 0.5 * np.sum(sizes == abs(car))) / len(sizes)
    return car, float(rank) - 0.5, alpha, betas


def collapse_overlaps(day0s: list[int], n_days_window: int) -> list[int]:
    """Keep the first of any events whose windows overlap. Input need not be sorted."""
    kept: list[int] = []
    for t in sorted(day0s):
        if not kept or t >= kept[-1] + n_days_window:
            kept.append(t)
    return kept


@dataclass(frozen=True)
class MeanTest:
    mean: float
    lo: float
    hi: float
    p_value: float


def mean_test(values: FloatArray, level: float = LEVEL) -> MeanTest:
    """Student-t interval for the mean of the per-event statistics, and the two-sided p-value for
    H0: mean = 0.

    Chosen over a percentile bootstrap because, with the 8 to 20 events claims have, a percentile
    bootstrap's interval is too narrow: in simulation it called a true null "significant" 11-18% of
    the time at a nominal 5%, while this test stays near 5% (docs/methodology.md, rules 0.2).
    With fewer than 2 values nothing can be said.
    """
    n = len(values)
    if n < 2:
        mean = float(values[0]) if n == 1 else float("nan")
        return MeanTest(mean, float("nan"), float("nan"), 1.0)
    mean = float(np.mean(values))
    se = float(np.std(values, ddof=1)) / math.sqrt(n)
    if se == 0.0:
        return MeanTest(mean, mean, mean, 0.0 if mean != 0.0 else 1.0)
    t_crit = float(scipy_stats.t.ppf(0.5 + level / 2.0, n - 1))
    p = float(2.0 * scipy_stats.t.sf(abs(mean / se), n - 1))
    return MeanTest(mean, mean - t_crit * se, mean + t_crit * se, min(p, 1.0))


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


@dataclass(frozen=True)
class WindowPath:
    """Average abnormal path around events, indexed to 100 at the start of the chart."""

    days: list[int]  # trading days relative to day 0
    mean: list[float]
    lo: list[float]  # mean minus 1.96 standard errors
    hi: list[float]
    n_events: int
    event_window_end: int  # last day of the claim's event window
    estimation_end: int  # last day of the estimation window, relative to day 0


CHART_PRE = 40  # trading days shown before the event
CHART_POST_EXTRA = 10  # trading days shown after the event window closes


def mean_window_path(claim: Claim, data: MarketData, stats: list[EventStat]) -> WindowPath | None:
    """Mean cumulative abnormal path for the evidence chart, or None if no event has full range."""
    data = data.restrict(claim.symbols)
    y = data.instrument_series(claim.instrument.symbol, claim.instrument.basket)
    x = data.factor_matrix(claim.factor_names) if claim.baseline == "factor_only" else None
    end = claim.window.end_offset
    post = end + CHART_POST_EXTRA
    days = list(range(-CHART_PRE, post + 1))
    paths: list[FloatArray] = []
    for s in stats:
        lo_i, hi_i = s.day0 - CHART_PRE, s.day0 + post
        if lo_i < 0 or hi_i > len(y) - 1:
            continue
        actual = y[lo_i : hi_i + 1]
        normal = np.full_like(actual, s.alpha)
        if x is not None and s.betas:
            normal = normal + x[lo_i : hi_i + 1] @ np.asarray(s.betas, dtype=np.float64)
        paths.append(100.0 * (1.0 + np.cumsum(actual - normal)))
    if not paths:
        return None
    arr = np.vstack(paths)
    mean = arr.mean(axis=0)
    se = arr.std(axis=0, ddof=1) / np.sqrt(len(paths)) if len(paths) > 1 else np.zeros_like(mean)
    return WindowPath(
        days=days,
        mean=[float(v) for v in mean],
        lo=[float(v) for v in mean - 1.96 * se],
        hi=[float(v) for v in mean + 1.96 * se],
        n_events=len(paths),
        event_window_end=end,
        estimation_end=-EST_GAP,
    )


def run_backtest(claim: Claim, data: MarketData) -> BacktestReport:
    if claim.decompose:
        raise DataError(
            "decompose (mechanical weight vs spillover) is not implemented yet; "
            "it needs index-weight data. Remove 'decompose' or wait for that milestone."
        )

    # The claim's own calendar: the days its instrument and factors all traded. An event dated on
    # another market's day (a Seoul close) lands on the first of these days on or after it.
    data = data.restrict(claim.symbols)
    y = data.instrument_series(claim.instrument.symbol, claim.instrument.basket)
    x = data.factor_matrix(claim.factor_names) if claim.baseline == "factor_only" else None
    end_offset = claim.window.end_offset
    n_days = len(data.dates)
    drop = contaminated_days(data, claim.event_type, end_offset)

    ev = data.events
    # Upcoming scheduled events (a real calendar lists next year's meetings) are not history.
    matched = matching_events(claim, data)
    matched = matched.filter(matched["date"] <= data.as_of)

    # Scheduled events of *other* types (central-bank decisions etc.) contaminate a window.
    sched = ev.filter(ev["scheduled"] & (ev["event_type"] != claim.event_type))
    sched_idx = [i for d in sched["date"].to_list() if (i := data.day_index(d)) is not None]

    n_no_history = n_sched = 0
    candidates: dict[int, tuple[str, date]] = {}
    for event_id, when in zip(
        matched["event_id"].to_list(), matched["date"].to_list(), strict=True
    ):
        t0 = data.day_index(when)
        if t0 is None or not has_history(n_days, t0, end_offset, drop):
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
        car, value, alpha, betas = compute_stat(
            y, x, t0, end_offset, claim.baseline, claim.measure, drop
        )
        stats.append(EventStat(event_id, when, t0, car, value, alpha, betas))

    values = np.array([s.value for s in stats], dtype=np.float64)
    boot = mean_test(values)

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
        verdict=backtest_verdict(boot.mean, boot.lo, boot.hi, len(stats), claim),
        events=stats,
    )


# --- check-ins: how the effect looks over longer horizons (descriptive, never graded) -------------

# Calendar names and their length in trading days (day 0 included).
HORIZONS: tuple[tuple[str, int], ...] = (
    ("1 week", 5),
    ("1 month", 21),
    ("6 months", 126),
    ("1 year", 252),
    ("5 years", 1260),
)
# A size rank compares the move with same-length windows inside the estimation period, so it can
# only be computed for horizons well inside that period.
MAX_RANK_DAYS = EST_LEN // 4


@dataclass(frozen=True)
class HorizonStat:
    """The claim's statistic measured over a longer window, from past events. Descriptive only."""

    label: str
    n_days: int
    n_events: int
    mean: float
    lo: float
    hi: float
    note: str | None  # why it could not be measured, when it could not


def horizon_profile(claim: Claim, data: MarketData) -> list[HorizonStat]:
    """The claim's statistic at 1 week, 1 month, 6 months, 1 year and 5 years after each past event.

    Long windows are descriptions, not tests: over months the baseline's small errors add up and
    many other things happen, so other news inside the window is *not* removed here (it would remove
    almost every event). Overlapping windows are still collapsed, so ``n_events`` counts independent
    windows, which is why long horizons have few. Never used for a verdict.
    """
    data = data.restrict(claim.symbols)
    y = data.instrument_series(claim.instrument.symbol, claim.instrument.basket)
    x = data.factor_matrix(claim.factor_names) if claim.baseline == "factor_only" else None
    n_days_total = len(data.dates)
    drop = contaminated_days(data, claim.event_type, claim.window.end_offset)
    matched = matching_events(claim, data)
    day0s = sorted(
        {
            t0
            for d in matched.filter(matched["date"] <= data.as_of)["date"].to_list()
            if (t0 := data.day_index(d)) is not None
        }
    )
    out: list[HorizonStat] = []
    nan = float("nan")
    for label, n in HORIZONS:
        if claim.measure == "abs_excess_return" and n > MAX_RANK_DAYS:
            out.append(
                HorizonStat(
                    label, n, 0, nan, nan, nan, "Size ranks cannot be measured this far out"
                )
            )
            continue
        usable = [t for t in day0s if has_history(n_days_total, t, n - 1, drop)]
        kept = collapse_overlaps(usable, n)
        measured: list[float] = []
        for t in kept:
            try:
                measured.append(
                    compute_stat(y, x, t, n - 1, claim.baseline, claim.measure, drop)[1]
                )
            except DataError:
                continue  # no clean same-length windows to rank against for this event
        res = mean_test(np.array(measured, dtype=np.float64))
        note = None
        if len(measured) < 2:
            note = (
                "No ordinary windows this long to compare with (other news days are left out)"
                if kept and claim.measure == "abs_excess_return"
                else "Not enough past events with this much data after them"
            )
        out.append(HorizonStat(label, n, len(measured), res.mean, res.lo, res.hi, note))
    return out
