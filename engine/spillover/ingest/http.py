"""Minimal HTTP GET with a pluggable fetcher, so tests never touch the network."""

from __future__ import annotations

import re
import urllib.error
import urllib.parse
import urllib.request
import zlib
from collections.abc import Callable, Mapping
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


def _decompress(body: bytes, encoding: str, url: str) -> bytes:
    """gzip/deflate bodies, refusing anything that inflates past MAX_BYTES (a zip bomb)."""
    if encoding not in ("gzip", "deflate"):
        return body
    wbits = 16 + zlib.MAX_WBITS if encoding == "gzip" else zlib.MAX_WBITS
    inflater = zlib.decompressobj(wbits)
    try:
        out = inflater.decompress(body, MAX_BYTES + 1)
    except zlib.error:
        raise FetchError(f"GET {redact(url)} failed: corrupt {encoding} response") from None
    if len(out) > MAX_BYTES or inflater.unconsumed_tail:
        raise FetchError(f"GET {redact(url)} refused: response larger than {MAX_BYTES // 2**20} MB")
    return out


def http_get(
    url: str,
    timeout: float = 30.0,
    opener: Any = None,
    user_agent: str = USER_AGENT,
    headers: Mapping[str, str] | None = None,
) -> str:
    if urllib.parse.urlsplit(url).scheme != "https":
        raise FetchError(f"GET {redact(url)} refused: only https is allowed")
    request = urllib.request.Request(url, headers={"User-Agent": user_agent, **(headers or {})})
    opener = opener or urllib.request.build_opener(SafeRedirects)
    try:
        with opener.open(request, timeout=timeout) as response:
            body: bytes = response.read(MAX_BYTES + 1)
            got = getattr(response, "headers", None)
            encoding = (got.get("Content-Encoding", "") if got is not None else "").strip().lower()
    except FetchError:
        raise
    except urllib.error.HTTPError as exc:
        raise FetchError(f"GET {redact(url)} failed: HTTP {exc.code}") from None
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise FetchError(f"GET {redact(url)} failed: {redact(str(exc))}") from None
    if len(body) > MAX_BYTES:
        raise FetchError(f"GET {redact(url)} refused: response larger than {MAX_BYTES // 2**20} MB")
    return _decompress(body, encoding, url).decode("utf-8", errors="replace")


SEC_ORG_NAME = "Spillover Research Project"
SEC_HEADERS = {"Accept-Encoding": "gzip, deflate"}

_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+")


def sec_fetcher(contact: str) -> Fetcher:
    """A fetcher that declares itself to SEC as it asks: tool name plus a contact email.

    The contact comes from the environment (a repository variable), is checked to be a single
    email address (so it cannot inject other headers), and is never printed.
    """
    contact = contact.strip()
    if not _EMAIL.fullmatch(contact):
        raise FetchError("SEC_CONTACT must be one email address, for example you@example.com")
    # Exactly the form SEC documents for declared tools ("Sample Company Name
    # AdminContact@<sample company domain>.com", with Accept-Encoding: gzip, deflate) at
    # https://www.sec.gov/os/accessing-edgar-data. A "tool/1.0 (...)" product token reads as an
    # undeclared script and is refused with HTTP 403.
    agent = f"{SEC_ORG_NAME} {contact}"

    def fetch(url: str) -> str:
        host = urllib.parse.urlsplit(url).hostname or ""
        if not same_site(host, "sec.gov"):
            raise FetchError(f"the SEC fetcher only fetches from sec.gov, not {host}")
        return http_get(url, user_agent=agent, headers=SEC_HEADERS)

    return fetch
