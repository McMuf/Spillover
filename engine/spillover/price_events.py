"""Events derived from price moves: "this stock moved far more than usual today".

Some claims are triggered by a market move rather than a headline (for example, a large move in a
Korean memory-chip maker during the Seoul session, tested against US memory names in the next US
session). The rule is fixed in the taxonomy (``MOVE_LOOKBACK``, ``MOVE_SIGMA``) and uses only data
up to the day before, so an event can be recognized the moment that day's close is known.

An event is dated with the exchange's own trading date. A claim on another market then starts on
that market's first trading day on or after it, which for Seoul and New York is the same calendar
date: Seoul closes (15:30 KST, 06:30 UTC) hours before New York opens.
"""

from __future__ import annotations

from datetime import date

import numpy as np
import polars as pl

from spillover.taxonomy import MOVE_LOOKBACK, MOVE_SIGMA

SOURCE = "derived from daily returns: beyond {k:g} standard deviations of the previous {n} days"


def price_move_events(
    symbol: str,
    days: list[date],
    returns: list[float],
    lookback: int = MOVE_LOOKBACK,
    sigma: float = MOVE_SIGMA,
) -> pl.DataFrame:
    """LARGE_MOVE_UP / LARGE_MOVE_DOWN events for one symbol, on its own trading days."""
    r = np.asarray(returns, dtype=np.float64)
    rows: list[dict[str, object]] = []
    for i in range(lookback, len(r)):
        history = r[i - lookback : i]  # strictly before day i: no look-ahead
        sd = float(np.std(history, ddof=1))
        if sd <= 0 or not np.isfinite(r[i]):
            continue
        z = (r[i] - float(np.mean(history))) / sd
        if abs(z) <= sigma:
            continue
        kind = "LARGE_MOVE_UP" if z > 0 else "LARGE_MOVE_DOWN"
        rows.append(
            {
                "event_id": f"move_{symbol.lower()}_{days[i].isoformat()}",
                "event_type": kind,
                "entity": symbol,
                "date": days[i],
                "scheduled": False,
                "source": SOURCE.format(k=sigma, n=lookback),
                "extractor_version": "none",
            }
        )
    return pl.DataFrame(
        rows,
        schema={
            "event_id": pl.String,
            "event_type": pl.String,
            "entity": pl.String,
            "date": pl.Date,
            "scheduled": pl.Boolean,
            "source": pl.String,
            "extractor_version": pl.String,
        },
    )
