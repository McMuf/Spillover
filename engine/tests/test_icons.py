"""Real icons for outlets, companies and people: checked images only, the sharpest kept, no stand-ins."""

import json
import struct
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from spillover.data import MarketData
from spillover.ingest.http import FetchError
from spillover.ingest.icons import (
    best_icon,
    is_domain,
    resolve,
    sniff,
    websites,
    width,
)


def png(px: int) -> bytes:
    """A minimal PNG header of the given width, padded past the minimum size."""
    return b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\rIHDR" + struct.pack(">II", px, px) + b"\x00" * 200


def test_only_real_image_types_are_accepted_and_svg_never() -> None:
    assert sniff(png(32)) == "png"
    assert sniff(b"\x00\x00\x01\x00" + b"\x00" * 200) == "ico"
    assert sniff(b"\xff\xd8\xff\xe0" + b"\x00" * 200) == "jpg"
    assert sniff(b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>") is None
    assert sniff(b"<html>not an image</html>") is None
    assert width(png(128), "png") == 128


def test_the_sharpest_icon_wins_and_not_found_never_counts() -> None:
    answers = {"t1.gstatic.com": png(16), "icons.duckduckgo.com": png(64)}
    seen: list[str] = []

    def get(url: str, limit: int) -> bytes:
        seen.append(url)
        for host, data in answers.items():
            if host in url and "www." not in url:
                return data
        raise FetchError("HTTP 404")

    data, kind = best_icon("news.example", get) or (b"", "")
    assert kind == "png" and width(data, kind) == 64
    assert not any("apple-touch-icon" in u for u in seen)  # stopped once one was sharp enough

    def nothing(url: str, limit: int) -> bytes:
        raise FetchError("HTTP 404")

    assert best_icon("nowhere.example", nothing) is None


def test_tickers_map_to_company_websites_on_us_exchanges() -> None:
    asked: list[str] = []

    def get_text(url: str) -> str:
        asked.append(url)
        rows = [
            {"ticker": {"value": "LOW"}, "website": {"value": "http://lowes.com"}},
            {"ticker": {"value": "NDAQ"}, "website": {"value": "https://www.nasdaq.com/"}},
            {"ticker": {"value": "NDAQ"}, "website": {"value": "http://business.nasdaq.com/"}},
            {"ticker": {"value": "BAD"}, "website": {"value": "javascript:alert(1)"}},
        ]
        return json.dumps({"results": {"bindings": rows}})

    found = websites(["LOW", "NDAQ", "BAD", "not a ticker"], get_text)
    assert found == {"LOW": "lowes.com", "NDAQ": "nasdaq.com"}
    assert "Q13677" in asked[0] and "Q82059" in asked[0]  # NYSE and Nasdaq only


def test_resolve_stores_icons_reuses_the_cache_and_leaves_out_what_has_none(tmp_path: Path) -> None:
    calls: list[str] = []

    def get_bytes(url: str, limit: int) -> bytes:
        calls.append(url)
        if "nowhere" in url:
            raise FetchError("HTTP 404")
        return png(128)

    def get_text(url: str) -> str:
        return json.dumps(
            {
                "results": {
                    "bindings": [
                        {"ticker": {"value": "LOW"}, "website": {"value": "https://lowes.com"}}
                    ]
                }
            }
        )

    now = datetime(2026, 11, 18, tzinfo=UTC)
    got = resolve(
        ["www.news.example", "nowhere.example"],
        ["LOW", "BLS"],
        ["McMuf"],
        get_bytes,
        get_text,
        now,
        tmp_path,
    )
    assert set(got.domains) == {"news.example", "lowes.com", "bls.gov"}
    assert got.symbols == {"LOW": "lowes.com.png", "BLS": "bls.gov.png"}
    assert got.people == {"McMuf": "gh-mcmuf.png"}
    assert (tmp_path / "news.example.png").read_bytes()[:4] == b"\x89PNG"

    calls.clear()
    again = resolve(
        ["news.example", "nowhere.example"],
        ["LOW"],
        ["McMuf"],
        get_bytes,
        get_text,
        now + timedelta(hours=1),
        tmp_path,
    )
    assert again.domains["news.example"] == "news.example.png"
    assert calls == []  # found icons are reused, and a recent "none" is not asked again
    later = now + timedelta(days=8)
    resolve(["nowhere.example"], [], [], get_bytes, get_text, later, tmp_path)
    assert any("nowhere" in c for c in calls)  # a missing icon is retried after a week


@pytest.mark.parametrize("name", ["news.example", "a.b.co.uk", "x-y.com"])
def test_domain_check_accepts_real_hosts(name: str) -> None:
    assert is_domain(name)


@pytest.mark.parametrize("name", ["", "localhost", "../etc/passwd", "a..b", "-x.com", "x.com/evil"])
def test_domain_check_refuses_anything_else(name: str) -> None:
    assert not is_domain(name)


def test_headlines_without_an_outlet_icon_are_left_out(market: MarketData, tmp_path: Path) -> None:
    from spillover.site_export import LiveHeadline, build_site_data, with_icons

    from .test_site_export import claims_with_text

    site = build_site_data(claims_with_text(), market, tmp_path / "p", tmp_path / "o", n_boot=200)
    when = datetime(2026, 11, 18, tzinfo=UTC)
    heads = [
        LiveHeadline(
            headline_id=f"h{i}",
            title="Stocks rise",
            url=f"https://{d}/a",
            domain=d,
            seen_at=when,
            image=None,
            event_type="NONE",
            entities=[],
            confidence="low",
        )
        for i, d in enumerate(["www.has.example", "none.example"])
    ]
    site = site.model_copy(update={"headlines": heads})
    out = with_icons(site, {"has.example": "has.example.png"}, {}, {})
    assert [h.domain for h in out.headlines] == ["www.has.example"]
    assert out.icons.domains == {"has.example": "icons/has.example.png"}
