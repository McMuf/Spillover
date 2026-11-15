"""Placebo calibration: run the engine on random dates, where nothing should show up.

If the engine rejects "no effect" far more often than the chosen significance level on random
dates, the pipeline is broken (scoring rule 7).
"""

from __future__ import annotations

import numpy as np

from spillover.data import MarketData
from spillover.eventstudy import (
    DEFAULT_SEED,
    EST_GAP,
    EST_LEN,
    Baseline,
    Measure,
    bootstrap_mean,
    collapse_overlaps,
    compute_stat,
)


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
    n_boot: int = 1000,
    seed: int = DEFAULT_SEED,
) -> float:
    """Fraction of random-date trials whose bootstrap p-value falls below ``alpha``."""
    y = data.series(symbol)
    x = data.series(factor) if baseline == "factor_only" else None
    lo = EST_GAP + EST_LEN
    hi = len(data.dates) - end_offset - 1
    rng = np.random.default_rng(seed)

    rejections = 0
    for trial in range(n_trials):
        picks = rng.choice(np.arange(lo, hi), size=n_events, replace=False)
        kept = collapse_overlaps([int(p) for p in picks], end_offset + 1)
        values = np.array(
            [compute_stat(y, x, t, end_offset, baseline, measure)[1] for t in kept],
            dtype=np.float64,
        )
        if bootstrap_mean(values, n_boot=n_boot, seed=seed + trial + 1).p_value < alpha:
            rejections += 1
    return rejections / n_trials
