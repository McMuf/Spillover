"""Latest headlines from GDELT: parsed, tidied, labeled for display, never written to the ledger."""

import json
from pathlib import Path

import pytest
from typer.testing import CliRunner

from spillover import cli
from spillover.ingest.gdelt import GdeltError, doc_url, parse_doc, tidy
from spillover.site_export import headline_candidates, label_headlines

from .conftest import CLAIMS, FIXTURES

runner = CliRunner()


def article(
    title: str, url: str, when: str = "20261118T011500Z", domain: str = "example.com"
) -> dict[str, str]:
    return {
        "url": url,
        "url_mobile": "",
        "title": title,
        "seendate": when,
        "socialimage": "",
        "domain": domain,
        "language": "English",
        "sourcecountry": "",
    }


SAMPLE = json.dumps(
    {
        "articles": [
            article(
                "  Serious for many reason : analyst reacts to widespread tech issues",
                "https://a.example/1",
            ),
            article(
                "Nvidia chairman says board does not intend to reinstate Jensen Huang",
                "https://b.example/2",
                domain="b.example",
            ),
            # The same wire story from another outlet: shown once.
            article(
                "Nvidia chairman says board does NOT intend to reinstate Jensen Huang!",
                "https://c.example/3",
            ),
            article("Plain http is refused", "http://d.example/4"),
            article("No time", "https://e.example/5", when="yesterday"),
            article("", "https://f.example/6"),
        ]
    }
)


def test_headlines_are_tidied_deduplicated_and_kept_safe() -> None:
    got = parse_doc(SAMPLE)
    assert [h.title for h in got] == [
        "Serious for many reason: analyst reacts to widespread tech issues",
        "Nvidia chairman says board does not intend to reinstate Jensen Huang",
    ]
    assert all(h.url.startswith("https://") for h in got)
    assert (
        got[1].domain == "b.example" and got[1].seen_at.isoformat() == "2026-11-18T01:15:00+00:00"
    )
    assert got[0].headline_id.startswith("gdelt-")


def test_tidy_puts_punctuation_back() -> None:
    assert (
        tidy("tech issues , experts say ( for now ) : 5 %")
        == "tech issues, experts say (for now): 5%"
    )


def test_a_text_reply_is_an_error_not_a_crash() -> None:
    with pytest.raises(GdeltError, match="did not return JSON"):
        parse_doc("Please limit requests to one every 5 seconds")
    with pytest.raises(GdeltError, match="no article list"):
        parse_doc(json.dumps({"articles": "nope"}))


def test_the_query_asks_for_recent_english_articles_as_json() -> None:
    url = doc_url()
    assert url.startswith("https://api.gdeltproject.org/api/v2/doc/doc?")
    assert "format=json" in url and "mode=artlist" in url and "sourcelang%3Aenglish" in url


def test_headlines_get_the_free_labelers_answer_and_go_to_the_label_page() -> None:
    items = parse_doc(
        json.dumps(
            {
                "articles": [
                    article(
                        "SEC charges Coinbase with operating an unregistered exchange",
                        "https://x.example/1",
                    )
                ]
            }
        )
    )
    [h] = label_headlines(items)
    assert h.event_type == "REGULATORY_ACTION" and h.entities == ["COIN"]
    [c] = headline_candidates([h])
    assert c.source == "gdelt-example.com" and c.title == h.title


def test_site_build_carries_headlines_and_survives_a_gdelt_outage(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    events = tmp_path / "events"
    events.mkdir()
    monkeypatch.chdir(tmp_path)  # the ledger store (events/) must stay untouched
    common = [
        "export-site",
        "--claims-dir",
        str(CLAIMS),
        "--data",
        str(FIXTURES),
        "--predictions",
        str(tmp_path / "p"),
        "--outcomes",
        str(tmp_path / "o"),
        "--boot",
        "100",
    ]

    monkeypatch.setattr(cli, "http_get", lambda url: SAMPLE)
    ok = runner.invoke(cli.app, [*common, "--out", str(tmp_path / "a"), "--live-headlines"])
    assert ok.exit_code == 0, ok.output
    site = json.loads((tmp_path / "a" / "site.json").read_text())
    assert len(site["headlines"]) == 2
    assert list(events.iterdir()) == [], "live headlines are never written to the ledger"

    def down(url: str) -> str:
        raise cli.FetchError("GET https://api.gdeltproject.org failed: HTTP 503")

    monkeypatch.setattr(cli, "http_get", down)
    (tmp_path / "data" / "headlines.json").unlink()  # no previous build to fall back on
    monkeypatch.setattr("spillover.ingest.gdelt.time.sleep", lambda s: None)
    bad = runner.invoke(cli.app, [*common, "--out", str(tmp_path / "b"), "--live-headlines"])
    assert bad.exit_code == 0, bad.output
    assert "no live headlines this build" in bad.output
    assert json.loads((tmp_path / "b" / "site.json").read_text())["headlines"] == []


def test_too_many_requests_is_retried_after_a_wait() -> None:
    from spillover.ingest.gdelt import fetch_headlines
    from spillover.ingest.http import FetchError

    calls: list[str] = []
    waits: list[float] = []

    def fetch(url: str) -> str:
        calls.append(url)
        if len(calls) < 3:
            raise FetchError("GET https://api.gdeltproject.org/x failed: HTTP 429")
        return SAMPLE

    assert len(fetch_headlines(fetch, sleep=waits.append)) == 2
    assert len(calls) == 3 and waits == [8.0, 16.0]

    def always(url: str) -> str:
        raise FetchError("GET https://api.gdeltproject.org/x failed: HTTP 429")

    with pytest.raises(FetchError):
        fetch_headlines(always, sleep=lambda s: None)


def test_the_last_good_fetch_is_reused_for_a_day_and_a_half(tmp_path: Path) -> None:
    from datetime import UTC, datetime, timedelta

    from spillover.ingest.gdelt import load_cache, save_cache

    path = tmp_path / "headlines.json"
    items = parse_doc(SAMPLE)
    t0 = datetime(2026, 11, 18, 12, tzinfo=UTC)
    save_cache(items, path, t0)
    assert load_cache(path, t0 + timedelta(hours=30)) == items
    assert load_cache(path, t0 + timedelta(hours=37)) is None
    assert load_cache(tmp_path / "missing.json", t0) is None
    path.write_text("{not json")
    assert load_cache(path, t0) is None


def test_a_refused_build_shows_the_previous_builds_headlines(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.chdir(tmp_path)
    common = [
        "export-site",
        "--claims-dir",
        str(CLAIMS),
        "--data",
        str(FIXTURES),
        "--predictions",
        str(tmp_path / "p"),
        "--outcomes",
        str(tmp_path / "o"),
        "--boot",
        "100",
        "--live-headlines",
    ]
    monkeypatch.setattr(cli, "http_get", lambda url: SAMPLE)
    assert runner.invoke(cli.app, [*common, "--out", str(tmp_path / "a")]).exit_code == 0

    def refused(url: str) -> str:
        raise cli.FetchError("GET https://api.gdeltproject.org failed: HTTP 429")

    monkeypatch.setattr(cli, "http_get", refused)
    monkeypatch.setattr("spillover.ingest.gdelt.time.sleep", lambda s: None)
    r = runner.invoke(cli.app, [*common, "--out", str(tmp_path / "b")])
    assert r.exit_code == 0 and "from the previous build" in r.output
    assert len(json.loads((tmp_path / "b" / "site.json").read_text())["headlines"]) == 2


def test_off_topic_spam_and_syndicated_copies_are_left_out() -> None:
    raw = parse_doc(
        json.dumps(
            {
                "articles": [
                    article(
                        "Nvidia Exceeds Q3 Expectations Amid CEO Huang Exit | News Radio 101.9 WAAX",
                        "https://r1.example/a",
                    ),
                    article(
                        "Nvidia Exceeds Q3 Expectations Amid CEO Huang Exit | Newsradio WFLA Orlando",
                        "https://r2.example/b",
                    ),
                    article(
                        "ILLR Shareholder Alert: December 14, 2026 Lead Plaintiff Deadline in...",
                        "https://pr.example/c",
                    ),
                    article(
                        "MLS # 2652035: 9622 Perry Lane B, Overland Park, KS 66212",
                        "https://homes.example/d",
                    ),
                    article(
                        "Beyond the Blueprint: The Art of Building an Architectural Legacy",
                        "https://mag.example/e",
                    ),
                    article(
                        "China Expand Tariff Relief as Carney Meets Xi", "https://news.example/f"
                    ),
                ]
            }
        )
    )
    assert [h.title for h in raw][0] == "Nvidia Exceeds Q3 Expectations Amid CEO Huang Exit"
    assert len(raw) == 4, "the second syndicated copy and the class-action notice are dropped"
    shown = [h.title for h in label_headlines(raw)]
    assert shown == [
        "Nvidia Exceeds Q3 Expectations Amid CEO Huang Exit",
        "China Expand Tariff Relief as Carney Meets Xi",
    ]


def test_only_https_preview_images_are_kept_as_links() -> None:
    body = json.dumps(
        {
            "articles": [
                {
                    **article("Stocks rally on rate hopes", "https://a.example/1"),
                    "socialimage": "https://a.example/og.jpg",
                },
                {
                    **article("Oil slides on supply news", "https://b.example/2"),
                    "socialimage": "http://b.example/og.jpg",
                },
                {
                    **article("Chipmaker earnings beat", "https://c.example/3"),
                    "socialimage": "javascript:alert(1)",
                },
            ]
        }
    )
    got = parse_doc(body)
    assert [h.image for h in got] == ["https://a.example/og.jpg", None, None]
