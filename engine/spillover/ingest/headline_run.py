"""Fetch headline feeds, extract events (cache first), and append them to the event store."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from spillover.eventstore import append_records, load_records, make_record
from spillover.extractor import ExtractionError, Headline, Llm, NeedsLiveCall, extract
from spillover.ingest.config import Config
from spillover.ingest.headlines import FeedError, fetch_feed
from spillover.ingest.http import Fetcher, FetchError, redact


@dataclass(frozen=True)
class HeadlineSummary:
    feeds_ok: int = 0
    feed_errors: list[str] = field(default_factory=lambda: list[str]())
    fetched: int = 0
    skipped_items: int = 0
    already_stored: int = 0
    written: int = 0
    from_cache: int = 0
    live_calls: int = 0
    no_event: int = 0
    needs_review: int = 0
    pending_no_client: int = 0
    deferred_by_cap: int = 0
    extraction_errors: list[str] = field(default_factory=lambda: list[str]())


def run_headlines(
    config: Config,
    fetch: Fetcher,
    llm: Llm | None,
    store_root: Path | None = None,
    cache_root: Path | None = None,
) -> HeadlineSummary:
    """One pass over every configured feed. Safe to re-run: stored headlines are never redone."""
    store = store_root or config.extractor.store
    cache = cache_root or config.extractor.cache
    known = {r.headline_id for r in load_records(store)}

    feeds_ok, errors, fetched, skipped, already = 0, [], 0, 0, 0
    fresh: list[Headline] = []
    for feed in config.headlines:
        try:
            parsed = fetch_feed(feed.url, feed.name, fetch)
        except (FetchError, FeedError) as exc:
            errors.append(redact(str(exc)))
            continue
        feeds_ok += 1
        fetched += len(parsed.headlines)
        skipped += len(parsed.skipped)
        for h in parsed.headlines:
            if h.headline_id in known:
                already += 1
            else:
                fresh.append(h)

    # Oldest first, so a backlog is worked through in order without leaving gaps.
    fresh.sort(key=lambda h: (h.published_at, h.headline_id))
    cap = config.extractor.max_new_per_run
    deferred = max(0, len(fresh) - cap)
    batch = fresh[:cap]

    records = []
    cache_hits = live = none = review = pending = 0
    extraction_errors: list[str] = []
    for h in batch:
        try:
            got = extract(h, llm, cache, config.extractor.model)
        except NeedsLiveCall:
            pending += 1
            continue
        except ExtractionError as exc:
            extraction_errors.append(f"{h.headline_id}: {exc}")
            continue
        if got.from_cache:
            cache_hits += 1
        else:
            live += 1
        ex = got.extraction
        none += ex.event_type == "NONE"
        review += ex.needs_review
        records.append(
            make_record(
                headline_id=h.headline_id,
                title=h.title,
                url=h.url,
                source=h.source,
                published_at=h.published_at,
                event_type=ex.event_type,
                entities=ex.entities,
                confidence=ex.confidence,
                needs_review=ex.needs_review,
                extractor_version=got.version,
            )
        )
    written = append_records(store, records)
    return HeadlineSummary(
        feeds_ok,
        errors,
        fetched,
        skipped,
        already,
        written,
        cache_hits,
        live,
        none,
        review,
        pending,
        deferred,
        extraction_errors,
    )
