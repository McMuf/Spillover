"""Deterministic SYNTHETIC market fixtures for offline tests and local runs.

These are simulated returns, not real market data. Known effects are injected on purpose so the
engine can be checked against ground truth:

* ``SPX`` / ``MKT``: market returns with doubled volatility on FOMC decision days.
* ``XLK``: beta 1.15 to the market, no event effects (target of the placebo claim).
* ``SYN2``: beta 0.9 to the market with a -1.2% shock on ``SYN_SHOCK`` event days (tests only).

Only derived daily returns are stored, never vendor price files.
"""

from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import numpy.typing as npt
import polars as pl

SEED = 20260101
N_DAYS = 1300
START = date(2021, 1, 4)
FOMC_MONTHS = (1, 3, 5, 6, 7, 9, 11, 12)
FOMC_VOL_MULTIPLIER = 2.0
SHOCK_SIZE = -0.012
MIN_HISTORY = 140  # random events start after enough history for the estimation window

FloatArray = npt.NDArray[np.float64]


def trading_calendar() -> list[date]:
    """Synthetic calendar: every Monday to Friday, no holidays."""
    days: list[date] = []
    d = START
    while len(days) < N_DAYS:
        if d.weekday() < 5:
            days.append(d)
        d += timedelta(days=1)
    return days


def _third_wednesday(year: int, month: int) -> date:
    d = date(year, month, 1)
    while d.weekday() != 2:
        d += timedelta(days=1)
    return d + timedelta(days=14)


def _unit_t(rng: np.random.Generator, n: int, df: int = 5) -> FloatArray:
    """Fat-tailed shocks (Student t) scaled to unit variance."""
    return rng.standard_t(df, size=n) / np.sqrt(df / (df - 2))


def _spaced_indices(
    rng: np.random.Generator, lo: int, hi: int, count: int, spacing: int, avoid: set[int]
) -> list[int]:
    chosen: list[int] = []
    candidates = rng.permutation(np.arange(lo, hi))
    for c in candidates:
        i = int(c)
        if any(abs(i - a) <= 3 for a in avoid):
            continue
        if all(abs(i - j) >= spacing for j in chosen):
            chosen.append(i)
        if len(chosen) == count:
            break
    return sorted(chosen)


def generate(out_dir: Path) -> None:
    """Write ``prices.parquet``, ``events.parquet`` and ``MANIFEST.json`` into ``out_dir``."""
    rng = np.random.default_rng(SEED)
    cal = trading_calendar()
    index_of = {d: i for i, d in enumerate(cal)}

    fomc_idx = sorted(
        index_of[d]
        for year in range(START.year, cal[-1].year + 1)
        for month in FOMC_MONTHS
        if (d := _third_wednesday(year, month)) in index_of
    )

    vol = np.full(N_DAYS, 0.009)
    vol[fomc_idx] *= FOMC_VOL_MULTIPLIER
    mkt = 0.0003 + vol * _unit_t(rng, N_DAYS)

    xlk = 0.0001 + 1.15 * mkt + 0.007 * _unit_t(rng, N_DAYS)
    syn2 = 0.9 * mkt + 0.008 * _unit_t(rng, N_DAYS)

    fomc_set = set(fomc_idx)
    shock_idx = _spaced_indices(rng, MIN_HISTORY, N_DAYS - 10, 30, 20, fomc_set)
    for i in shock_idx:
        syn2[i] += SHOCK_SIZE

    random_idx = sorted(
        int(i) for i in rng.choice(np.arange(MIN_HISTORY, N_DAYS - 10), size=60, replace=False)
    )

    prices = pl.concat(
        [
            pl.DataFrame({"date": cal, "symbol": sym, "ret": series})
            for sym, series in (("MKT", mkt), ("SPX", mkt), ("XLK", xlk), ("SYN2", syn2))
        ]
    ).with_columns(pl.col("date").cast(pl.Date), pl.col("ret").cast(pl.Float64))

    def rows(kind: str, entity: str, idxs: list[int], scheduled: bool, prefix: str):
        return [
            {
                "event_id": f"{prefix}_{cal[i].isoformat()}",
                "event_type": kind,
                "entity": entity,
                "date": cal[i],
                "scheduled": scheduled,
                "source": "synthetic fixture",
            }
            for i in idxs
        ]

    events = pl.DataFrame(
        rows("FOMC_DECISION", "FED", fomc_idx, True, "fomc")
        + rows("RANDOM_DATE", "NONE", random_idx, False, "rnd")
        + rows("SYN_SHOCK", "SYNCO", shock_idx, False, "shock"),
        schema={
            "event_id": pl.String,
            "event_type": pl.String,
            "entity": pl.String,
            "date": pl.Date,
            "scheduled": pl.Boolean,
            "source": pl.String,
        },
    ).sort("date", "event_id")

    out_dir.mkdir(parents=True, exist_ok=True)
    prices.write_parquet(out_dir / "prices.parquet")
    events.write_parquet(out_dir / "events.parquet")
    manifest = {
        "synthetic": True,
        "generator": "spillover.fixtures_gen",
        "seed": SEED,
        "n_days": N_DAYS,
        "calendar": "Monday to Friday, no holidays",
        "note": "Simulated returns for offline tests. Not real market data.",
    }
    (out_dir / "MANIFEST.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
