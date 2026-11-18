"""Minimal HTTP GET with a pluggable fetcher, so tests never touch the network."""

from __future__ import annotations

import re
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable
from typing import Any

Fetcher = Callable[[str], str]

USER_AGENT = (
    "spillover-ingest/0.1 (open-source research project; https://github.com/McMuf/Spillover)"
)
_SECRET = re.compile(r"(api_key|apikey|key|token)=[^&\s]+", re.IGNORECASE)


class FetchError(RuntimeError):
    """A download failed. The message never contains an API key."""


def redact(text: str) -> str:
    """Remove secrets such as ``api_key=...`` from a URL or message before it is shown."""
    return _SECRET.sub(lambda m: f"{m.group(1)}=***", text)


MAX_BYTES = 8 * 1024 * 1024  # a price series or a feed is far smaller; this stops a hostile one


def same_site(a: str, b: str) -> bool:
    """Same host, or one a subdomain of the other (sec.gov and www.sec.gov)."""
    a, b = a.lower(), b.lower()
    return a == b or a.endswith("." + b) or b.endswith("." + a)


class SafeRedirects(urllib.request.HTTPRedirectHandler):
    """Follow a redirect only to https on the same site, so a key in a URL stays put."""

    def redirect_request(
        self,
        req: urllib.request.Request,
        fp: Any,
        code: int,
        msg: str,
        headers: Any,
        newurl: str,
    ) -> urllib.request.Request | None:
        old, new = urllib.parse.urlsplit(req.full_url), urllib.parse.urlsplit(newurl)
        if new.scheme != "https" or not same_site(old.hostname or "", new.hostname or ""):
            raise FetchError(f"refused a redirect from {old.hostname} to {new.hostname}")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def http_get(
    url: str, timeout: float = 30.0, opener: Any = None, user_agent: str = USER_AGENT
) -> str:
    if urllib.parse.urlsplit(url).scheme != "https":
        raise FetchError(f"GET {redact(url)} refused: only https is allowed")
    request = urllib.request.Request(url, headers={"User-Agent": user_agent})
    opener = opener or urllib.request.build_opener(SafeRedirects)
    try:
        with opener.open(request, timeout=timeout) as response:
            body: bytes = response.read(MAX_BYTES + 1)
    except FetchError:
        raise
    except urllib.error.HTTPError as exc:
        raise FetchError(f"GET {redact(url)} failed: HTTP {exc.code}") from None
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise FetchError(f"GET {redact(url)} failed: {redact(str(exc))}") from None
    if len(body) > MAX_BYTES:
        raise FetchError(f"GET {redact(url)} refused: response larger than {MAX_BYTES // 2**20} MB")
    return body.decode("utf-8", errors="replace")


_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+")


def sec_fetcher(contact: str) -> Fetcher:
    """A fetcher that declares itself to SEC as it asks: tool name plus a contact email.

    The contact comes from the environment (a repository variable), is checked to be a single
    email address (so it cannot inject other headers), and is never printed.
    """
    contact = contact.strip()
    if not _EMAIL.fullmatch(contact):
        raise FetchError("SEC_CONTACT must be one email address, for example you@example.com")
    agent = f"{USER_AGENT} {contact}"

    def fetch(url: str) -> str:
        host = urllib.parse.urlsplit(url).hostname or ""
        if not same_site(host, "sec.gov"):
            raise FetchError(f"the SEC fetcher only fetches from sec.gov, not {host}")
        return http_get(url, user_agent=agent)

    return fetch
