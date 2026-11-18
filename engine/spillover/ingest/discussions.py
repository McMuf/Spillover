"""Questions and discussion counts from this repository's GitHub Discussions (community phase 2).

Read when the site is built, with the workflow's own read-only token (``discussions: read``); no
other key and no database. Two things come out:

* **Questions**: discussions in an answerable (Q&A-format) category. Anyone with a GitHub account
  can ask; the site lists them and offers to shape one into a claim.
* **Threads**: comment counts for the giscus threads on claims and events (titled ``claim:<id>`` or
  ``event:<id>``), so the site can say a claim is being discussed.

Everything here is display only. Questions, comments and reactions never touch the record: a
grade comes only from the market.

Text written by people is kept as plain text (titles and a short excerpt), shortened, and checked
before it reaches the site; the site renders it as text, never as HTML.
"""

from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import datetime

from spillover.ingest.http import MAX_BYTES, USER_AGENT, FetchError, SafeRedirects

GRAPHQL = "https://api.github.com/graphql"
REPO_OWNER = "McMuf"
REPO_NAME = "Spillover"
DISCUSSIONS_URL = f"https://github.com/{REPO_OWNER}/{REPO_NAME}/discussions/"
MAX_DISCUSSIONS = 100
MAX_QUESTIONS = 40
TITLE_CHARS = 200
EXCERPT_CHARS = 280

# GitHub logins: letters, digits and hyphens, at most 39 characters; apps show as "name[bot]".
_LOGIN = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})(?:\[bot\])?$")
_TERM = re.compile(r"^(claim|event):[A-Za-z0-9_.:-]{1,120}$")
_SLUG = re.compile(r"^[a-z0-9-]{1,60}$")
_SPACE = re.compile(r"\s+")

QUERY = """
query($owner: String!, $name: String!, $first: Int!) {
  repository(owner: $owner, name: $name) {
    discussionCategories(first: 25) { nodes { slug name isAnswerable } }
    discussions(first: $first, orderBy: {field: UPDATED_AT, direction: DESC}) {
      nodes {
        number title url createdAt updatedAt bodyText upvoteCount isAnswered
        author { login }
        category { slug isAnswerable }
        comments { totalCount }
      }
    }
  }
}
"""

Poster = Callable[[str, bytes, Mapping[str, str]], str]


class DiscussionsError(RuntimeError):
    """GitHub's answer could not be read. The message never contains the token."""


@dataclass(frozen=True)
class Question:
    number: int
    title: str
    url: str
    author: str | None
    created_at: datetime
    updated_at: datetime
    excerpt: str
    comments: int
    upvotes: int
    answered: bool


@dataclass(frozen=True)
class Thread:
    term: str  # "claim:<id>" or "event:<id>", the giscus thread's title
    url: str
    comments: int


@dataclass(frozen=True)
class Discussions:
    questions: list[Question]
    threads: list[Thread]
    # The Q&A category's slug, for the "Ask a question" link; None when the repository has none.
    ask_category: str | None


def http_post(url: str, body: bytes, headers: Mapping[str, str], timeout: float = 30.0) -> str:
    """POST to GitHub's API over https, with the same size and redirect limits as http_get."""
    if not url.startswith("https://api.github.com/"):
        raise FetchError("only GitHub's API may be posted to")
    request = urllib.request.Request(
        url, data=body, method="POST", headers={"User-Agent": USER_AGENT, **headers}
    )
    opener = urllib.request.build_opener(SafeRedirects)
    try:
        with opener.open(request, timeout=timeout) as response:
            raw: bytes = response.read(MAX_BYTES + 1)
    except FetchError:
        raise
    except urllib.error.HTTPError as exc:
        raise FetchError(f"POST {url} failed: HTTP {exc.code}") from None
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise FetchError(f"POST {url} failed: {type(exc).__name__}") from None
    if len(raw) > MAX_BYTES:
        raise FetchError(f"POST {url} refused: response larger than {MAX_BYTES // 2**20} MB")
    return raw.decode("utf-8", errors="replace")


def plain(text: object, limit: int) -> str:
    """One line of plain text: whitespace collapsed, control characters dropped, shortened."""
    s = "".join(ch for ch in str(text or "") if ch.isprintable() or ch.isspace())
    s = _SPACE.sub(" ", s).strip()
    return s if len(s) <= limit else s[: limit - 1].rstrip() + "…"


def _when(value: object) -> datetime:
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        raise DiscussionsError(f"unreadable time {str(value)[:40]!r}") from None


def _count(value: object) -> int:
    return value if isinstance(value, int) and value >= 0 else 0


def parse(body: str) -> Discussions:
    """GitHub's GraphQL answer, checked field by field; anything malformed is skipped."""
    try:
        data = json.loads(body)
    except json.JSONDecodeError:
        raise DiscussionsError("GitHub's answer is not JSON") from None
    if not isinstance(data, dict):
        raise DiscussionsError("GitHub's answer is not an object")
    if data.get("errors"):
        first = data["errors"][0] if isinstance(data["errors"], list) and data["errors"] else {}
        msg = first.get("message", "") if isinstance(first, dict) else ""
        raise DiscussionsError(f"GitHub refused the query: {plain(msg, 120)}")
    repo = (data.get("data") or {}).get("repository")
    if not isinstance(repo, dict):
        raise DiscussionsError("GitHub's answer has no repository")

    categories = (repo.get("discussionCategories") or {}).get("nodes") or []
    answerable = [
        c["slug"]
        for c in categories
        if isinstance(c, dict) and c.get("isAnswerable") and _SLUG.match(str(c.get("slug", "")))
    ]
    # GitHub's default Q&A category is "q-a"; prefer it, else the first answerable one.
    ask = "q-a" if "q-a" in answerable else (answerable[0] if answerable else None)

    questions: list[Question] = []
    threads: list[Thread] = []
    for node in (repo.get("discussions") or {}).get("nodes") or []:
        if not isinstance(node, dict):
            continue
        url = str(node.get("url", ""))
        number = node.get("number")
        if not isinstance(number, int) or url != f"{DISCUSSIONS_URL}{number}":
            continue  # only this repository's own discussion pages are ever linked
        title = plain(node.get("title"), TITLE_CHARS)
        comments = _count((node.get("comments") or {}).get("totalCount"))
        category = node.get("category") or {}
        if _TERM.match(title):
            threads.append(Thread(term=title, url=url, comments=comments))
            continue
        if not (isinstance(category, dict) and category.get("isAnswerable")) or not title:
            continue
        login = str((node.get("author") or {}).get("login", ""))
        questions.append(
            Question(
                number=number,
                title=title,
                url=url,
                author=login if _LOGIN.match(login) else None,
                created_at=_when(node.get("createdAt")),
                updated_at=_when(node.get("updatedAt")),
                excerpt=plain(node.get("bodyText"), EXCERPT_CHARS),
                comments=comments,
                upvotes=_count(node.get("upvoteCount")),
                answered=node.get("isAnswered") is True,
            )
        )
    questions.sort(key=lambda q: (q.created_at, q.number), reverse=True)
    return Discussions(questions=questions[:MAX_QUESTIONS], threads=threads, ask_category=ask)


def fetch_discussions(token: str, post: Poster = http_post) -> Discussions:
    """Read the repository's discussions with a GitHub token (read access is enough)."""
    token = token.strip()
    if not re.fullmatch(r"[A-Za-z0-9_.-]{20,255}", token):
        raise DiscussionsError("the GitHub token is missing or malformed")
    payload = json.dumps(
        {
            "query": QUERY,
            "variables": {"owner": REPO_OWNER, "name": REPO_NAME, "first": MAX_DISCUSSIONS},
        }
    ).encode()
    headers = {"Authorization": f"bearer {token}", "Content-Type": "application/json"}
    return parse(post(GRAPHQL, payload, headers))
