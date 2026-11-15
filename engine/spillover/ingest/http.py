"""Minimal HTTP GET with a pluggable fetcher, so tests never touch the network."""

from __future__ import annotations

import re
import urllib.error
import urllib.request
from collections.abc import Callable

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


def http_get(url: str, timeout: float = 30.0) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310
            return response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        raise FetchError(f"GET {redact(url)} failed: HTTP {exc.code}") from None
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise FetchError(f"GET {redact(url)} failed: {redact(str(exc))}") from None
