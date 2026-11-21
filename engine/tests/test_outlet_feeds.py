"""The News tab's outlet feeds: recent items from listed outlets only, links kept to their outlet."""

from datetime import UTC, datetime, timedelta

from spillover.ingest.gdelt import GdeltHeadline
from spillover.ingest.headlines import parse_feed
from spillover.ingest.http import FetchError
from spillover.ingest.outlet_feeds import FEEDS, PER_OUTLET, fetch_outlet_headlines, merge
from spillover.ingest.outlets import tier

NOW = datetime(2026, 11, 21, 18, 0, tzinfo=UTC)


def rss(*items: tuple[str, str, datetime, str]) -> str:
    body = "".join(
        f"<item><title>{t}</title><link>{u}</link>"
        f"<pubDate>{w.strftime('%a, %d %b %Y %H:%M:%S +0000')}</pubDate>{extra}</item>"
        for t, u, w, extra in items
    )
    return (
        '<?xml version="1.0"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">'
        f"<channel><title>x</title>{body}</channel></rss>"
    )


def test_every_feed_belongs_to_a_listed_outlet_and_is_https() -> None:
    for domain, url in FEEDS:
        assert tier(domain) > 0, domain
        assert url.startswith("https://"), url


def test_recent_items_from_the_outlet_are_kept_with_their_picture() -> None:
    img = '<media:content url="https://cdn.example/a.jpg" medium="image"/>'
    feed = rss(
        ("Stocks fall as yields jump", "https://www.wsj.com/a", NOW - timedelta(hours=2), img),
        ("Old news", "https://www.wsj.com/old", NOW - timedelta(days=4), ""),
        ("Someone else's link", "https://evil.example/x", NOW - timedelta(hours=1), ""),
        ("Plain http", "http://www.wsj.com/b", NOW - timedelta(hours=1), ""),
    )
    got, failed = fetch_outlet_headlines(lambda url: feed, NOW, (("wsj.com", "https://f/1"),))
    assert failed == []
    assert [h.title for h in got] == ["Stocks fall as yields jump"]
    assert got[0].domain == "wsj.com" and got[0].image == "https://cdn.example/a.jpg"
    assert got[0].headline_id.startswith("feed-")


def test_a_failing_feed_is_skipped_and_reported() -> None:
    good = rss(("Fed holds rates", "https://www.nytimes.com/a", NOW, ""))

    def get(url: str) -> str:
        if "bad" in url:
            raise FetchError("GET https://bad failed: HTTP 403")
        return good

    got, failed = fetch_outlet_headlines(
        get, NOW, (("ft.com", "https://bad/1"), ("nytimes.com", "https://ok/1"))
    )
    assert [h.domain for h in got] == ["nytimes.com"]
    assert len(failed) == 1 and failed[0].startswith("ft.com")


def test_one_outlet_cannot_fill_the_page() -> None:
    feed = rss(
        *[
            (
                f"Story {i} about markets",
                f"https://www.cnbc.com/{i}",
                NOW - timedelta(minutes=i),
                "",
            )
            for i in range(20)
        ]
    )
    got, _ = fetch_outlet_headlines(lambda url: feed, NOW, (("cnbc.com", "https://f/1"),))
    assert len(got) == PER_OUTLET


def test_bbc_links_on_either_bbc_domain_count() -> None:
    feed = rss(
        ("Markets slide", "https://www.bbc.co.uk/news/a", NOW, ""),
        ("Banks rally", "https://www.bbc.com/news/b", NOW, ""),
    )
    got, _ = fetch_outlet_headlines(lambda url: feed, NOW, (("bbc.com", "https://f/1"),))
    assert len(got) == 2


def test_gdelt_tops_up_without_repeating_a_story() -> None:
    def h(url: str, title: str, domain: str = "cnbc.com") -> GdeltHeadline:
        return GdeltHeadline(url, title, url, domain, NOW)

    primary = [h("https://www.cnbc.com/1", "Stocks rally")]
    extra = [
        h("https://other/1", "Stocks rally!", "reuters.com"),
        h("https://r/2", "Oil jumps", "reuters.com"),
    ]
    assert [x.title for x in merge(primary, extra)] == ["Stocks rally", "Oil jumps"]


def test_feed_pictures_must_be_https_images() -> None:
    feed = rss(
        (
            "A",
            "https://www.ft.com/a",
            NOW,
            '<enclosure url="https://cdn.example/a.jpg" type="image/jpeg"/>',
        ),
        (
            "B",
            "https://www.ft.com/b",
            NOW,
            '<media:content url="http://cdn.example/b.jpg" medium="image"/>',
        ),
        (
            "C",
            "https://www.ft.com/c",
            NOW,
            '<media:content url="https://cdn.example/c.mp4" medium="video"/>',
        ),
    )
    parsed = parse_feed(feed, "ft.com")
    by_title = {x.title: parsed.images.get(x.headline_id) for x in parsed.headlines}
    assert by_title == {"A": "https://cdn.example/a.jpg", "B": None, "C": None}
