"""The last hour of market news from GDELT's raw 15-minute files: picked by topic, checked, capped."""

import io
import zipfile
from datetime import UTC, datetime

import pytest

from spillover.ingest.gdelt import GdeltError
from spillover.ingest.gkg import (
    FILE,
    INDEX,
    PER_OUTLET,
    fetch_recent,
    file_urls,
    latest_stamp,
    parse_gkg,
    pick,
    unzip,
)
from spillover.ingest.http import FetchError

STAMP = "20261118144500"


def row(
    url: str,
    title: str,
    themes: str = "ECON_STOCKMARKET;TAX_FNCACT_CEO",
    domain: str = "news.example",
    image: str = "https://news.example/og.jpg",
    stamp: str = STAMP,
) -> str:
    cols = [""] * 27
    cols[0], cols[1], cols[2], cols[3], cols[4] = f"{stamp}-1", stamp, "1", domain, url
    cols[7], cols[18] = themes, image
    cols[26] = f"<PAGE_TITLE>{title}</PAGE_TITLE><PAGE_LINKS>x</PAGE_LINKS>"
    return "\t".join(cols)


def zipped(text: str, name: str = f"{STAMP}.gkg.csv") -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr(name, text)
    return buf.getvalue()


def test_market_articles_are_chosen_by_topic_and_title() -> None:
    text = "\n".join(
        [
            row("https://a.example/1", "Nvidia shares jump after earnings beat"),
            row("https://a.example/2", "Local bake sale raises money", themes="EDUCATION"),
            row("https://a.example/3", "Weather turns cold this weekend"),  # topic, no market words
            row("https://a.example/4", "Acme stock: shareholder alert, lead plaintiff deadline"),
            row("http://a.example/5", "Stocks fall on rate fears"),  # not https
            "short\trow",
        ]
    )
    found = parse_gkg(text)
    assert [h.url for _, h in found] == ["https://a.example/1"]
    h = found[0][1]
    assert h.seen_at == datetime(2026, 11, 18, 14, 45, tzinfo=UTC)
    assert h.image == "https://news.example/og.jpg" and h.domain == "news.example"


def test_titles_are_unescaped_and_tidied_and_unsafe_images_dropped() -> None:
    text = row(
        "https://a.example/1",
        "Fed raises rates &#x2013; stocks slide , traders say | Some Outlet",
        image="javascript:alert(1)",
    )
    h = parse_gkg(text)[0][1]
    assert h.title == "Fed raises rates – stocks slide, traders say"
    assert h.image is None


def test_pick_ranks_clear_market_news_first_caps_each_outlet_and_drops_repeats() -> None:
    rows = [
        row(
            f"https://busy.example/{i}", f"Stocks rally as earnings beat {i}", domain="busy.example"
        )
        for i in range(6)
    ]
    rows.append(
        row("https://other.example/1", "Stocks rally as earnings beat 0", domain="other.example")
    )
    rows.append(
        row("https://vague.example/1", "AI helps a retirement home", domain="vague.example")
    )
    chosen = pick(parse_gkg("\n".join(rows)), keep=10)
    domains = [h.domain for h in chosen]
    assert domains.count("busy.example") == PER_OUTLET
    assert "other.example" not in domains  # the same story syndicated elsewhere
    assert len(chosen) == PER_OUTLET + 1


def test_file_list_covers_the_last_hour_from_lastupdate() -> None:
    index = (
        f"1 a http://data.gdeltproject.org/gdeltv2/{STAMP}.export.CSV.zip\n"
        f"2 b http://data.gdeltproject.org/gdeltv2/{STAMP}.gkg.csv.zip\n"
    )
    newest = latest_stamp(index)
    assert file_urls(newest, 4) == [
        FILE.format(stamp=s)
        for s in ["20261118144500", "20261118143000", "20261118141500", "20261118140000"]
    ]
    assert all(u.startswith("https://") for u in file_urls(newest))
    with pytest.raises(GdeltError):
        latest_stamp("nothing here")


def test_unzip_refuses_odd_archives() -> None:
    with pytest.raises(GdeltError, match="exactly one"):
        unzip(zipped("x", name="other.txt"))
    with pytest.raises(GdeltError, match="unreadable"):
        unzip(b"not a zip")


def test_fetch_recent_skips_a_missing_older_file_but_not_the_newest() -> None:
    index = f"2 b http://data.gdeltproject.org/gdeltv2/{STAMP}.gkg.csv.zip\n"
    newest = zipped(
        "\n".join(
            [
                row("https://a.example/1", "Stocks climb as inflation cools", domain="reuters.com"),
                # An outlet that is not on the list (outlets.py) is left out.
                row("https://b.example/1", "Stocks slip as yields rise", domain="spam.example"),
            ]
        )
    )

    def text(url: str) -> str:
        assert url == INDEX
        return index

    def data(url: str, limit: int) -> bytes:
        if STAMP in url:
            return newest
        raise FetchError("HTTP 404")

    got = fetch_recent(text, data)
    assert [h.url for h in got] == ["https://a.example/1"]

    def broken(url: str, limit: int) -> bytes:
        raise FetchError("HTTP 404")

    with pytest.raises(FetchError):
        fetch_recent(text, broken)
