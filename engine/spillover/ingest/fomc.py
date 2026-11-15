"""FOMC decision dates from the Federal Reserve's public meeting calendar.

Source: https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm (US government work,
public domain). A two-day meeting's policy decision is announced on its last day, so that is the
event date. Rows that are not scheduled meetings (such as notation votes) are skipped and counted.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date

from spillover.ingest.http import Fetcher

FOMC_URL = "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm"

_MONTHS = {
    m: i
    for i, m in enumerate(
        [
            "January",
            "February",
            "March",
            "April",
            "May",
            "June",
            "July",
            "August",
            "September",
            "October",
            "November",
            "December",
        ],
        start=1,
    )
}
_PANEL = re.compile(r'<div class="panel-heading"><h4><a[^>]*>(\d{4}) FOMC Meetings</a></h4></div>')
_ROW = re.compile(
    r"fomc-meeting__month[^>]*><strong>([^<]+)</strong></div>\s*"
    r'<div class="fomc-meeting__date[^>]*>([^<]*)</div>'
)
_RANGE = re.compile(r"^(\d{1,2})(?:-(\d{1,2}))?\*?$")


@dataclass(frozen=True)
class FomcParse:
    decisions: list[date]
    skipped: list[str] = field(default_factory=lambda: list[str]())


class FomcParseError(RuntimeError):
    """The calendar page no longer looks the way this parser expects."""


def _month_number(name: str) -> int | None:
    """Month from a full or three-letter name ("January", "Apr")."""
    key = name.strip()[:3].lower()
    return next((i for m, i in _MONTHS.items() if m[:3].lower() == key), None)


def _decision_date(year: int, month_name: str, days: str) -> date | None:
    match = _RANGE.match(days.strip())
    if match is None:
        return None
    start = int(match.group(1))
    end = int(match.group(2)) if match.group(2) else start
    # A meeting that spans two months is labelled "Apr/May" with days "30-1": the decision is
    # announced on the last day, so it belongs to the month after the slash.
    last_month = month_name.split("/")[-1]
    month = _month_number(last_month)
    if month is None:
        return None
    if "/" not in month_name and end < start:  # defensive: a rollover without the slash label
        month, year = (1, year + 1) if month == 12 else (month + 1, year)
    # A meeting spanning December/January belongs to the following year.
    if "/" in month_name and _month_number(month_name.split("/")[0]) == 12:
        year += 1
    try:
        return date(year, month, end)
    except ValueError:
        return None


def parse_fomc_calendar(page: str) -> FomcParse:
    """Extract decision dates from the calendar page's HTML."""
    parts = _PANEL.split(page)
    if len(parts) < 3:
        raise FomcParseError("no 'YYYY FOMC Meetings' sections found; the page layout changed")
    decisions: list[date] = []
    skipped: list[str] = []
    for year, body in zip(parts[1::2], parts[2::2], strict=True):
        for month_name, days in _ROW.findall(body):
            d = _decision_date(int(year), month_name, days)
            if d is None:
                skipped.append(f"{year} {month_name.strip()} {days.strip()}")
            else:
                decisions.append(d)
    if not decisions:
        raise FomcParseError("found meeting sections but no parsable meeting dates")
    return FomcParse(sorted(set(decisions)), skipped)


def fetch_fomc(fetch: Fetcher) -> FomcParse:
    return parse_fomc_calendar(fetch(FOMC_URL))
