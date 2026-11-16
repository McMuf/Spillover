"""Price providers. Each returns a daily *level* series; returns are derived after alignment."""

from __future__ import annotations

import csv
import json
import urllib.parse
from datetime import date
from pathlib import Path

from spillover.ingest.http import Fetcher

Levels = dict[date, float]


class PriceError(RuntimeError):
    """A price series is missing, malformed or implausible."""


FRED_URL = "https://api.stlouisfed.org/fred/series/observations"


def parse_fred(payload: str, series_id: str) -> Levels:
    try:
        rows = json.loads(payload)["observations"]
    except (ValueError, KeyError, TypeError):
        raise PriceError(
            f"FRED series {series_id}: unexpected response (is the series id right?)"
        ) from None
    out: Levels = {}
    for row in rows:
        value = row.get("value", ".")
        if value in (".", "", None):  # FRED marks missing observations with "."
            continue
        out[date.fromisoformat(row["date"])] = float(value)
    if not out:
        raise PriceError(f"FRED series {series_id}: no observations returned")
    return out


def fred_levels(series_id: str, api_key: str, start: date, fetch: Fetcher) -> Levels:
    query = urllib.parse.urlencode(
        {
            "series_id": series_id,
            "api_key": api_key,
            "file_type": "json",
            "observation_start": start.isoformat(),
        }
    )
    return parse_fred(fetch(f"{FRED_URL}?{query}"), series_id)


FRED_RELEASE_DATES_URL = "https://api.stlouisfed.org/fred/release/dates"


def parse_release_dates(payload: str, release_id: int) -> list[date]:
    """Dates on which a FRED release (CPI, the jobs report...) came out or is scheduled to."""
    try:
        rows = json.loads(payload)["release_dates"]
        dates = sorted({date.fromisoformat(str(r["date"])) for r in rows})
    except (ValueError, KeyError, TypeError):
        raise PriceError(f"FRED release {release_id}: unexpected response") from None
    if not dates:
        raise PriceError(f"FRED release {release_id}: no release dates returned")
    return dates


def fred_release_dates(release_id: int, api_key: str, fetch: Fetcher) -> list[date]:
    query = urllib.parse.urlencode(
        {
            "release_id": release_id,
            "api_key": api_key,
            "file_type": "json",
            # The whole real-time history, and dates that are scheduled but have no data yet.
            "realtime_start": "1776-07-04",
            "realtime_end": "9999-12-31",
            "include_release_dates_with_no_data": "true",
            "sort_order": "asc",
            "limit": 10000,
        }
    )
    return parse_release_dates(fetch(f"{FRED_RELEASE_DATES_URL}?{query}"), release_id)


_PRICE_COLUMNS = ("adj close", "adj_close", "close", "price")


def read_csv_levels(path: Path) -> Levels:
    """Read a CSV export you obtained yourself: a Date column (YYYY-MM-DD) and a price column."""
    if not path.exists():
        raise PriceError(f"price file not found: {path}")
    with path.open(newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh)
        names = {(n or "").strip().lower(): n for n in (reader.fieldnames or [])}
        if "date" not in names:
            raise PriceError(f"{path}: needs a 'Date' column")
        column = next((names[c] for c in _PRICE_COLUMNS if c in names), None)
        if column is None:
            raise PriceError(f"{path}: needs one of the columns {', '.join(_PRICE_COLUMNS)}")
        out: Levels = {}
        for line_no, row in enumerate(reader, start=2):
            raw_date, raw_price = (row[names["date"]] or "").strip(), (row[column] or "").strip()
            if not raw_price:
                continue
            try:
                d = date.fromisoformat(raw_date)
                out[d] = float(raw_price.replace(",", ""))
            except ValueError:
                raise PriceError(
                    f"{path} line {line_no}: cannot read date {raw_date!r} or price {raw_price!r}"
                ) from None
    if not out:
        raise PriceError(f"{path}: no price rows")
    return out
