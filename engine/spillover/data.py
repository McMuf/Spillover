"""Load cached return series and events from a data directory (Parquet, read through DuckDB)."""

from __future__ import annotations

import json
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import duckdb
import numpy as np
import numpy.typing as npt
import polars as pl

FloatArray = npt.NDArray[np.float64]


class DataError(RuntimeError):
    """Raised when required data is missing or malformed."""


@dataclass(frozen=True)
class MarketData:
    """Daily returns on the union of every symbol's trading days.

    A NaN means that symbol did not trade that day (a holiday on its own exchange). Analyses never
    use the union directly: they take ``restrict(symbols)``, the days on which all of their symbols
    traded, with each symbol's returns compounded across the days it skips.
    """

    root: Path
    synthetic: bool
    dates: list[date]
    returns: dict[str, FloatArray]
    events: pl.DataFrame

    @property
    def as_of(self) -> date:
        return self.dates[-1]

    def series(self, symbol: str) -> FloatArray:
        try:
            return self.returns[symbol]
        except KeyError:
            known = ", ".join(sorted(self.returns))
            raise DataError(
                f"no return series for {symbol!r} in {self.root} (available: {known})"
            ) from None

    def restrict(self, symbols: Iterable[str]) -> MarketData:
        """The calendar on which every one of ``symbols`` traded, with returns that stay exact.

        On a kept day, each symbol's return covers everything since the previous kept day: its own
        daily returns in between are compounded, which equals the price ratio across that span.
        When no symbol has a gap, this returns ``self`` unchanged, so single-calendar data gives
        bit-identical results.
        """
        names = list(dict.fromkeys(symbols))
        cols = [self.series(s) for s in names]
        if not cols:
            return self
        traded = ~np.isnan(np.vstack(cols))
        keep = np.flatnonzero(traded.all(axis=0))
        if len(keep) == len(self.dates):
            return self
        returns: dict[str, FloatArray] = {}
        for name, r in zip(names, cols, strict=True):
            growth = np.log1p(np.where(np.isnan(r), 0.0, r))
            cum = np.concatenate(([0.0], np.cumsum(growth)))  # cum[i + 1] = log growth to day i
            prev = np.concatenate(([keep[0] - 1], keep[:-1])) if len(keep) else keep
            returns[name] = np.expm1(cum[keep + 1] - cum[prev + 1])
        return MarketData(
            root=self.root,
            synthetic=self.synthetic,
            dates=[self.dates[i] for i in keep],
            returns=returns,
            events=self.events,
        )

    def instrument_series(self, symbol: str, basket: Sequence[str] | None = None) -> FloatArray:
        """Daily returns of an instrument; for a basket, the equal-weighted mean of its members."""
        if not basket:
            return self.series(symbol)
        return np.vstack([self.series(m) for m in basket]).mean(axis=0)

    def factor_matrix(self, names: Sequence[str]) -> FloatArray:
        """Factor returns as a (days x factors) matrix, one column per factor."""
        if not names:
            raise DataError("a factor baseline needs at least one factor series")
        return np.column_stack([self.series(n) for n in names])

    def day_index(self, when: date) -> int | None:
        """Index of the first trading day on or after ``when`` (None if past the data)."""
        lo, hi = 0, len(self.dates)
        while lo < hi:
            mid = (lo + hi) // 2
            if self.dates[mid] < when:
                lo = mid + 1
            else:
                hi = mid
        return lo if lo < len(self.dates) else None


def _read(path: Path) -> pl.DataFrame:
    if not path.exists():
        raise DataError(f"missing data file: {path}")
    with duckdb.connect() as con:
        table = con.read_parquet(str(path)).to_arrow_table()
    frame = pl.from_arrow(table)
    assert isinstance(frame, pl.DataFrame)
    return frame


def load_market_data(root: Path) -> MarketData:
    prices = _read(root / "prices.parquet")
    events = _read(root / "events.parquet")

    # Symbols may trade on different calendars (different holidays); a missing day becomes NaN.
    wide = prices.pivot(on="symbol", index="date", values="ret").sort("date")

    manifest_path = root / "MANIFEST.json"
    synthetic = False
    if manifest_path.exists():
        synthetic = bool(json.loads(manifest_path.read_text(encoding="utf-8")).get("synthetic"))

    symbols = [c for c in wide.columns if c != "date"]
    return MarketData(
        root=root,
        synthetic=synthetic,
        dates=wide["date"].to_list(),
        returns={s: wide[s].fill_null(float("nan")).to_numpy().astype(np.float64) for s in symbols},
        events=events,
    )
