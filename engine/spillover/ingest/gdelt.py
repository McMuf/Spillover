"""Latest market headlines from the GDELT Project, for the News tab. Display only.

GDELT indexes news articles from outlets worldwide and publishes them free "for any academic,
commercial, or governmental use", asking only for a citation and a link
(https://www.gdeltproject.org/). Only a headline's title, link, outlet and time are used, never
article text.

These headlines are fetched when the site is built and are NOT written to the event ledger: the
free labeler was built on regulator press releases, and on general news it makes more mistakes. A
wrong label in the ledger would freeze wrong predictions, so general news gets a "testable" tag on
the site and is offered for labeling until its measured accuracy holds up.
"""

from __future__ import annotations

import hashlib
import json
import re
import time
import urllib.parse
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

from spillover.extractor import clean_title
from spillover.ingest.http import Fetcher, FetchError

DOC_API = "https://api.gdeltproject.org/api/v2/doc/doc"
# Market-moving topics, in English. GDELT's query language needs parentheses around OR lists.
QUERY = (
    '(stocks OR "stock market" OR earnings OR merger OR acquisition OR bankruptcy OR layoffs OR '
    'cyberattack OR outage OR recall OR tariff OR "interest rate" OR inflation OR CEO OR SEC OR '
    '"Federal Reserve") sourcelang:english'
)
MAX_RECORDS = 75
KEEP = 50
MAX_URL_CHARS = 500


class GdeltError(RuntimeError):
    """GDELT's response could not be read."""


@dataclass(frozen=True)
class GdeltHeadline:
    headline_id: str
    title: str
    url: str
    domain: str
    seen_at: datetime


def doc_url(query: str = QUERY, timespan: str = "1d", max_records: int = MAX_RECORDS) -> str:
    q = urllib.parse.urlencode(
        {
            "query": query,
            "mode": "artlist",
            "format": "json",
            "maxrecords": str(max_records),
            "timespan": timespan,
            "sort": "datedesc",
        }
    )
    return f"{DOC_API}?{q}"


_SPACE_BEFORE = re.compile(r"\s+([,.:;!?%)])")
_SPACE_AFTER = re.compile(r"([(])\s+")


# A syndicating outlet's own name tacked on the end: "... CEO Huang Exit | Newsradio WFLA Orlando".
_OUTLET_SUFFIX = re.compile(r"\s+[|]\s+[^|]{1,60}$")


def tidy(title: str) -> str:
    """GDELT tokenizes titles ("tech issues , experts say"); put the punctuation back, and drop
    a trailing "| Outlet name"."""
    t = _SPACE_AFTER.sub(r"\1", _SPACE_BEFORE.sub(r"\1", title))
    return _OUTLET_SUFFIX.sub("", clean_title(t))


def _key(title: str) -> str:
    """Near-duplicate key: the same wire story syndicated by many outlets reads the same."""
    return re.sub(r"[^a-z0-9]+", " ", title.lower()).strip()


# Law-firm class-action notices flood business wires and are not news about the company.
_SPAM = re.compile(
    r"\b(shareholder|investor)s?\s+alert\b|lead plaintiff|class action|deadline alert|"
    r"\binvestigation on behalf of\b",
    re.IGNORECASE,
)
# Words that make a headline about markets or the economy.
MARKET_WORDS = re.compile(
    r"\b(stocks?|shares?|markets?|investors?|earnings|profits?|revenue|sales|guidance|forecast|"
    r"merger|acquisitions?|acquires?|buyout|deal|bankruptcy|layoffs?|jobs|hiring|ceo|cfo|"
    r"chief executive|board|tariffs?|trade|inflation|interest rates?|rates?|fed|federal reserve|"
    r"central bank|economy|economic|recession|gdp|bonds?|yields?|dollar|oil|prices?|"
    r"cyberattack|hack(ed|ers)?|breach|outages?|disruptions?|grounded|airlines?|flights?|tech|"
    r"technology|recall|antitrust|lawsuit|regulators?|sec|ftc|"
    r"ipo|dividend|chips?|semiconductors?|banks?|crypto|bitcoin|ai)\b",
    re.IGNORECASE,
)


def is_spam(title: str) -> bool:
    return bool(_SPAM.search(title))


def parse_doc(text: str, keep: int = KEEP) -> list[GdeltHeadline]:
    try:
        body = json.loads(text)
    except ValueError:
        # GDELT answers a malformed query or a rate limit with a plain-text message.
        raise GdeltError(f"GDELT did not return JSON: {text.strip()[:120]!r}") from None
    articles = body.get("articles", []) if isinstance(body, dict) else None
    if not isinstance(articles, list):
        raise GdeltError("GDELT's response has no article list")
    out: list[GdeltHeadline] = []
    seen: set[str] = set()
    for a in articles:
        if not isinstance(a, dict):
            continue
        title = tidy(str(a.get("title", "")))
        url = str(a.get("url", "")).strip()
        domain = str(a.get("domain", "")).strip().lower()
        try:
            when = datetime.strptime(str(a.get("seendate", "")), "%Y%m%dT%H%M%SZ").replace(
                tzinfo=UTC
            )
        except ValueError:
            continue
        if not title or not url.startswith("https://") or len(url) > MAX_URL_CHARS or not domain:
            continue
        if is_spam(title):
            continue
        key = _key(title)
        if key in seen:
            continue
        seen.add(key)
        hid = "gdelt-" + hashlib.sha256(url.encode()).hexdigest()[:16]
        out.append(GdeltHeadline(hid, title[:300], url, domain[:100], when))
        if len(out) >= keep:
            break
    return out


RETRIES = 3
RETRY_WAIT = 8.0  # seconds; GDELT asks for at most one request every 5 seconds per address


def fetch_headlines(
    fetch: Fetcher,
    timespan: str = "1d",
    sleep: Callable[[float], None] | None = None,
) -> list[GdeltHeadline]:
    """One query, retried a few times on "too many requests" (shared CI addresses hit it)."""
    url = doc_url(timespan=timespan)
    for attempt in range(RETRIES):
        try:
            return parse_doc(fetch(url))
        except FetchError as exc:
            if "HTTP 429" not in str(exc) or attempt == RETRIES - 1:
                raise
            (sleep or time.sleep)(RETRY_WAIT * (attempt + 1))
    raise AssertionError("unreachable")


# --- the last good fetch, reused when GDELT refuses a build ---------------------------------------

CACHE_FILE = Path("data/headlines.json")  # data/ is never committed
CACHE_MAX_AGE = timedelta(hours=36)


def save_cache(items: list[GdeltHeadline], path: Path, now: datetime) -> None:
    rows = [
        {
            "headline_id": h.headline_id,
            "title": h.title,
            "url": h.url,
            "domain": h.domain,
            "seen_at": h.seen_at.isoformat(),
        }
        for h in items
    ]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({"fetched_at": now.isoformat(), "headlines": rows}), encoding="utf-8"
    )


def load_cache(path: Path, now: datetime) -> list[GdeltHeadline] | None:
    """The previous build's headlines, or None if missing, unreadable or older than 36 hours."""
    try:
        body = json.loads(path.read_text(encoding="utf-8"))
        if now - datetime.fromisoformat(body["fetched_at"]) > CACHE_MAX_AGE:
            return None
        return [
            GdeltHeadline(
                str(r["headline_id"]),
                str(r["title"]),
                str(r["url"]),
                str(r["domain"]),
                datetime.fromisoformat(r["seen_at"]),
            )
            for r in body["headlines"]
            if str(r["url"]).startswith("https://")
        ]
    except (OSError, ValueError, KeyError, TypeError):
        return None
