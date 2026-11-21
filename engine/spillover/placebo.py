"""Placebo calibration: run the engine on random dates, where nothing should show up.

If the engine rejects "no effect" far more often than the chosen significance level on random
dates, the pipeline is broken (scoring rule 7).
"""

from __future__ import annotations

import numpy as np

from spillover.data import MarketData
from spillover.eventstudy import (
    EST_GAP,
    EST_LEN,
    Baseline,
    Measure,
    collapse_overlaps,
    compute_stat,
    mean_test,
)

SEED = 0  # which random dates are drawn; fixed so the check is reproducible


def placebo_rejection_rate(
    data: MarketData,
    symbol: str,
    *,
    factor: str = "MKT",
    baseline: Baseline = "factor_only",
    measure: Measure = "abnormal_return",
    end_offset: int = 1,
    n_events: int = 40,
    n_trials: int = 150,
    alpha: float = 0.05,
    seed: int = SEED,
) -> float:
    """Fraction of random-date trials whose p-value (the same test verdicts use) is below ``alpha``.

    On real data with no effect this should be close to ``alpha``; far above it means the test is
    too liberal, which is how the percentile bootstrap of rules 0.1 was caught (11-18% at 8 events).
    """
    data = data.restrict([symbol, factor] if baseline == "factor_only" else [symbol])
    y = data.series(symbol)
    x = data.series(factor) if baseline == "factor_only" else None
    lo = EST_GAP + EST_LEN
    hi = len(data.dates) - end_offset - 1
    rng = np.random.default_rng(seed)

    rejections = 0
    for _ in range(n_trials):
        picks = rng.choice(np.arange(lo, hi), size=n_events, replace=False)
        kept = collapse_overlaps([int(p) for p in picks], end_offset + 1)
        values = np.array(
            [compute_stat(y, x, t, end_offset, baseline, measure)[1] for t in kept],
            dtype=np.float64,
        )
        if mean_test(values).p_value < alpha:
            rejections += 1
    return rejections / n_trials
