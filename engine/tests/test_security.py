import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

import pytest

from spillover.frozen import FrozenError, check_frozen
from spillover.ingest.http import MAX_BYTES, FetchError, SafeRedirects, http_get, same_site


class FakeResponse:
    def __init__(self, body: bytes) -> None:
        self.body = body

    def __enter__(self) -> "FakeResponse":
        return self

    def __exit__(self, *exc: object) -> None:
        return None

    def read(self, n: int = -1) -> bytes:
        return self.body if n < 0 else self.body[:n]


class FakeOpener:
    def __init__(
        self, response: FakeResponse | None = None, error: Exception | None = None
    ) -> None:
        self.response, self.error = response, error
        self.requested: list[Any] = []

    def open(self, request: Any, timeout: float) -> FakeResponse:
        self.requested.append(request)
        if self.error:
            raise self.error
        assert self.response is not None
        return self.response


# --- only https, bounded, and the key stays out of messages -------------------------------------


@pytest.mark.parametrize(
    "url", ["http://example.com/x", "file:///etc/passwd", "ftp://example.com/x", "//example.com"]
)
def test_only_https_urls_are_fetched(url: str) -> None:
    opener = FakeOpener(FakeResponse(b"x"))
    with pytest.raises(FetchError, match="only https"):
        http_get(url, opener=opener)
    assert opener.requested == [], "a refused URL must never reach the network layer"


def test_an_https_fetch_returns_text_and_identifies_itself() -> None:
    opener = FakeOpener(FakeResponse("héllo".encode()))
    assert http_get("https://example.com/feed", opener=opener) == "héllo"
    assert opener.requested[0].get_header("User-agent").startswith("spillover-ingest/")


def test_a_response_over_the_cap_is_refused_not_buffered() -> None:
    with pytest.raises(FetchError, match="larger than"):
        http_get("https://example.com/big", opener=FakeOpener(FakeResponse(b"x" * (MAX_BYTES + 1))))
    assert http_get("https://example.com/ok", opener=FakeOpener(FakeResponse(b"x" * MAX_BYTES)))


def test_failures_never_include_the_api_key() -> None:
    url = "https://api.example.com/x?series_id=A&api_key=SECRET123"
    for error in (
        urllib.error.HTTPError(url, 500, "boom", None, None),  # type: ignore[arg-type]
        urllib.error.URLError(f"cannot reach {url}"),
        TimeoutError(f"timed out fetching {url}"),
    ):
        with pytest.raises(FetchError) as err:
            http_get(url, opener=FakeOpener(error=error))
        assert "SECRET123" not in str(err.value)


# --- redirects cannot carry a URL (and its key) to another site --------------------------------


@pytest.mark.parametrize(
    ("a", "b", "same"),
    [
        ("sec.gov", "www.sec.gov", True),
        ("www.sec.gov", "sec.gov", True),
        ("api.stlouisfed.org", "api.stlouisfed.org", True),
        ("sec.gov", "evil-sec.gov", False),
        ("sec.gov", "sec.gov.evil.com", False),
        ("sec.gov", "evil.com", False),
        ("", "sec.gov", False),
    ],
)
def testsame_site_is_not_fooled_by_lookalike_hosts(a: str, b: str, same: bool) -> None:
    assert same_site(a, b) is same


def redirect(old: str, new: str) -> Any:
    req = urllib.request.Request(old)
    return SafeRedirects().redirect_request(req, None, 302, "Found", {}, new)  # type: ignore[arg-type]


def test_redirects_stay_on_https_and_on_thesame_site() -> None:
    ok = redirect("https://sec.gov/a?api_key=K", "https://www.sec.gov/b")
    assert ok is not None and ok.full_url == "https://www.sec.gov/b"
    for bad in ("https://evil.com/steal", "http://sec.gov/b", "https://sec.gov.evil.com/b"):
        with pytest.raises(FetchError, match="refused a redirect"):
            redirect("https://sec.gov/a?api_key=K", bad)


# --- a ref can never be an option for git --------------------------------------------------------


@pytest.mark.parametrize(
    "ref", ["--output=/tmp/pwned", "-p", "main branch", "main\nother", "", "a\tb"]
)
def test_suspicious_base_refs_are_refused_before_git_runs(ref: str, tmp_path: Path) -> None:
    with pytest.raises(FrozenError, match="suspicious"):
        check_frozen(ref, tmp_path)
