import json
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any, Literal

import pytest
from typer.testing import CliRunner

import spillover.cli as cli_module
from spillover.cli import app
from spillover.data import load_market_data
from spillover.eventstore import (
    EventRecord,
    append_records,
    events_frame,
    load_records,
    make_record,
    read_confirmed,
    store_files,
)
from spillover.extractor import extractor_version
from spillover.gold import GoldError, GoldRow, evaluate_gold, load_gold, write_candidates
from spillover.ingest.config import load_config
from spillover.ingest.headline_run import run_headlines
from spillover.ingest.headlines import FeedError, parse_feed
from spillover.ingest.http import FetchError
from spillover.ingest.store import EVENT_SCHEMA, build_cache
from spillover.ledger import predict
from spillover.models import load_claim

from .conftest import ROOT
from .test_extractor import GOOD, FakeLlm
from .test_ingest import business_days, walk
from .test_models import write

runner = CliRunner()

FED_RSS = """﻿<?xml version="1.0" encoding="utf-8" ?>
<rss version="2.0"><channel><title>Press</title>
<item><title>Acme reports Q3 results below expectations </title>
<link><![CDATA[https://example.gov/a]]></link><guid><![CDATA[https://example.gov/a]]></guid>
<pubDate><![CDATA[Fri, 13 Nov 2026 21:15:00 GMT]]></pubDate></item>
<item><title>   Beta Corp raises capex plans
for 2027  </title><link>https://example.gov/b</link>
<pubDate>Thu, 12 Nov 2026 11:57:00 -0500</pubDate></item>
<item><title>No timezone</title><link>https://example.gov/c</link><pubDate>Thu, 12 Nov 2026 11:57:00 -0000</pubDate></item>
<item><title>Bad link</title><link>javascript:alert(1)</link><pubDate>Thu, 12 Nov 2026 11:57:00 GMT</pubDate></item>
<item><title>Duplicate of the first</title><link>https://example.gov/a</link><guid>https://example.gov/a</guid>
<pubDate>Fri, 13 Nov 2026 21:15:00 GMT</pubDate></item>
</channel></rss>"""

ATOM = """<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
<entry><title>Gamma announces acquisition</title><link rel="alternate" href="https://example.org/g"/>
<id>tag:example.org,2026:g</id><updated>2026-11-10T09:30:00Z</updated></entry></feed>"""

BOMB = """<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;">]>
<rss version="2.0"><channel><item><title>&b;</title><link>https://x.test/</link>
<pubDate>Fri, 13 Nov 2026 21:15:00 GMT</pubDate></item></channel></rss>"""


# --- feed parsing -------------------------------------------------------------------------------


def test_rss_is_parsed_with_verifiable_times_only() -> None:
    parsed = parse_feed(FED_RSS, "fed")
    titles = [h.title for h in parsed.headlines]
    assert titles == [
        "Acme reports Q3 results below expectations",
        "Beta Corp raises capex plans for 2027",
    ]
    first, second = parsed.headlines
    assert first.published_at == datetime(2026, 11, 13, 21, 15, tzinfo=UTC)
    assert second.published_at == datetime(2026, 11, 12, 16, 57, tzinfo=UTC), (
        "-0500 converted to UTC"
    )
    assert len(parsed.skipped) == 2, (
        "a time without a zone and a non-http link are skipped, not guessed"
    )


def test_atom_is_parsed_too() -> None:
    (h,) = parse_feed(ATOM, "atomfeed").headlines
    assert h.url == "https://example.org/g" and h.published_at == datetime(
        2026, 11, 10, 9, 30, tzinfo=UTC
    )


def test_headline_ids_are_stable_and_source_specific() -> None:
    a1, a2 = parse_feed(FED_RSS, "fed").headlines[0], parse_feed(FED_RSS, "fed").headlines[0]
    other = parse_feed(FED_RSS, "different-source").headlines[0]
    assert a1.headline_id == a2.headline_id != other.headline_id


def test_hostile_or_broken_feeds_are_refused() -> None:
    with pytest.raises(FeedError, match="not a readable feed"):
        parse_feed(BOMB, "evil")  # entity-expansion bomb: defusedxml refuses it
    with pytest.raises(FeedError):
        parse_feed("<html>this is not a feed</html", "x")
    with pytest.raises(FeedError, match="no items"):
        parse_feed('<rss version="2.0"><channel></channel></rss>', "x")


# --- the event store ----------------------------------------------------------------------------


def rec(
    headline_id: str,
    when: datetime,
    etype: str = "EARNINGS_MISS",
    entities: list[str] | None = None,
    conf: Literal["high", "medium", "low"] = "high",
    url: str = "https://example.com/x",
    source: str = "wire",
) -> EventRecord:
    return make_record(
        headline_id=headline_id,
        title=f"title {headline_id}",
        url=url,
        source=source,
        published_at=when,
        event_type=etype,
        entities=entities or ["ACME"],
        confidence=conf,
        needs_review=conf == "low" and etype != "NONE",
        extractor_version="m/p1-abc",  # type: ignore[arg-type]
    )


def test_the_store_is_append_only_and_idempotent(tmp_path: Path) -> None:
    a = rec("a", datetime(2026, 10, 30, 12, tzinfo=UTC))
    b = rec("b", datetime(2026, 11, 2, 12, tzinfo=UTC))
    assert append_records(tmp_path, [b, a]) == 2
    assert [p.name for p in store_files(tmp_path)] == ["2026-10.jsonl", "2026-11.jsonl"]
    before = {p.name: p.read_text() for p in store_files(tmp_path)}

    assert append_records(tmp_path, [a, b]) == 0, "re-running writes nothing"
    c = rec("c", datetime(2026, 11, 5, 12, tzinfo=UTC))
    assert append_records(tmp_path, [c]) == 1
    after = {p.name: p.read_text() for p in store_files(tmp_path)}
    assert after["2026-10.jsonl"] == before["2026-10.jsonl"], "an old month is never touched"
    assert after["2026-11.jsonl"].startswith(before["2026-11.jsonl"]), "new lines only ever append"
    assert [r.headline_id for r in load_records(tmp_path)] == ["a", "b", "c"]


def test_the_same_story_from_many_sources_is_one_event(tmp_path: Path) -> None:
    t = datetime(2026, 11, 3, 14, tzinfo=UTC)
    records = [
        rec("w1", t.replace(hour=15), url="https://later.example/1", source="wire-b"),
        rec("w2", t, url="https://first.example/1", source="wire-a"),
        rec("w3", t.replace(hour=20), url="https://third.example/1", source="wire-c"),
    ]
    frame = events_frame(records, set(), EVENT_SCHEMA)
    assert frame.n_groups == 1 and frame.events.height == 1, "15 links would still be one event"
    row = frame.events.row(0, named=True)
    assert row["source"] == "https://first.example/1", (
        "dated and sourced by the earliest publication"
    )
    assert row["entity"] == "ACME" and row["extractor_version"] == "m/p1-abc"


def test_none_events_and_unconfirmed_low_confidence_events_are_excluded() -> None:
    t = datetime(2026, 11, 3, 14, tzinfo=UTC)
    records = [
        rec("n", t, "NONE", []),
        rec("s", t.replace(day=4), conf="low", entities=["SHAKY"]),
        rec("ok", t.replace(day=5), entities=["SOLID"]),
    ]
    frame = events_frame(records, set(), EVENT_SCHEMA)
    assert frame.events["entity"].to_list() == ["SOLID"] and frame.n_needs_review == 1

    shaky_key = records[1].event_key
    confirmed = events_frame(records, {shaky_key}, EVENT_SCHEMA)
    assert sorted(confirmed.events["entity"].to_list()) == ["SHAKY", "SOLID"]


def test_confirmed_file_ignores_comments_and_blanks(tmp_path: Path) -> None:
    f = tmp_path / "confirmed.txt"
    f.write_text("# reviewed by a person\nEARNINGS_MISS|ACME|2026-11-03   # looked right\n\n")
    assert read_confirmed(f) == {"EARNINGS_MISS|ACME|2026-11-03"}
    assert read_confirmed(tmp_path / "missing.txt") == set()


# --- the headline pipeline ----------------------------------------------------------------------


def make_config(tmp_path: Path, extra: str = "") -> Path:
    cfg = tmp_path / "sources.toml"
    cfg.write_text(
        f'[extractor]\nmodel = "fake-model"\nstore = "{tmp_path / "events"}"\n'
        f'cache = "{tmp_path / "events" / "extractions"}"\n'
        f"{extra}"
        '[[series]]\nsymbol = "SPX"\nprovider = "csv"\npath = "x.csv"\n'
        '[[headlines]]\nname = "fed"\nurl = "https://feeds.example/fed.xml"\nterms = "US government work"\n'
        '[[headlines]]\nname = "atomfeed"\nurl = "https://feeds.example/atom.xml"\nterms = "public"\n'
    )
    return cfg


def fetcher(pages: dict[str, str]) -> Any:
    def fetch(url: str) -> str:
        if url not in pages:
            raise FetchError(f"GET {url} failed: HTTP 500")
        return pages[url]

    return fetch


PAGES = {"https://feeds.example/fed.xml": FED_RSS, "https://feeds.example/atom.xml": ATOM}


def test_a_pass_extracts_stores_and_a_rerun_costs_nothing(tmp_path: Path) -> None:
    cfg = load_config(make_config(tmp_path))
    llm = FakeLlm(GOOD)
    first = run_headlines(cfg, fetcher(PAGES), llm)
    assert (first.feeds_ok, first.fetched, first.written, first.live_calls) == (2, 3, 3, 3)
    assert llm.calls == 3 and len(load_records(cfg.extractor.store)) == 3

    again = run_headlines(cfg, fetcher(PAGES), llm)
    assert again.written == 0 and again.already_stored == 3 and llm.calls == 3, (
        "no repeat model calls"
    )


def test_the_cache_alone_rebuilds_the_store_with_no_api_key(tmp_path: Path) -> None:
    cfg = load_config(make_config(tmp_path))
    run_headlines(cfg, fetcher(PAGES), FakeLlm(GOOD))
    for p in store_files(cfg.extractor.store):
        p.unlink()  # lose the store but keep the committed cache
    redo = run_headlines(cfg, fetcher(PAGES), None)
    assert redo.written == 3 and redo.from_cache == 3 and redo.live_calls == 0


def test_without_a_key_unseen_headlines_wait_and_nothing_is_invented(tmp_path: Path) -> None:
    cfg = load_config(make_config(tmp_path))
    out = run_headlines(cfg, fetcher(PAGES), None)
    assert out.written == 0 and out.pending_no_client == 3
    assert load_records(cfg.extractor.store) == []


def test_one_broken_feed_does_not_stop_the_others(tmp_path: Path) -> None:
    cfg = load_config(make_config(tmp_path))
    out = run_headlines(cfg, fetcher({"https://feeds.example/atom.xml": ATOM}), FakeLlm(GOOD))
    assert out.feeds_ok == 1 and out.written == 1 and len(out.feed_errors) == 1


def test_the_cost_cap_defers_the_rest_oldest_first(tmp_path: Path) -> None:
    cfg = load_config(make_config(tmp_path))
    capped = cfg.model_copy(
        update={"extractor": cfg.extractor.model_copy(update={"max_new_per_run": 1})}
    )
    out = run_headlines(capped, fetcher(PAGES), FakeLlm(GOOD))
    assert out.written == 1 and out.deferred_by_cap == 2
    assert load_records(capped.extractor.store)[0].title == "Gamma announces acquisition", (
        "oldest first"
    )


def test_a_rejected_answer_is_reported_and_not_stored(tmp_path: Path) -> None:
    cfg = load_config(make_config(tmp_path))
    out = run_headlines(cfg, fetcher(PAGES), FakeLlm('{"event_type": "MADE_UP"}'))
    assert out.written == 0 and len(out.extraction_errors) == 3


# --- gold set -----------------------------------------------------------------------------------


def test_the_gold_loader_refuses_unlabeled_rows(tmp_path: Path) -> None:
    f = tmp_path / "gold.jsonl"
    f.write_text(json.dumps({"title": "t", "source": "s", "expected_type": ""}) + "\n")
    with pytest.raises(GoldError, match="not been labeled"):
        load_gold(f)
    with pytest.raises(GoldError, match="not found"):
        load_gold(tmp_path / "nope.jsonl")
    f.write_text(json.dumps({"title": "t", "source": "s", "expected_type": "MADE_UP"}) + "\n")
    with pytest.raises(GoldError, match="taxonomy"):
        load_gold(f)


def test_gold_accuracy_is_measured_per_row_and_tied_to_the_labels(tmp_path: Path) -> None:
    rows = [
        GoldRow(
            title="Acme misses",
            source="wire",
            expected_type="EARNINGS_MISS",
            expected_entities=["ACME"],
        ),
        GoldRow(title="Weather is nice", source="wire", expected_type="NONE"),
    ]
    llm = FakeLlm(GOOD)  # always says EARNINGS_MISS / ACME
    report = evaluate_gold(rows, "sha-of-labels", llm, tmp_path / "cache")
    assert (report.n_total, report.n_scored, report.type_accuracy) == (2, 2, 0.5)
    assert report.entity_precision == 0.5 and report.entity_recall == 1.0
    assert report.mismatches == [
        {"title": "Weather is nice", "expected": "NONE", "got": "EARNINGS_MISS"}
    ]
    assert report.gold_sha256 == "sha-of-labels"
    assert report.extractor_version == extractor_version("fake-model")

    # Without a client, only cached rows are scored; the rest are reported, never guessed.
    offline = evaluate_gold(rows, "x", None, tmp_path / "cache", "fake-model")
    assert offline.n_scored == 2
    empty = evaluate_gold(rows, "x", None, tmp_path / "other", "fake-model")
    assert empty.n_scored == 0 and empty.n_unscored == 2 and empty.type_accuracy is None


def test_gold_candidates_are_written_unlabeled(tmp_path: Path) -> None:
    append_records(
        tmp_path / "events",
        [rec("a", datetime(2026, 11, 3, tzinfo=UTC)), rec("b", datetime(2026, 11, 4, tzinfo=UTC))],
    )
    out = tmp_path / "labels" / "gold_candidates.jsonl"
    assert write_candidates(tmp_path / "events", out, 10) == 2
    rows = [json.loads(line) for line in out.read_text().splitlines()]
    assert all(r["expected_type"] == "" for r in rows), "labels are a person's job"
    with pytest.raises(GoldError):
        load_gold(out)


# --- end to end: headline -> event -> cache -> frozen prediction --------------------------------


def test_an_extracted_event_flows_to_a_prediction_that_records_the_extractor(
    tmp_path: Path,
) -> None:
    cfg_path = make_config(tmp_path)
    cfg = load_config(cfg_path)
    # A headline published after the price data ends, so its window is still open.
    future = FED_RSS.replace("Fri, 13 Nov 2026 21:15:00 GMT", "Tue, 05 Jan 2027 15:00:00 GMT")
    run_headlines(
        cfg,
        fetcher({"https://feeds.example/fed.xml": future, "https://feeds.example/atom.xml": ATOM}),
        FakeLlm(GOOD),
    )

    days = business_days(1000)
    (tmp_path / "px.csv").write_text(
        "Date,Close\n" + "".join(f"{d},{v:.4f}\n" for d, v in walk(days, 5).items())
    )
    (tmp_path / "xlk.csv").write_text(
        "Date,Close\n" + "".join(f"{d},{v:.4f}\n" for d, v in walk(days, 6).items())
    )
    sources = tmp_path / "ingest.toml"
    sources.write_text(
        f'[data]\nout = "{tmp_path / "cache"}"\nstart = "2021-01-01"\n'
        f'[[series]]\nsymbol = "SPX"\nprovider = "csv"\npath = "{tmp_path / "px.csv"}"\n'
        f'[[series]]\nsymbol = "XLK"\nprovider = "csv"\npath = "{tmp_path / "xlk.csv"}"\n'
        '[[series]]\nsymbol = "MKT"\nprovider = "alias"\nof = "SPX"\n'
        f'[[events]]\ntype = "store"\npath = "{cfg.extractor.store}"\nconfirmed = "{tmp_path / "none.txt"}"\n'
    )
    summary = build_cache(load_config(sources), lambda url: "", {}, date(2027, 1, 1))
    assert summary.n_events == 3

    data = load_market_data(summary.out)
    assert "extractor_version" in data.events.columns
    assert set(data.events["extractor_version"].to_list()) == {extractor_version("fake-model")}

    claim = load_claim(
        write(
            tmp_path,
            id="clm_miss_v1",
            event_type="EARNINGS_MISS",
            trigger_entities=["ACME"],
            instrument={"venue": "us_equity", "symbol": "XLK"},
            registered_at="2025-06-01T00:00:00Z",
        )
    )
    result = predict([claim], data, tmp_path / "predictions", datetime(2027, 1, 5, 12, tzinfo=UTC))
    assert len(result.written) == 3, "three distinct events, all about ACME, all with open windows"
    for path in result.written:
        record = json.loads(path.read_text())
        assert record["extractor_version"] == extractor_version("fake-model"), (
            "the extractor is frozen into every prediction"
        )


# --- CLI and config -----------------------------------------------------------------------------


def test_the_example_config_has_feeds_with_terms_and_extractor_settings() -> None:
    cfg = load_config(ROOT / "data" / "sources.example.toml")
    assert cfg.headlines and all(f.terms for f in cfg.headlines)
    assert cfg.extractor.model == "claude-haiku-5-5" and 1 <= cfg.extractor.max_new_per_run <= 1000


def test_feeds_must_use_https_and_state_their_terms(tmp_path: Path) -> None:
    from spillover.ingest.config import ConfigError

    for bad in (
        'url = "http://x.example/f"\nterms = "ok"',
        'url = "https://x.example/f"\nterms = ""',
    ):
        p = tmp_path / "s.toml"
        p.write_text(
            '[[series]]\nsymbol="A"\nprovider="fred"\nid="X"\n[[headlines]]\nname="f"\n'
            + bad
            + "\n"
        )
        with pytest.raises(ConfigError):
            load_config(p)


def test_cli_ingest_headlines_without_a_key_says_what_waits(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    cfg_path = make_config(tmp_path)
    monkeypatch.setattr(cli_module, "http_get", fetcher(PAGES))
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    result = runner.invoke(app, ["ingest-headlines", "--config", str(cfg_path)])
    assert result.exit_code == 0, result.output
    assert (
        "wait for ANTHROPIC_API_KEY" in result.output and "new records written 0" in result.output
    )


def test_cli_ingest_headlines_with_a_model_writes_records(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    cfg_path = make_config(tmp_path)
    monkeypatch.setattr(cli_module, "http_get", fetcher(PAGES))
    monkeypatch.setattr(cli_module, "_llm_from_env", lambda *a, **k: FakeLlm(GOOD))
    result = runner.invoke(app, ["ingest-headlines", "--config", str(cfg_path)])
    assert result.exit_code == 0 and "new records written 3" in result.output, result.output


def test_cli_fails_when_no_feed_can_be_read(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    cfg_path = make_config(tmp_path)
    monkeypatch.setattr(cli_module, "http_get", fetcher({}))
    monkeypatch.setattr(cli_module, "_llm_from_env", lambda *a, **k: None)
    assert runner.invoke(app, ["ingest-headlines", "--config", str(cfg_path)]).exit_code == 1


def test_cli_gold_template_and_eval(tmp_path: Path) -> None:
    store = tmp_path / "events"
    append_records(store, [rec("a", datetime(2026, 11, 3, tzinfo=UTC))])
    out = tmp_path / "cand.jsonl"
    t = runner.invoke(app, ["gold-template", "--store", str(store), "--out", str(out)])
    assert t.exit_code == 0 and "unlabeled candidate" in t.output

    gold = tmp_path / "gold.jsonl"
    gold.write_text(
        json.dumps(
            {
                "title": "Acme misses",
                "source": "wire",
                "expected_type": "EARNINGS_MISS",
                "expected_entities": ["ACME"],
            }
        )
        + "\n"
    )
    e = runner.invoke(
        app,
        [
            "eval-extractor",
            "--gold",
            str(gold),
            "--cache",
            str(tmp_path / "c"),
            "--out",
            str(tmp_path / "acc.json"),
            "--engine",
            "claude",
        ],
        env={"ANTHROPIC_API_KEY": ""},
    )
    # Claude without a key cannot answer, so the row is reported unscored, never guessed.
    assert e.exit_code == 0 and json.loads((tmp_path / "acc.json").read_text())["n_unscored"] == 1
    free = runner.invoke(
        app,
        [
            "eval-extractor",
            "--gold",
            str(gold),
            "--cache",
            str(tmp_path / "c2"),
            "--out",
            str(tmp_path / "acc2.json"),
        ],
    )
    # The free rule-based labeler (the default) always answers, so every row is scored.
    assert (
        free.exit_code == 0 and json.loads((tmp_path / "acc2.json").read_text())["n_unscored"] == 0
    )
