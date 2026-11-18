"""Real icons for everything the site shows: news outlets, companies and contributors.

The site never draws a letter or a stand-in where a logo belongs. When the site is built, this
module finds each one's real icon, checks it is an image, and stores it with the site, so visitors'
browsers load icons from Spillover itself and never from a third party:

* **News outlets:** the outlet's own site icon, via Google's and DuckDuckGo's public favicon
  services (asked only for the outlet's domain name), keeping the sharpest one found.
* **Companies** without a bundled mark: the company's official website from Wikidata (public
  domain data: ticker on NYSE or Nasdaq -> website), then that website's icon as above.
* **Contributors:** their public GitHub profile picture.

Icons are cached between builds in data/icons (never committed). A name with no icon anywhere is
left out of the manifest, and the site leaves out what it cannot show properly (see site_export).
"""

from __future__ import annotations

import json
import re
import struct
import urllib.parse
from collections.abc import Callable, Iterable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path

from spillover.ingest.http import FetchError

ICON_DIR = Path("data/icons")
MANIFEST = "manifest.json"
MAX_ICON = 256 * 1024
MIN_BYTES = 100
GOOD_SIZE = 64  # stop looking once an icon is at least this many pixels wide
RETRY_MISSING = timedelta(days=7)

GOOGLE = (
    "https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL"
    "&url={url}&size=128"
)
DUCKDUCKGO = "https://icons.duckduckgo.com/ip3/{domain}.ico"
GITHUB_AVATAR = "https://avatars.githubusercontent.com/{handle}?size=96"
WIKIDATA = "https://query.wikidata.org/sparql"
# New York Stock Exchange and Nasdaq, so "TGT" means Target and not a namesake listed elsewhere.
EXCHANGES = ("wd:Q13677", "wd:Q82059")

# Entities that are not listed companies but have an official site.
NON_TICKER_SITES = {"BLS": "bls.gov", "FED": "federalreserve.gov", "SEC": "sec.gov"}

_DOMAIN = re.compile(
    r"^(?=.{3,100}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$"
)
_TICKER = re.compile(r"^[A-Z][A-Z0-9.]{0,9}$")
_HANDLE = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$")

GetBytes = Callable[[str, int], bytes]
GetText = Callable[[str], str]


def is_domain(name: str) -> bool:
    return bool(_DOMAIN.match(name))


def sniff(data: bytes) -> str | None:
    """The image type from its first bytes (never from a server's say-so); SVG is refused."""
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if data[:4] == b"\x00\x00\x01\x00":
        return "ico"
    if data[:3] == b"\xff\xd8\xff":
        return "jpg"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return None


def width(data: bytes, kind: str) -> int:
    """The icon's width in pixels where cheap to read; other formats count as good."""
    if kind == "png" and len(data) >= 24:
        return int(struct.unpack(">I", data[16:20])[0])
    if kind == "ico" and len(data) >= 6:
        count = struct.unpack("<H", data[4:6])[0]
        sizes = [data[6 + 16 * i] or 256 for i in range(count) if len(data) >= 6 + 16 * (i + 1)]
        return max(sizes, default=0)
    return GOOD_SIZE


def checked(data: bytes) -> tuple[str, int] | None:
    kind = sniff(data)
    if kind is None or len(data) < MIN_BYTES or len(data) > MAX_ICON:
        return None
    return kind, width(data, kind)


def best_icon(domain: str, get: GetBytes) -> tuple[bytes, str] | None:
    """The sharpest real icon for a domain, or None. A service's "not found" (404) never counts."""
    host = domain.removeprefix("www.")
    urls = [
        GOOGLE.format(url=urllib.parse.quote(f"https://{host}", safe="")),
        GOOGLE.format(url=urllib.parse.quote(f"https://www.{host}", safe="")),
        DUCKDUCKGO.format(domain=host),
        # The site's own home-screen icon (180 px) when the services only know a tiny one.
        f"https://{host}/apple-touch-icon.png",
        f"https://www.{host}/apple-touch-icon.png",
    ]
    best: tuple[bytes, str, int] | None = None
    for url in urls:
        try:
            data = get(url, MAX_ICON)
        except FetchError:
            continue
        found = checked(data)
        if found and (best is None or found[1] > best[2]):
            best = (data, found[0], found[1])
        if best and best[2] >= GOOD_SIZE:
            break
    return (best[0], best[1]) if best else None


def websites(tickers: Iterable[str], get_text: GetText) -> dict[str, str]:
    """Ticker -> the company's website domain, from Wikidata (NYSE and Nasdaq listings only)."""
    wanted = sorted({t for t in tickers if _TICKER.match(t)})
    if not wanted:
        return {}
    values = " ".join(f'"{t}"' for t in wanted)
    query = (
        "SELECT ?ticker ?website WHERE { "
        f"VALUES ?ticker {{ {values} }} VALUES ?ex {{ {' '.join(EXCHANGES)} }} "
        "?c p:P414 ?s . ?s ps:P414 ?ex ; pq:P249 ?ticker . ?c wdt:P856 ?website . }"
    )
    url = f"{WIKIDATA}?{urllib.parse.urlencode({'query': query, 'format': 'json'})}"
    try:
        rows = json.loads(get_text(url))["results"]["bindings"]
    except (ValueError, KeyError, TypeError) as exc:
        raise FetchError(f"unreadable Wikidata answer: {type(exc).__name__}") from None
    out: dict[str, str] = {}
    for row in rows:
        ticker = str(row.get("ticker", {}).get("value", ""))
        host = urllib.parse.urlsplit(str(row.get("website", {}).get("value", ""))).hostname or ""
        host = host.lower().removeprefix("www.")
        # Several websites on record: keep the shortest (the main site, not a subsite).
        if (
            ticker in wanted
            and is_domain(host)
            and (ticker not in out or len(host) < len(out[ticker]))
        ):
            out[ticker] = host
    return out


@dataclass
class Icons:
    """What the site can show: name -> icon file name inside the icon folder."""

    domains: dict[str, str] = field(default_factory=dict)
    symbols: dict[str, str] = field(default_factory=dict)
    people: dict[str, str] = field(default_factory=dict)


def _safe(name: str) -> str:
    return re.sub(r"[^a-z0-9.-]", "_", name.lower())[:100]


def _load(folder: Path) -> dict[str, dict[str, str | None]]:
    try:
        raw = json.loads((folder / MANIFEST).read_text(encoding="utf-8"))
        return {k: dict(raw.get(k, {})) for k in ("domains", "sites", "people", "checked")}
    except (OSError, ValueError, AttributeError):
        return {"domains": {}, "sites": {}, "people": {}, "checked": {}}


def resolve(
    domains: Iterable[str],
    symbols: Iterable[str],
    handles: Iterable[str],
    get_bytes: GetBytes,
    get_text: GetText,
    now: datetime,
    folder: Path = ICON_DIR,
    workers: int = 8,
) -> Icons:
    """Find (or reuse) an icon for every name; names with no icon anywhere are left out."""
    folder.mkdir(parents=True, exist_ok=True)
    cache = _load(folder)
    checked_at = cache["checked"]

    def stale(key: str, have: dict[str, str | None]) -> bool:
        if have.get(key) and (folder / str(have[key])).is_file():
            return False
        when = checked_at.get(key)
        return not when or now - datetime.fromisoformat(when) > RETRY_MISSING

    # Companies -> their websites (one Wikidata query for all new tickers).
    tickers = {s for s in symbols if _TICKER.match(s)}
    sites = cache["sites"]
    ask = [t for t in tickers if t not in NON_TICKER_SITES and stale(f"site:{t}", sites)]
    if ask:
        try:
            found = websites(ask, get_text)
        except FetchError:
            found = {}
        for t in ask:
            sites[t] = found.get(t)
            checked_at[f"site:{t}"] = now.isoformat()
    site_of = {t: NON_TICKER_SITES.get(t) or sites.get(t) for t in tickers}

    wanted = {d.lower().removeprefix("www.") for d in domains if is_domain(d.lower())}
    wanted |= {s for s in site_of.values() if s}
    have = cache["domains"]

    def fetch_domain(d: str) -> tuple[str, str | None]:
        icon = best_icon(d, get_bytes)
        if not icon:
            return d, None
        name = f"{_safe(d)}.{icon[1]}"
        (folder / name).write_bytes(icon[0])
        return d, name

    def fetch_person(h: str) -> tuple[str, str | None]:
        try:
            data = get_bytes(GITHUB_AVATAR.format(handle=h), MAX_ICON)
        except FetchError:
            return h, None
        found = checked(data)
        if not found:
            return h, None
        name = f"gh-{_safe(h)}.{found[0]}"
        (folder / name).write_bytes(data)
        return h, name

    people = cache["people"]
    new_domains = [d for d in sorted(wanted) if stale(d, have)]
    new_people = [h for h in sorted(set(handles)) if _HANDLE.match(h) and stale(f"gh:{h}", people)]
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for d, name in pool.map(fetch_domain, new_domains):
            have[d] = name
            checked_at[d] = now.isoformat()
        for h, name in pool.map(fetch_person, new_people):
            people[h] = name
            checked_at[f"gh:{h}"] = now.isoformat()

    (folder / MANIFEST).write_text(
        json.dumps({"domains": have, "sites": sites, "people": people, "checked": checked_at}),
        encoding="utf-8",
    )
    ok = {k: str(v) for k, v in have.items() if v and (folder / str(v)).is_file()}
    return Icons(
        domains={d: ok[d] for d in wanted if d in ok},
        symbols={t: ok[s] for t, s in site_of.items() if s and s in ok},
        people={
            h: str(v)
            for h, v in people.items()
            if h in set(handles) and v and (folder / str(v)).is_file()
        },
    )
