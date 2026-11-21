"""The last hour of market news from GDELT's raw 15-minute files, for the News tab. Display only.

GDELT's search API answers one request every 5 seconds per address, and GitHub's shared runner
addresses are almost always over that, so builds kept falling back to old headlines. GDELT also
publishes everything it reads as plain files every 15 minutes (the Global Knowledge Graph, free on
the same terms: cite and link https://www.gdeltproject.org/), served as static downloads with no
rate limit. Each file lists about 1,500 English articles with the page title, the publisher's
preview image and GDELT's own topic codes, so market news can be picked by topic (stock market,
earnings, central banks, mergers, cyberattacks...) and not only by keywords in the title.

Only the title, link, outlet, time and preview-image link are kept; never article text. Like the
search API's headlines, these are never written to the event ledger.
"""

from __future__ import annotations

import hashlib
import html
import io
import re
import zipfile
from collections import Counter
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

from spillover.ingest.gdelt import (
    MARKET_WORDS,
    MAX_URL_CHARS,
    GdeltError,
    GdeltHeadline,
    is_spam,
    tidy,
)
from spillover.ingest.http import FetchError
from spillover.ingest.outlets import tier

INDEX = "https://data.gdeltproject.org/gdeltv2/lastupdate.txt"
FILE = "https://data.gdeltproject.org/gdeltv2/{stamp}.gkg.csv.zip"
FILES = 4  # the last hour
MAX_ZIP = 32 * 2**20  # a 15-minute file is about 7 MB zipped
MAX_CSV = 96 * 2**20  # and about 21 MB unzipped
KEEP = 60
PER_OUTLET = 4  # so one busy wire site cannot fill the page
TIER_ONE_BONUS = 4  # first-tier outlets (outlets.py) rank ahead of the rest

# Column positions in GKG 2.1 (tab-separated, no quoting).
DATE, DOMAIN, URL, THEMES, IMAGE, EXTRAS = 1, 3, 4, 7, 18, 26

_STAMP = re.compile(r"/(\d{14})\.gkg\.csv\.zip\s*$", re.MULTILINE)
_TITLE = re.compile(r"<PAGE_TITLE>(.*?)</PAGE_TITLE>", re.DOTALL)
# GDELT's topic codes that mean markets, companies or the economy.
_MARKET_THEME = re.compile(r"^(ECON_|CYBER_ATTACK$|WB_\d+_CENTRAL_BANKS$|TAX_FNCACT_CEO$)")
_DOMAIN = re.compile(r"^[a-z0-9.-]{3,100}$")
# Words that make a title clearly about markets; looser ones ("AI", "tech", "deal") count less.
STRONG_WORDS = re.compile(
    r"\b(stocks?|shares|earnings|revenue|profits?|merger|acquires?|acquisition|ipo|bankruptcy|"
    r"layoffs?|job cuts|inflation|interest rates?|rate (hike|cut)s?|fed|federal reserve|"
    r"central bank|tariffs?|dollar|yields?|bonds?|oil prices?|gdp|recession|dividend|guidance|"
    r"ceo|cyberattack|data breach|outages?|recalls?|antitrust|sec|futures|nasdaq|s&p|dow|"
    r"wall street|investors?|sales)\b",
    re.IGNORECASE,
)


def latest_stamp(index: str) -> datetime:
    """The newest 15-minute file's time, from GDELT's lastupdate.txt."""
    m = _STAMP.search(index)
    if not m:
        raise GdeltError("GDELT's lastupdate.txt names no knowledge-graph file")
    return datetime.strptime(m.group(1), "%Y%m%d%H%M%S").replace(tzinfo=UTC)


def file_urls(newest: datetime, files: int = FILES) -> list[str]:
    return [
        FILE.format(stamp=(newest - timedelta(minutes=15 * i)).strftime("%Y%m%d%H%M%S"))
        for i in range(files)
    ]


def unzip(data: bytes) -> str:
    """The one CSV inside a GKG zip, refusing anything that would inflate past MAX_CSV."""
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            names = [n for n in z.namelist() if n.endswith(".gkg.csv")]
            if len(names) != 1:
                raise GdeltError("a GDELT file should hold exactly one knowledge-graph CSV")
            with z.open(names[0]) as f:
                raw = f.read(MAX_CSV + 1)
    except (zipfile.BadZipFile, OSError, EOFError) as exc:
        raise GdeltError(f"unreadable GDELT zip: {type(exc).__name__}") from None
    if len(raw) > MAX_CSV:
        raise GdeltError("a GDELT file is larger than expected; skipped")
    return raw.decode("utf-8", errors="replace")


def _themes(cell: str) -> int:
    return sum(1 for t in set(cell.split(";")) if t and _MARKET_THEME.match(t))


def parse_gkg(text: str) -> list[tuple[int, GdeltHeadline]]:
    """Market articles in one file, each with a relevance score (how many market topics)."""
    out: list[tuple[int, GdeltHeadline]] = []
    for line in text.split("\n"):
        cols = line.split("\t")
        if len(cols) <= EXTRAS:
            continue
        score = _themes(cols[THEMES])
        if score == 0:
            continue
        m = _TITLE.search(cols[EXTRAS])
        if not m:
            continue
        title = tidy(html.unescape(m.group(1)))[:300]
        url = cols[URL].strip()
        domain = cols[DOMAIN].strip().lower()
        if not title or not MARKET_WORDS.search(title) or is_spam(title):
            continue
        if not url.startswith("https://") or len(url) > MAX_URL_CHARS or not _DOMAIN.match(domain):
            continue
        try:
            when = datetime.strptime(cols[DATE], "%Y%m%d%H%M%S").replace(tzinfo=UTC)
        except ValueError:
            continue
        image = cols[IMAGE].strip()
        safe_image = image if image.startswith("https://") and len(image) <= MAX_URL_CHARS else None
        hid = "gdelt-" + hashlib.sha256(url.encode()).hexdigest()[:16]
        # A title that says it plainly ("stocks", "earnings") counts more than topic codes alone.
        loose = {m.group(0).lower() for m in MARKET_WORDS.finditer(title)}
        strong = {m.group(0).lower() for m in STRONG_WORDS.finditer(title)}
        score = min(score, 6) + len(loose) + 3 * len(strong)
        out.append((score, GdeltHeadline(hid, title, url, domain, when, safe_image)))
    return out


def _key(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", title.lower()).strip()


def pick(scored: list[tuple[int, GdeltHeadline]], keep: int = KEEP) -> list[GdeltHeadline]:
    """The most clearly market-related, at most a few per outlet, no repeats; newest first."""
    ranked = sorted(scored, key=lambda s: (-s[0], -s[1].seen_at.timestamp(), s[1].url))
    seen: set[str] = set()
    urls: set[str] = set()
    per: Counter[str] = Counter()
    chosen: list[GdeltHeadline] = []
    for _, h in ranked:
        k = _key(h.title)
        if k in seen or h.url in urls or per[h.domain] >= PER_OUTLET:
            continue
        seen.add(k)
        urls.add(h.url)
        per[h.domain] += 1
        chosen.append(h)
        if len(chosen) >= keep:
            break
    return sorted(chosen, key=lambda h: (-h.seen_at.timestamp(), h.url))


def fetch_recent(
    get_text: Callable[[str], str],
    get_bytes: Callable[[str, int], bytes],
    files: int = FILES,
) -> list[GdeltHeadline]:
    """The last hour of market headlines. A missing older file is skipped; no newest is an error."""
    urls = file_urls(latest_stamp(get_text(INDEX)), files)
    scored: list[tuple[int, GdeltHeadline]] = []
    for i, url in enumerate(urls):
        try:
            scored.extend(parse_gkg(unzip(get_bytes(url, MAX_ZIP))))
        except (FetchError, GdeltError):
            if i == 0:
                raise
    # Only the listed outlets, with the first tier ranked ahead.
    scored = [
        (s + (TIER_ONE_BONUS if tier(h.domain) == 2 else 0), h) for s, h in scored if tier(h.domain)
    ]
    if not scored:
        raise GdeltError("GDELT's latest files had no market headlines from the listed outlets")
    return pick(scored)
