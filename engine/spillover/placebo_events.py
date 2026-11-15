"""Pre-registered random dates for the permanent placebo claim.

The placebo asks whether the engine "finds" effects on dates where nothing special happens. For
that to be a fair control the dates must be drawn *before* they occur and committed, exactly like a
real forward event; drawing them afterwards would let hindsight in. So:

* Dates are drawn only for months that start strictly after today, so every one is in the future.
* A month's draw is deterministic from a public seed and the month, and written once to
  ``events/placebo/YYYY-MM.csv``. An existing month file is never rewritten (append-only).
* The seed is public on purpose: the guarantee is the commit time, not secrecy.

Dates are weekdays. Holidays are not known in advance, so a draw that lands on one is scored on the
next trading day, which is how every event on a non-trading day is treated.
"""

from __future__ import annotations

import calendar
import random
from datetime import date
from pathlib import Path

PLACEBO_SEED = "spillover-placebo-v1"
PLACEBO_DIR = Path("events/placebo")
PLACEBO_TYPE = "RANDOM_DATE"
PLACEBO_ENTITY = "NONE"
SOURCE = "https://github.com/McMuf/Spillover/tree/main/events/placebo"
HEADER = "event_id,event_type,entity,date,scheduled,source"


def weekdays_of(year: int, month: int) -> list[date]:
    last = calendar.monthrange(year, month)[1]
    return [date(year, month, d) for d in range(1, last + 1) if date(year, month, d).weekday() < 5]


def month_draw(year: int, month: int, per_month: int, seed: str = PLACEBO_SEED) -> list[date]:
    """The month's random weekdays: the same inputs always give the same dates."""
    days = weekdays_of(year, month)
    rng = random.Random(f"{seed}:{year:04d}-{month:02d}")
    return sorted(rng.sample(days, min(per_month, len(days))))


def month_file(root: Path, year: int, month: int) -> Path:
    return root / f"{year:04d}-{month:02d}.csv"


def _next_month(year: int, month: int) -> tuple[int, int]:
    return (year + 1, 1) if month == 12 else (year, month + 1)


def render(dates: list[date]) -> str:
    rows = [
        f"rnd_{d.isoformat()},{PLACEBO_TYPE},{PLACEBO_ENTITY},{d.isoformat()},false,{SOURCE}"
        for d in dates
    ]
    return "\n".join([HEADER, *rows]) + "\n"


def ensure_future_draws(
    root: Path,
    today: date,
    months_ahead: int = 3,
    per_month: int = 4,
    seed: str = PLACEBO_SEED,
) -> list[Path]:
    """Write draws for the next ``months_ahead`` whole months that have none yet.

    Returns the files created. Months that already have a file are left exactly as they are, and
    the current month is never drawn: part of it has already happened.
    """
    created: list[Path] = []
    year, month = _next_month(today.year, today.month)
    for _ in range(months_ahead):
        path = month_file(root, year, month)
        if not path.exists():
            root.mkdir(parents=True, exist_ok=True)
            with path.open("x", encoding="utf-8") as fh:
                fh.write(render(month_draw(year, month, per_month, seed)))
            created.append(path)
        year, month = _next_month(year, month)
    return created


def placebo_files(root: Path) -> list[Path]:
    return sorted(root.glob("????-??.csv")) if root.exists() else []
