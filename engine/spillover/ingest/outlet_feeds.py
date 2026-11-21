"""The News tab's main source: the public RSS feeds of established financial and news outlets.

GDELT, the other source, indexes tens of thousands of sites but rarely the big paywalled outlets,
so the tab used to fill with whichever sites publish the most. These feeds come straight from
the outlets. Only titles, links, times and preview-image links are kept, and only for display:
headlines never enter the record. Each feed is fetched over https with the usual limits, and an
item whose link points outside its outlet is dropped. A feed that fails is skipped; the others
still show.
"""

from __future__ import annotations

import hashlib
import re
from collections import Counter
from collections.abc import Callable
from datetime import datetime, timedelta
from urllib.parse import urlsplit

from spillover.ingest.gdelt import GdeltHeadline, is_spam
from spillover.ingest.headlines import FeedError, parse_feed
from spillover.ingest.http import FetchError
from spillover.ingest.outlets import tier

# (outlet domain, feed url). Checked to be live in November 2026; Reuters, AP and CNN publish no
# working public feed, so they appear only through GDELT.
FEEDS: tuple[tuple[str, str], ...] = (
    ("bloomberg.com", "https://www.bloomberg.com/feeds/markets/news.rss"),
    ("bloomberg.com", "https://www.bloomberg.com/feeds/economics/news.rss"),
    ("wsj.com", "https://feeds.content.dowjones.io/public/rss/RSSMarketsMain"),
    ("wsj.com", "https://feeds.content.dowjones.io/public/rss/WSJcomUSBusiness"),
    ("wsj.com", "https://feeds.content.dowjones.io/public/rss/socialeconomyfeed"),
    ("nytimes.com", "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml"),
    ("nytimes.com", "https://rss.nytimes.com/services/xml/rss/nyt/Economy.xml"),
    ("ft.com", "https://www.ft.com/rss/home"),
    ("ft.com", "https://www.ft.com/markets?format=rss"),
    ("economist.com", "https://www.economist.com/finance-and-economics/rss.xml"),
    ("economist.com", "https://www.economist.com/business/rss.xml"),
    ("bbc.com", "https://feeds.bbci.co.uk/news/business/rss.xml"),
    ("cnbc.com", "https://www.cnbc.com/id/100003114/device/rss/rss.html"),
    ("cnbc.com", "https://www.cnbc.com/id/20910258/device/rss/rss.html"),
    ("marketwatch.com", "https://feeds.content.dowjones.io/public/rss/mw_topstories"),
    ("theguardian.com", "https://www.theguardian.com/uk/business/rss"),
    ("washingtonpost.com", "https://feeds.washingtonpost.com/rss/business"),
    ("axios.com", "https://api.axios.com/feed/"),
    ("npr.org", "https://feeds.npr.org/1006/rss.xml"),
    ("cbsnews.com", "https://www.cbsnews.com/latest/rss/moneywatch"),
    ("fortune.com", "https://fortune.com/feed/"),
)

MAX_AGE = timedelta(hours=72)  # The Economist is weekly
PER_OUTLET = 4  # so every outlet gets a turn before the page fills
KEEP = 80
TIER_ONE_BONUS = timedelta(hours=3)  # first-tier outlets sort as if a little newer

_BBC = ("bbc.com", "bbc.co.uk")


def _belongs(url: str, domain: str) -> bool:
    host = (urlsplit(url).hostname or "").lower()
    allowed = _BBC if domain in _BBC else (domain,)
    return any(host == d or host.endswith("." + d) for d in allowed)


def _key(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", title.lower()).strip()


def fetch_outlet_headlines(
    get_text: Callable[[str], str],
    now: datetime,
    feeds: tuple[tuple[str, str], ...] = FEEDS,
) -> tuple[list[GdeltHeadline], list[tuple[str, str]]]:
    """Recent headlines from every feed that answers, and (outlet, reason) for each that did not."""
    found: list[GdeltHeadline] = []
    failed: list[tuple[str, str]] = []
    for domain, url in feeds:
        try:
            parsed = parse_feed(get_text(url), domain)
        except (FetchError, FeedError) as exc:
            failed.append((domain, str(exc)[:80]))
            continue
        for h in parsed.headlines:
            link = h.url.strip()
            if not link.startswith("https://") or not _belongs(link, domain) or is_spam(h.title):
                continue
            # Recent, allowing an hour of clock difference with the outlet.
            if not -timedelta(hours=1) <= now - h.published_at <= MAX_AGE:
                continue
            hid = "feed-" + hashlib.sha256(link.encode()).hexdigest()[:16]
            image = parsed.images.get(h.headline_id)
            found.append(GdeltHeadline(hid, h.title[:300], link, domain, h.published_at, image))
    return pick(found), failed


def pick(items: list[GdeltHeadline], keep: int = KEEP) -> list[GdeltHeadline]:
    """Newest first (first-tier outlets nudged ahead), a few per outlet, no repeated stories."""

    def rank(h: GdeltHeadline) -> datetime:
        return h.seen_at + (TIER_ONE_BONUS if tier(h.domain) == 2 else timedelta(0))

    seen: set[str] = set()
    urls: set[str] = set()
    per: Counter[str] = Counter()
    chosen: list[GdeltHeadline] = []
    for h in sorted(items, key=lambda h: (rank(h), h.url), reverse=True):
        k = _key(h.title)
        if k in seen or h.url in urls or per[h.domain] >= PER_OUTLET:
            continue
        seen.add(k)
        urls.add(h.url)
        per[h.domain] += 1
        chosen.append(h)
        if len(chosen) >= keep:
            break
    return sorted(chosen, key=lambda h: (h.seen_at, h.url), reverse=True)


def merge(
    primary: list[GdeltHeadline], extra: list[GdeltHeadline], keep: int = KEEP
) -> list[GdeltHeadline]:
    """The outlets' own feeds first, topped up with GDELT's (already listed-outlet) headlines."""
    seen = {_key(h.title) for h in primary} | {h.url for h in primary}
    per = Counter(h.domain for h in primary)
    out = list(primary)
    for h in extra:
        if len(out) >= keep:
            break
        if h.url in seen or _key(h.title) in seen or per[h.domain] >= PER_OUTLET:
            continue
        seen |= {h.url, _key(h.title)}
        per[h.domain] += 1
        out.append(h)
    return sorted(out, key=lambda h: (h.seen_at, h.url), reverse=True)
