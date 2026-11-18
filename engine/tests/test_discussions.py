"""Questions and thread counts from GitHub Discussions: checked, shortened, never part of the record."""

import json
from collections.abc import Mapping
from typing import Any

import pytest

from spillover.ingest.discussions import (
    DISCUSSIONS_URL,
    DiscussionsError,
    fetch_discussions,
    parse,
    plain,
)
from spillover.site_export import EMPTY_COMMUNITY, community_from

TOKEN = "ghs_" + "a" * 36


def node(n: int, title: str, **over: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "number": n,
        "title": title,
        "url": f"{DISCUSSIONS_URL}{n}",
        "createdAt": f"2026-11-{10 + n:02d}T12:00:00Z",
        "updatedAt": f"2026-11-{10 + n:02d}T13:00:00Z",
        "bodyText": "Airlines fell after the outage.\n\nDoes that always happen?",
        "upvoteCount": 2,
        "isAnswered": False,
        "author": {"login": "someone"},
        "category": {"slug": "q-a", "isAnswerable": True},
        "comments": {"totalCount": 3},
    }
    return {**base, **over}


def answer(nodes: list[dict[str, Any]], categories: list[dict[str, Any]] | None = None) -> str:
    cats = (
        categories
        if categories is not None
        else [
            {"slug": "announcements", "name": "Announcements", "isAnswerable": False},
            {"slug": "q-a", "name": "Q&A", "isAnswerable": True},
        ]
    )
    return json.dumps(
        {
            "data": {
                "repository": {
                    "discussionCategories": {"nodes": cats},
                    "discussions": {"nodes": nodes},
                }
            }
        }
    )


def test_questions_come_only_from_answerable_categories_newest_first() -> None:
    general = node(3, "Just chatting", category={"slug": "general", "isAnswerable": False})
    found = parse(answer([node(1, "Do outages sink airlines?"), general, node(2, "Do recalls?")]))
    assert [q.number for q in found.questions] == [2, 1]
    q = found.questions[1]
    assert (q.title, q.author, q.comments, q.upvotes, q.answered) == (
        "Do outages sink airlines?",
        "someone",
        3,
        2,
        False,
    )
    assert q.excerpt == "Airlines fell after the outage. Does that always happen?"
    assert found.ask_category == "q-a"


def test_giscus_threads_become_comment_counts_not_questions() -> None:
    thread = node(
        5,
        "claim:clm_fomc_abs_move_usd_v1",
        category={"slug": "announcements", "isAnswerable": False},
        comments={"totalCount": 4},
    )
    found = parse(answer([thread]))
    assert found.questions == []
    assert [(t.term, t.comments) for t in found.threads] == [("claim:clm_fomc_abs_move_usd_v1", 4)]


def test_links_outside_this_repository_and_odd_logins_are_dropped() -> None:
    elsewhere = node(1, "Phish", url="https://evil.example/discussions/1")
    mismatched = node(2, "Wrong number", url=f"{DISCUSSIONS_URL}99")
    odd = node(3, "Odd author", author={"login": "<script>"})
    ghost = node(4, "Deleted author", author=None)
    found = parse(answer([elsewhere, mismatched, odd, ghost]))
    assert [q.number for q in found.questions] == [4, 3]
    assert [q.author for q in found.questions] == [None, None]


def test_text_is_plain_and_short() -> None:
    long = node(1, "T" * 500, bodyText="x\u0000y " * 400)
    q = parse(answer([long])).questions[0]
    assert len(q.title) == 200 and q.title.endswith("…")
    assert len(q.excerpt) <= 280 and "\u0000" not in q.excerpt
    assert plain("a\n\n  b\tc", 10) == "a b c"


def test_no_answerable_category_means_no_ask_link() -> None:
    found = parse(answer([], categories=[{"slug": "general", "isAnswerable": False}]))
    assert found.ask_category is None


def test_errors_and_garbage_are_reported_without_echoing_much() -> None:
    with pytest.raises(DiscussionsError, match="not JSON"):
        parse("<html>")
    with pytest.raises(DiscussionsError, match="refused the query"):
        parse(json.dumps({"errors": [{"message": "Resource not accessible by integration"}]}))
    with pytest.raises(DiscussionsError, match="no repository"):
        parse(json.dumps({"data": {"repository": None}}))


def test_the_token_goes_only_in_the_header_to_github() -> None:
    seen: dict[str, Any] = {}

    def post(url: str, body: bytes, headers: Mapping[str, str]) -> str:
        seen.update(url=url, body=body.decode(), headers=dict(headers))
        return answer([node(1, "Q?")])

    found = fetch_discussions(TOKEN, post)
    assert seen["url"] == "https://api.github.com/graphql"
    assert seen["headers"]["Authorization"] == f"bearer {TOKEN}"
    assert TOKEN not in seen["body"]
    assert [q.number for q in found.questions] == [1]


def test_a_missing_token_fails_before_any_request() -> None:
    def post(url: str, body: bytes, headers: Mapping[str, str]) -> str:
        raise AssertionError("must not be called")

    with pytest.raises(DiscussionsError, match="missing or malformed"):
        fetch_discussions("", post)


def test_community_section_round_trips_into_site_models() -> None:
    from datetime import UTC, datetime

    found = parse(answer([node(1, "Q?"), node(2, "event:evt_x", category={"isAnswerable": False})]))
    c = community_from(found, datetime(2026, 11, 18, tzinfo=UTC))
    assert c.questions[0].title == "Q?" and c.threads[0].term == "event:evt_x"
    assert EMPTY_COMMUNITY.fetched_at is None and EMPTY_COMMUNITY.questions == []
