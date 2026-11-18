"""Company events from SEC 8-K filings: the event type comes from the filing's own item number.

A listed US company must file a Form 8-K within four business days of certain events, and each
filing says which numbered items it reports. For a few items the item number alone fixes the event
type, with no reading of text and so nothing to label or review:

    1.03  Bankruptcy or Receivership                         -> BANKRUPTCY
    1.05  Material Cybersecurity Incidents                   -> CYBER_INCIDENT
    3.01  Notice of Delisting or Failure to Satisfy a Rule   -> DELISTING_NOTICE
    4.02  Non-Reliance on Previously Issued Financial Stmts  -> RESTATEMENT

Other items are ambiguous on their own (5.02 covers a CEO leaving and a director's pay change
alike), so they are ignored rather than guessed. Amendments (8-K/A) are ignored: they repeat an
event that was already filed.

Source: EDGAR's "latest filings" Atom feed. SEC data is a US government work (public domain). SEC
asks automated clients to declare themselves with a contact email in the User-Agent and to stay
under 10 requests per second; a run makes a handful of requests.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from xml.etree.ElementTree import Element

from defusedxml import ElementTree as SafeET
from defusedxml.common import DefusedXmlException

from spillover.eventstore import EventRecord, append_records, load_records, make_record
from spillover.ingest.http import Fetcher, FetchError

# The item -> event type rule. Part of the event definitions: changing it is a rules change.
ITEMS: dict[str, tuple[str, str]] = {
    "1.03": ("BANKRUPTCY", "Bankruptcy or Receivership"),
    "1.05": ("CYBER_INCIDENT", "Material Cybersecurity Incidents"),
    "3.01": ("DELISTING_NOTICE", "Notice of Delisting or Failure to Satisfy a Listing Rule"),
    "4.02": ("RESTATEMENT", "Non-Reliance on Previously Issued Financial Statements"),
}
RULES_VERSION = "sec-8k-items/1"
SOURCE = "sec-8k"
PAGE_SIZE = 100  # the most EDGAR's feed returns per request
TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"

_ITEM = re.compile(r"\bItem\s+(\d\.\d{2})\b")
_ACCESSION = re.compile(r"\b(\d{10}-\d{2}-\d{6})\b")
_TITLE = re.compile(r"^(?P<form>\S+)\s+-\s+(?P<name>.+?)\s+\((?P<cik>\d{10})\)")


class FilingsError(RuntimeError):
    """The filings feed or the ticker list could not be read."""


@dataclass(frozen=True)
class Filing:
    accession: str
    cik: int
    company: str
    form: str
    items: tuple[str, ...]
    accepted_at: datetime
    url: str


def current_url(form: str, start: int) -> str:
    return (
        "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent"
        f"&type={form}&company=&dateb=&owner=include&start={start}&count={PAGE_SIZE}&output=atom"
    )


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _text(entry: Element, name: str) -> str:
    for child in entry:
        if _local(child.tag) == name:
            return "".join(child.itertext()).strip()
    return ""


def _link(entry: Element) -> str:
    for child in entry:
        if _local(child.tag) == "link" and child.get("rel", "alternate") == "alternate":
            return (child.get("href") or "").strip()
    return ""


def _time(raw: str) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed.astimezone(UTC) if parsed.tzinfo else None


def parse_current(text: str) -> tuple[list[Filing], int]:
    """Filings in one page of the feed, and the number of entries on the page."""
    if text.lstrip().lower().startswith(("<!doctype html", "<html")):
        raise FilingsError("SEC returned a web page instead of the feed")
    try:
        root = SafeET.fromstring(text.lstrip("﻿").encode("utf-8"))
    except (SafeET.ParseError, DefusedXmlException, ValueError) as exc:
        raise FilingsError(f"not a readable filings feed ({type(exc).__name__})") from None
    entries = [e for e in root if _local(e.tag) == "entry"]
    out: list[Filing] = []
    for e in entries:
        m = _TITLE.match(_text(e, "title"))
        when = _time(_text(e, "updated"))
        url = _link(e)
        acc = _ACCESSION.search(_text(e, "id")) or _ACCESSION.search(_text(e, "summary"))
        if not (m and when and acc and url.startswith("https://www.sec.gov/")):
            continue
        items = tuple(dict.fromkeys(_ITEM.findall(_text(e, "summary"))))
        out.append(
            Filing(acc.group(1), int(m["cik"]), m["name"], m["form"], items, when, url[:500])
        )
    return out, len(entries)


def parse_tickers(text: str) -> dict[int, str]:
    """CIK -> primary ticker from SEC's company_tickers.json (the first listed share class)."""
    try:
        raw = json.loads(text)
        rows = raw.values() if isinstance(raw, dict) else raw
        out: dict[int, str] = {}
        for row in rows:
            ticker = str(row["ticker"]).upper()
            if re.fullmatch(r"[A-Z0-9][A-Z0-9.-]{0,9}", ticker):
                out.setdefault(int(row["cik_str"]), ticker)
    except (ValueError, TypeError, KeyError, AttributeError):
        raise FilingsError("SEC's ticker list is not in the expected format") from None
    if len(out) < 1000:
        raise FilingsError(f"SEC's ticker list has only {len(out)} companies; refusing to use it")
    return out


@dataclass(frozen=True)
class FilingsSummary:
    pages: int = 0
    filings: int = 0
    matched: int = 0
    no_ticker: list[str] = field(default_factory=lambda: list[str]())
    written: int = 0
    # Every page read was full: filings older than the last page were not seen this run. Runs are
    # every 3 hours and 5 pages hold about two days of 8-Ks, so this means runs were skipped.
    reached_limit: bool = False


def filing_records(
    filings: list[Filing], tickers: dict[int, str]
) -> tuple[list[EventRecord], list[str]]:
    """One record per mapped item. A filing listed under several companies counts once."""
    by_acc: dict[str, Filing] = {}
    for f in filings:
        if f.form != "8-K" or not any(i in ITEMS for i in f.items):
            continue
        held = by_acc.get(f.accession)
        if held is None or (held.cik not in tickers and f.cik in tickers):
            by_acc[f.accession] = f
    records: list[EventRecord] = []
    no_ticker: list[str] = []
    for f in sorted(by_acc.values(), key=lambda f: (f.accepted_at, f.accession)):
        ticker = tickers.get(f.cik)
        if ticker is None:
            no_ticker.append(f"{f.company} ({f.accession})")
            continue
        for item in f.items:
            if item not in ITEMS:
                continue
            event_type, label = ITEMS[item]
            records.append(
                make_record(
                    headline_id=f"{SOURCE}-{f.accession}-{item}",
                    title=f"{f.company} ({ticker}) 8-K Item {item}: {label}"[:300],
                    url=f.url,
                    source=SOURCE,
                    published_at=f.accepted_at,
                    event_type=event_type,
                    entities=[ticker],
                    confidence="high",
                    needs_review=False,
                    extractor_version=RULES_VERSION,
                )
            )
    return records, no_ticker


def run_filings(
    fetch: Fetcher, store: Path, form: str = "8-K", max_pages: int = 5
) -> FilingsSummary:
    """Read the latest filings (newest first, up to ``max_pages`` pages) into the event store."""
    try:
        tickers = parse_tickers(fetch(TICKERS_URL))
        filings: list[Filing] = []
        pages, full = 0, False
        for page in range(max_pages):
            got, n = parse_current(fetch(current_url(form, page * PAGE_SIZE)))
            pages += 1
            filings.extend(got)
            full = n >= PAGE_SIZE
            if not full:
                break
    except FetchError as exc:
        msg = str(exc)
        if "HTTP 403" in msg:
            msg += (
                " (SEC refused the request. It needs SEC_CONTACT set to an email address; if that "
                "is set, SEC may be blocking this server's address)"
            )
        raise FilingsError(msg) from None
    records, no_ticker = filing_records(filings, tickers)
    known = {r.headline_id for r in load_records(store)}
    fresh = [r for r in records if r.headline_id not in known]
    written = append_records(store, fresh)
    return FilingsSummary(pages, len(filings), len(records), no_ticker, written, full)
