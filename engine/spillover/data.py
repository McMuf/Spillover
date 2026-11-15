"""Load cached return series and events from a data directory (Parquet, read through DuckDB)."""

from __future__ import annotations

import json
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

    wide = prices.pivot(on="symbol", index="date", values="ret").sort("date")
    if wide.null_count().to_numpy().sum() > 0:
        raise DataError("every symbol must have a return for every trading day")

    manifest_path = root / "MANIFEST.json"
    synthetic = False
    if manifest_path.exists():
        synthetic = bool(json.loads(manifest_path.read_text(encoding="utf-8")).get("synthetic"))

    symbols = [c for c in wide.columns if c != "date"]
    return MarketData(
        root=root,
        synthetic=synthetic,
        dates=wide["date"].to_list(),
        returns={s: wide[s].to_numpy().astype(np.float64) for s in symbols},
        events=events,
    )
