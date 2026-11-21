"""RSS and Atom parsing for headline feeds.

Only a headline's title, link, source name, stable id and publication time are kept (never article
bodies). The event time is the feed's own publication time, the earliest verifiable one: an item
without a timezone-aware time is skipped, not given the time we happened to fetch it. Feeds are
third-party XML, so they are parsed with ``defusedxml`` (no entity-expansion or external-entity
attacks).
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from xml.etree.ElementTree import Element

from defusedxml import ElementTree as SafeET
from defusedxml.common import DefusedXmlException

from spillover.extractor import Headline, clean_title
from spillover.ingest.http import Fetcher

MAX_URL_CHARS = 500
_ATOM = "{http://www.w3.org/2005/Atom}"


class FeedError(RuntimeError):
    """A feed could not be read as RSS or Atom."""


@dataclass(frozen=True)
class ParsedFeed:
    headlines: list[Headline]
    skipped: list[str] = field(default_factory=lambda: list[str]())
    # An item's preview image (media:content, media:thumbnail or an image enclosure), by headline
    # id, when the feed gives one over https. Shown on the News tab, never stored.
    images: dict[str, str] = field(default_factory=lambda: dict[str, str]())


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _child_text(item: Element, *names: str) -> str:
    for child in item:
        if _local(child.tag) in names and child.text and child.text.strip():
            return child.text.strip()
    return ""


def _atom_link(item: Element) -> str:
    for child in item:
        if _local(child.tag) == "link" and child.get("rel", "alternate") == "alternate":
            return (child.get("href") or "").strip()
    return ""


def _parse_time(raw: str) -> datetime | None:
    """A timezone-aware UTC time, or None if the feed gave no verifiable time."""
    if not raw:
        return None
    try:
        parsed = parsedate_to_datetime(raw)
    except (TypeError, ValueError):
        try:
            parsed = datetime.fromisoformat(raw.strip().replace("Z", "+00:00"))
        except ValueError:
            return None
    if parsed.tzinfo is None:
        return None
    return parsed.astimezone(UTC)


def _image(item: Element) -> str:
    for child in item:
        tag = _local(child.tag)
        url = (child.get("url") or "").strip()
        is_image = tag in ("content", "thumbnail") and child.get("medium", "image") == "image"
        is_enclosure = tag == "enclosure" and (child.get("type") or "").startswith("image/")
        if (is_image or is_enclosure) and url.startswith("https://") and len(url) <= MAX_URL_CHARS:
            return url
    return ""


def _items(root: Element) -> list[Element]:
    if _local(root.tag) == "feed":
        return [e for e in root if _local(e.tag) == "entry"]
    channel = next((c for c in root if _local(c.tag) == "channel"), None)
    return [e for e in (channel if channel is not None else root) if _local(e.tag) == "item"]


def parse_feed(text: str, source: str) -> ParsedFeed:
    try:
        root = SafeET.fromstring(text.lstrip("﻿").encode("utf-8"))
    except (SafeET.ParseError, DefusedXmlException, ValueError) as exc:
        raise FeedError(f"{source}: not a readable feed ({type(exc).__name__})") from None

    headlines: list[Headline] = []
    skipped: list[str] = []
    images: dict[str, str] = {}
    seen: set[str] = set()
    for item in _items(root):
        title = clean_title(_child_text(item, "title"))
        url = _child_text(item, "link") or _atom_link(item)
        guid = _child_text(item, "guid", "id") or url
        when = _parse_time(_child_text(item, "pubDate", "published", "updated", "date"))
        if (
            not title
            or not url.lower().startswith(("http://", "https://"))
            or len(url) > MAX_URL_CHARS
        ):
            skipped.append("item without a usable title or http(s) link")
            continue
        if when is None:
            skipped.append("item without a timezone-aware publication time")
            continue
        hid = hashlib.sha256(f"{source}|{guid}".encode()).hexdigest()[:16]
        if hid in seen:
            continue
        seen.add(hid)
        headlines.append(Headline(hid, title, url, source, when))
        if image := _image(item):
            images[hid] = image
    if not headlines and not skipped:
        raise FeedError(f"{source}: the feed has no items")
    return ParsedFeed(headlines, skipped, images)


def fetch_feed(url: str, source: str, fetch: Fetcher) -> ParsedFeed:
    return parse_feed(fetch(url), source)
