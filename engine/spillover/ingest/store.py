"""Build the cache the engine reads: aligned daily returns, events and a manifest."""

from __future__ import annotations

import csv
import json
import re
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import polars as pl

from spillover.eventstore import (
    CONFIRMED_FILE,
    EVENTS_DIR,
    events_frame,
    load_records,
    read_confirmed,
)
from spillover.ingest.config import Config, EventsSpec, SeriesSpec
from spillover.ingest.fomc import FOMC_URL, fetch_fomc
from spillover.ingest.http import Fetcher
from spillover.ingest.prices import Levels, PriceError, fred_levels, read_csv_levels
from spillover.placebo_events import (
    BACKTEST_ONLY_PREFIX,
    PLACEBO_DIR,
    historical_draws,
    placebo_files,
)
from spillover.price_events import price_move_events

MIN_DAYS = 200  # an estimation window is 130 days; fewer than this cannot test anything
FRED_KEY_ENV = "FRED_API_KEY"
_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")
_TYPE = re.compile(r"^[A-Z][A-Z0-9_]*$")

EVENT_SCHEMA = {
    "event_id": pl.String,
    "event_type": pl.String,
    "entity": pl.String,
    "date": pl.Date,
    "scheduled": pl.Boolean,
    "source": pl.String,
    "extractor_version": pl.String,
}


class IngestError(RuntimeError):
    """Ingestion could not produce a trustworthy cache."""


@dataclass(frozen=True)
class IngestSummary:
    out: Path
    first: date
    last: date
    n_days: int
    symbols: list[str]
    # For each series, how many days of the shared calendar it did not trade (its own holidays).
    missing_days: dict[str, int]
    n_events: int
    skipped_events: list[str]


def _levels_for(spec: SeriesSpec, config: Config, env: Mapping[str, str], fetch: Fetcher) -> Levels:
    if spec.provider == "fred":
        key = env.get(FRED_KEY_ENV, "").strip()
        if not key:
            raise IngestError(
                f"{spec.symbol}: set {FRED_KEY_ENV} in your environment "
                "(free key: fred.stlouisfed.org). "
                "The key is read from the environment and never stored."
            )
        assert spec.id is not None
        return fred_levels(spec.id, key, config.data.start, fetch)
    assert spec.path is not None
    return read_csv_levels(spec.path)


SeriesReturns = tuple[list[date], list[float]]


def own_calendar_returns(
    levels: dict[str, Levels], start: date, max_abs_return: float
) -> dict[str, SeriesReturns]:
    """Simple daily returns for each series on its OWN trading days.

    Markets keep different holidays, so no day is dropped here: the engine later lines up exactly
    the series a claim needs (``MarketData.restrict``), compounding across any day one of them
    skipped, which gives the same numbers as computing returns on their shared days.
    """
    trimmed = {s: {d: v for d, v in lv.items() if d >= start} for s, lv in levels.items()}
    out: dict[str, SeriesReturns] = {}
    for symbol, lv in trimmed.items():
        if any(v <= 0 for v in lv.values()):
            bad = min(d for d, v in lv.items() if v <= 0)
            raise PriceError(f"{symbol}: non-positive price on {bad}; refusing to compute returns")
        days = sorted(lv)
        if len(days) < MIN_DAYS:
            raise IngestError(
                f"{symbol}: only {len(days)} trading days since {start}; need at least {MIN_DAYS}. "
                "Check the start date and the source."
            )
        series = [lv[d] / lv[p] - 1.0 for p, d in zip(days[:-1], days[1:], strict=True)]
        worst = max(series, key=abs)
        if abs(worst) > max_abs_return:
            when = days[1:][series.index(worst)]
            raise PriceError(
                f"{symbol}: a one-day move of {worst:+.1%} on {when} exceeds {max_abs_return:.0%}. "
                "That is usually unadjusted split or dividend data; "
                "fix the source or raise max_abs_return."
            )
        out[symbol] = (days[1:], series)
    return out


def aligned_returns(
    levels: dict[str, Levels], start: date, max_abs_return: float
) -> tuple[list[date], dict[str, list[float]], dict[str, int]]:
    """Common trading days across all series, then simple daily returns on that shared calendar.

    Kept as the reference the engine's per-claim alignment is tested against.
    """
    trimmed = {s: {d: v for d, v in lv.items() if d >= start} for s, lv in levels.items()}
    for symbol, lv in trimmed.items():
        bad = [d for d, v in lv.items() if v <= 0]
        if bad:
            raise PriceError(
                f"{symbol}: non-positive price on {min(bad)}; refusing to compute returns"
            )
    common = sorted(set.intersection(*(set(lv) for lv in trimmed.values())))
    dropped = {s: len(lv) - len(common) for s, lv in trimmed.items()}
    if len(common) < MIN_DAYS:
        raise IngestError(
            f"only {len(common)} shared trading days across {sorted(trimmed)}; "
            f"need at least {MIN_DAYS}. "
            "Check the start date and that every series covers the same period."
        )
    returns: dict[str, list[float]] = {}
    for symbol, lv in trimmed.items():
        series = [lv[d] / lv[prev] - 1.0 for prev, d in zip(common[:-1], common[1:], strict=True)]
        worst = max(series, key=abs)
        if abs(worst) > max_abs_return:
            when = common[1:][series.index(worst)]
            raise PriceError(
                f"{symbol}: a one-day move of {worst:+.1%} on {when} exceeds {max_abs_return:.0%}. "
                "That is usually unadjusted split or dividend data; "
                "fix the source or raise max_abs_return."
            )
        returns[symbol] = series
    return common[1:], returns, dropped


def read_events_csv(path: Path) -> pl.DataFrame:
    if not path.exists():
        raise IngestError(f"events file not found: {path}")
    rows: list[dict[str, object]] = []
    with path.open(newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh)
        missing = {"event_id", "event_type", "entity", "date", "source"} - {
            (n or "").strip() for n in reader.fieldnames or []
        }
        if missing:
            raise IngestError(f"{path}: missing column(s) {', '.join(sorted(missing))}")
        for line_no, raw in enumerate(reader, start=2):
            row = {(k or "").strip(): (v or "").strip() for k, v in raw.items()}
            if not _NAME.match(row["event_id"]) or not _TYPE.match(row["event_type"]):
                raise IngestError(
                    f"{path} line {line_no}: bad event_id or event_type "
                    "(types are UPPER_SNAKE_CASE)"
                )
            if not row["entity"] or not row["source"]:
                raise IngestError(
                    f"{path} line {line_no}: entity and source are required "
                    "(no event without a source)"
                )
            try:
                when = date.fromisoformat(row["date"])
            except ValueError:
                raise IngestError(f"{path} line {line_no}: date must be YYYY-MM-DD") from None
            rows.append(
                {
                    "event_id": row["event_id"],
                    "event_type": row["event_type"],
                    "entity": row["entity"],
                    "date": when,
                    "scheduled": row.get("scheduled", "").lower() in ("1", "true", "yes"),
                    "source": row["source"],
                    "extractor_version": "none",
                }
            )
    return pl.DataFrame(rows, schema=EVENT_SCHEMA)


def build_events(
    specs: list[EventsSpec],
    fetch: Fetcher,
    returns: Mapping[str, SeriesReturns] | None = None,
    history: tuple[date, date] | None = None,
) -> tuple[pl.DataFrame, list[str], list[str]]:
    """All configured events. ``history`` = (data start, today) adds past placebo months."""
    frames: list[pl.DataFrame] = []
    skipped: list[str] = []
    sources: list[str] = []
    for spec in specs:
        if spec.type == "fomc":
            parsed = fetch_fomc(fetch)
            skipped += [f"FOMC row skipped (not a scheduled decision): {s}" for s in parsed.skipped]
            sources.append(FOMC_URL)
            frames.append(
                pl.DataFrame(
                    {
                        "event_id": [f"fomc_{d.isoformat()}" for d in parsed.decisions],
                        "event_type": ["FOMC_DECISION"] * len(parsed.decisions),
                        "entity": ["FED"] * len(parsed.decisions),
                        "date": parsed.decisions,
                        "scheduled": [True] * len(parsed.decisions),
                        "source": [FOMC_URL] * len(parsed.decisions),
                        "extractor_version": ["none"] * len(parsed.decisions),
                    },
                    schema=EVENT_SCHEMA,
                )
            )
        elif spec.type == "placebo":
            root = spec.path or PLACEBO_DIR
            files = placebo_files(root)
            sources.append(str(root))
            frames.extend(read_events_csv(f) for f in files)
            if history is not None:
                have = {(int(f.stem[:4]), int(f.stem[5:7])) for f in files}
                past = historical_draws(history[0], history[1], have)
                frames.append(
                    pl.DataFrame(
                        {
                            "event_id": [f"{BACKTEST_ONLY_PREFIX}{d.isoformat()}" for d in past],
                            "event_type": ["RANDOM_DATE"] * len(past),
                            "entity": ["NONE"] * len(past),
                            "date": past,
                            "scheduled": [False] * len(past),
                            "source": ["placebo draw for a past month (backtests only)"]
                            * len(past),
                            "extractor_version": ["none"] * len(past),
                        },
                        schema=EVENT_SCHEMA,
                    )
                )
        elif spec.type == "price_moves":
            assert spec.symbol is not None
            if returns is None or spec.symbol not in returns:
                raise IngestError(
                    f"price_moves watches {spec.symbol!r}, which is not a configured series"
                )
            days, series = returns[spec.symbol]
            sources.append(f"price moves of {spec.symbol}")
            frames.append(price_move_events(spec.symbol, days, series))
        elif spec.type == "store":
            root = spec.path or EVENTS_DIR
            built = events_frame(
                load_records(root), read_confirmed(spec.confirmed or CONFIRMED_FILE), EVENT_SCHEMA
            )
            if built.n_needs_review:
                skipped.append(
                    f"{built.n_needs_review} low-confidence event(s) excluded until confirmed "
                    f"in {spec.confirmed or CONFIRMED_FILE}"
                )
            sources.append(str(root))
            frames.append(built.events)
        else:
            assert spec.path is not None
            sources.append(str(spec.path))
            frames.append(read_events_csv(spec.path))
    if not frames:
        return pl.DataFrame(schema=EVENT_SCHEMA), skipped, sources
    events = pl.concat(frames)
    dupes = events.filter(events.select("event_id", "entity").is_duplicated())
    if dupes.height:
        raise IngestError(
            f"duplicate (event_id, entity) pairs: {sorted(set(dupes['event_id'].to_list()))[:5]}"
        )
    return events.sort("date", "event_id"), skipped, sources


def build_cache(
    config: Config, fetch: Fetcher, env: Mapping[str, str], today: date
) -> IngestSummary:
    real = [s for s in config.series if s.provider != "alias"]
    levels = {s.symbol: _levels_for(s, config, env, fetch) for s in real}
    per_series = own_calendar_returns(levels, config.data.start, config.data.max_abs_return)
    for s in config.series:
        if s.provider == "alias":
            assert s.of is not None
            per_series[s.symbol] = per_series[s.of]
    days = sorted({d for ds, _ in per_series.values() for d in ds})
    missing = {sym: len(days) - len(ds) for sym, (ds, _) in per_series.items()}
    events, skipped, event_sources = build_events(
        config.events, fetch, per_series, history=(config.data.start, today)
    )

    # Long format, each series on its own days; the loader fills the gaps with "did not trade".
    prices = pl.concat(
        [
            pl.DataFrame({"date": ds, "symbol": sym, "ret": series})
            for sym, (ds, series) in per_series.items()
        ]
    ).with_columns(pl.col("date").cast(pl.Date), pl.col("ret").cast(pl.Float64))

    out = config.data.out
    out.mkdir(parents=True, exist_ok=True)
    prices.write_parquet(out / "prices.parquet")
    events.write_parquet(out / "events.parquet")
    manifest = {
        "synthetic": False,
        "note": "Derived daily returns only. No vendor price files are stored.",
        "fetched_through": days[-1].isoformat(),
        "ingested_on": today.isoformat(),
        "series": [
            {
                "symbol": s.symbol,
                "provider": s.provider,
                "id": s.id or (str(s.path) if s.path else s.of),
            }
            for s in config.series
        ],
        "event_sources": event_sources,
    }
    (out / "MANIFEST.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return IngestSummary(
        out, days[0], days[-1], len(days), sorted(per_series), missing, events.height, skipped
    )
