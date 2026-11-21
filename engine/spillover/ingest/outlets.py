"""Which news outlets the News tab shows: established, mostly Western financial and general news.

GDELT indexes tens of thousands of sites, so without a list the page fills with whichever
outlets publish the most. Headlines are display only and never enter the record, so this choice
affects what people read, not any result. The first tier is ranked ahead of the second. The
website keeps the same lists in web/src/lib/outlets.ts, and a test keeps them identical.
"""

from __future__ import annotations

from typing import Protocol

# Financial and wire services first.
TIER_ONE: tuple[str, ...] = (
    "bloomberg.com",
    "wsj.com",
    "reuters.com",
    "ft.com",
    "economist.com",
    "nytimes.com",
    "cnbc.com",
    "marketwatch.com",
    "barrons.com",
    "apnews.com",
    "bbc.com",
    "bbc.co.uk",
    "cnn.com",
)

# Other established outlets with regular business coverage.
TIER_TWO: tuple[str, ...] = (
    "washingtonpost.com",
    "theguardian.com",
    "axios.com",
    "politico.com",
    "fortune.com",
    "forbes.com",
    "businessinsider.com",
    "finance.yahoo.com",
    "foxbusiness.com",
    "npr.org",
    "cbsnews.com",
    "nbcnews.com",
    "abcnews.go.com",
    "usatoday.com",
    "latimes.com",
    "semafor.com",
    "morningstar.com",
    "investors.com",
    "techcrunch.com",
    "theverge.com",
    "wired.com",
    "arstechnica.com",
    "theglobeandmail.com",
    "telegraph.co.uk",
    "afr.com",
)


def _matches(domain: str, outlet: str) -> bool:
    return domain == outlet or domain.endswith("." + outlet)


def tier(domain: str) -> int:
    """2 for a first-tier outlet, 1 for a second-tier one, 0 for anything else."""
    d = domain.strip().lower()
    if any(_matches(d, o) for o in TIER_ONE):
        return 2
    if any(_matches(d, o) for o in TIER_TWO):
        return 1
    return 0


class _HasDomain(Protocol):
    @property
    def domain(self) -> str: ...


def trusted[T: _HasDomain](items: list[T]) -> list[T]:
    """Only headlines from the listed outlets, in their original order."""
    return [h for h in items if tier(h.domain) > 0]
