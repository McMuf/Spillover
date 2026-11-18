"""Company events from SEC 8-K filings, typed by item number."""

import json
from pathlib import Path

import pytest
from typer.testing import CliRunner

from spillover.cli import app
from spillover.eventstore import load_records
from spillover.ingest.filings import (
    PAGE_SIZE,
    TICKERS_URL,
    FilingsError,
    current_url,
    filing_records,
    parse_current,
    parse_tickers,
    run_filings,
)
from spillover.ingest.http import FetchError, sec_fetcher
from spillover.site_export import build_labeling
from spillover.taxonomy import ALL_NAMES, EXTRACTABLE_NAMES

runner = CliRunner()


def entry(form: str, name: str, cik: int, acc: str, items: list[str], when: str) -> str:
    lines = "".join(f"&lt;br&gt;Item {i}: Something" for i in items)
    return f"""
<entry>
<title>{form} - {name} ({cik:010d}) (Filer)</title>
<link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/{cik}/{acc.replace("-", "")}/{acc}-index.htm"/>
<summary type="html"> &lt;b&gt;Filed:&lt;/b&gt; 2026-11-17 &lt;b&gt;AccNo:&lt;/b&gt; {acc} &lt;b&gt;Size:&lt;/b&gt; 250 KB{lines}</summary>
<updated>{when}</updated>
<category scheme="https://www.sec.gov/" label="form type" term="{form}"/>
<id>urn:tag:sec.gov,2008:accession-number={acc}</id>
</entry>"""


def feed(*entries: str) -> str:
    return (
        '<?xml version="1.0" encoding="ISO-8859-1" ?>'
        '<feed xmlns="http://www.w3.org/2005/Atom"><title>Latest Filings</title>'
        + "".join(entries)
        + "</feed>"
    )


SAMPLE = feed(
    entry(
        "8-K",
        "Acme Air Inc",
        111,
        "0000000111-26-000001",
        ["1.05", "9.01"],
        "2026-11-17T16:30:00-05:00",
    ),
    entry(
        "8-K", "Acme Air Inc", 111, "0000000111-26-000002", ["5.02"], "2026-11-17T12:00:00-05:00"
    ),
    entry("8-K/A", "Bolt Corp", 222, "0000000222-26-000003", ["1.05"], "2026-11-17T11:00:00-05:00"),
    entry(
        "8-K",
        "Cobalt Holdings",
        333,
        "0000000333-26-000004",
        ["1.03", "4.02"],
        "2026-11-17T09:00:00-05:00",
    ),
    # Listed twice, once under a subsidiary with no ticker: the same filing counts once.
    entry(
        "8-K",
        "Cobalt Sub LLC",
        444,
        "0000000333-26-000004",
        ["1.03", "4.02"],
        "2026-11-17T09:00:00-05:00",
    ),
    entry(
        "8-K",
        "Private Debt Issuer",
        555,
        "0000000555-26-000005",
        ["1.05"],
        "2026-11-17T08:00:00-05:00",
    ),
)


def tickers_json(extra: dict[int, str] | None = None) -> str:
    rows = {
        str(i): {"cik_str": 10_000 + i, "ticker": f"T{i}", "title": f"Co {i}"} for i in range(1200)
    }
    for n, (cik, t) in enumerate((extra or {111: "ACAIR", 333: "CBLT"}).items()):
        rows[f"x{n}"] = {"cik_str": cik, "ticker": t, "title": t}
    return json.dumps(rows)


def test_the_feed_is_parsed_into_filings_with_their_items() -> None:
    filings, n = parse_current(SAMPLE)
    assert n == 6 and len(filings) == 6
    first = filings[0]
    assert (first.form, first.cik, first.company, first.items) == (
        "8-K",
        111,
        "Acme Air Inc",
        ("1.05", "9.01"),
    )
    assert first.accession == "0000000111-26-000001"
    assert first.accepted_at.isoformat() == "2026-11-17T21:30:00+00:00"  # kept timezone-aware
    assert first.url.startswith("https://www.sec.gov/Archives/")


def test_only_unambiguous_items_become_events_and_amendments_are_ignored() -> None:
    filings, _ = parse_current(SAMPLE)
    records, no_ticker = filing_records(filings, parse_tickers(tickers_json()))
    got = sorted((r.event_type, r.entities[0]) for r in records)
    assert got == [("BANKRUPTCY", "CBLT"), ("CYBER_INCIDENT", "ACAIR"), ("RESTATEMENT", "CBLT")]
    assert no_ticker == ["Private Debt Issuer (0000000555-26-000005)"]
    for r in records:
        assert r.confidence == "high" and not r.needs_review
        assert r.source == "sec-8k" and r.extractor_version == "sec-8k-items/2"
    cyber = next(r for r in records if r.event_type == "CYBER_INCIDENT")
    assert cyber.title == "Acme Air Inc (ACAIR) 8-K Item 1.05: Material Cybersecurity Incidents"


def test_filing_types_are_in_the_taxonomy_but_never_from_headlines() -> None:
    new = {"CYBER_INCIDENT", "BANKRUPTCY", "RESTATEMENT"}
    assert new <= ALL_NAMES and not new & EXTRACTABLE_NAMES


def test_an_html_page_or_a_short_ticker_list_is_refused() -> None:
    with pytest.raises(FilingsError, match="web page"):
        parse_current("<!DOCTYPE html><html><title>Undeclared Automated Tool</title></html>")
    with pytest.raises(FilingsError, match="only 1 companies"):
        parse_tickers(json.dumps({"0": {"cik_str": 1, "ticker": "A", "title": "A"}}))


def pager(pages: list[str]) -> tuple[list[str], object]:
    calls: list[str] = []

    def fetch(url: str) -> str:
        calls.append(url)
        if url == TICKERS_URL:
            return tickers_json()
        start = int(url.split("start=")[1].split("&")[0])
        return pages[start // PAGE_SIZE]

    return calls, fetch


def test_a_run_writes_new_events_once_and_stops_at_a_short_page(tmp_path: Path) -> None:
    calls, fetch = pager([SAMPLE])
    s = run_filings(fetch, tmp_path, max_pages=5)  # type: ignore[arg-type]
    assert (s.pages, s.matched, s.written, s.reached_limit) == (1, 3, 3, False)
    assert calls == [TICKERS_URL, current_url("8-K", 0)]
    again = run_filings(fetch, tmp_path, max_pages=5)  # type: ignore[arg-type]
    assert again.written == 0 and len(load_records(tmp_path)) == 3


def test_full_pages_are_followed_up_to_the_limit_and_flagged(tmp_path: Path) -> None:
    full = feed(
        *(
            entry(
                "8-K",
                "Filler",
                900,
                f"0000000900-26-{i:06d}",
                ["8.01"],
                "2026-11-17T10:00:00-05:00",
            )
            for i in range(PAGE_SIZE)
        )
    )
    calls, fetch = pager([full, full, full])
    s = run_filings(fetch, tmp_path, max_pages=2)  # type: ignore[arg-type]
    assert s.pages == 2 and s.reached_limit and s.written == 0
    assert len(calls) == 3


def test_a_403_says_what_to_fix(tmp_path: Path) -> None:
    def fetch(url: str) -> str:
        raise FetchError(f"GET {url} failed: HTTP 403")

    with pytest.raises(FilingsError, match="SEC_CONTACT"):
        run_filings(fetch, tmp_path)


@pytest.mark.parametrize(
    "bad", ["", "not-an-email", "a@b.com\r\nX-Evil: 1", "a@b.com other@c.com", "a@b"]
)
def test_the_contact_must_be_exactly_one_email(bad: str) -> None:
    with pytest.raises(FetchError, match="one email address"):
        sec_fetcher(bad)


def test_the_sec_fetcher_only_talks_to_sec() -> None:
    fetch = sec_fetcher("someone@example.com")
    with pytest.raises(FetchError, match="only fetches from sec.gov"):
        fetch("https://evilsec.gov/files/company_tickers.json")


def test_filing_events_are_not_offered_for_labeling(tmp_path: Path) -> None:
    _, fetch = pager([SAMPLE])
    run_filings(fetch, tmp_path)  # type: ignore[arg-type]
    labeling = build_labeling(tmp_path, tmp_path / "no-gold.jsonl", tmp_path / "none.json")
    assert labeling.candidates == []


def test_the_command_skips_cleanly_without_a_contact(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    cfg = tmp_path / "sources.toml"
    cfg.write_text(
        '[[series]]\nsymbol = "SPX"\nprovider = "fred"\nid = "SP500"\n\n'
        f'[extractor]\nstore = "{tmp_path / "events"}"\n\n'
        '[[filings]]\nterms = "public domain"\n'
    )
    monkeypatch.delenv("SEC_CONTACT", raising=False)
    result = runner.invoke(app, ["ingest-filings", "--config", str(cfg)])
    assert result.exit_code == 0, result.output
    assert "skipped: SEC_CONTACT is not set" in result.output


def test_the_sec_fetcher_sends_secs_documented_declaration(monkeypatch: pytest.MonkeyPatch) -> None:
    import spillover.ingest.http as http

    seen: dict[str, object] = {}

    def fake_get(url: str, **kw: object) -> str:
        seen.update(kw, url=url)
        return "{}"

    monkeypatch.setattr(http, "http_get", fake_get)
    sec_fetcher("someone@example.com")("https://www.sec.gov/files/company_tickers.json")
    # "Sample Company Name AdminContact@<sample company domain>.com" (sec.gov/os/accessing-edgar-data)
    assert seen["user_agent"] == "Spillover Research Project someone@example.com"
    assert seen["headers"] == {"Accept-Encoding": "gzip, deflate"}


def test_item_3_01_is_ignored_because_it_also_covers_moving_exchanges() -> None:
    """3.01 is "Notice of Delisting...; Transfer of Listing": a warning or a voluntary move."""
    moving = feed(
        entry(
            "8-K",
            "Healthy Corp",
            111,
            "0000000111-26-000009",
            ["3.01", "7.01"],
            "2026-11-17T16:30:00-05:00",
        )
    )
    filings, _ = parse_current(moving)
    records, _ = filing_records(filings, parse_tickers(tickers_json()))
    assert records == []
    assert "DELISTING_NOTICE" not in ALL_NAMES


def test_retracted_events_stay_in_the_store_but_leave_every_analysis(tmp_path: Path) -> None:
    import polars as pl

    from spillover.eventstore import append_records, events_frame, make_record, read_retracted
    from spillover.ingest.store import EVENT_SCHEMA

    def rec(hid: str, ticker: str) -> object:
        from datetime import UTC, datetime

        return make_record(
            headline_id=hid,
            title=f"{ticker} 8-K",
            url="https://www.sec.gov/x",
            source="sec-8k",
            published_at=datetime(2026, 11, 17, 21, tzinfo=UTC),
            event_type="RESTATEMENT",
            entities=[ticker],
            confidence="high",
            needs_review=False,
            extractor_version="t",
        )

    append_records(tmp_path, [rec("a", "AAA"), rec("b", "BBB")])  # type: ignore[list-item]
    listed = tmp_path / "retracted.txt"
    listed.write_text("# wrong rule\nRESTATEMENT|AAA|2026-11-17  # why\n")
    retracted = frozenset(read_retracted(listed))
    frame = events_frame(load_records(tmp_path), set(), EVENT_SCHEMA, retracted).events
    assert frame["entity"].to_list() == ["BBB"]
    assert len(load_records(tmp_path)) == 2, "the store itself is never edited"
    assert isinstance(frame, pl.DataFrame)


def test_the_committed_retractions_name_real_stored_events() -> None:
    from spillover.eventstore import RETRACTED_FILE, read_retracted

    root = Path(__file__).resolve().parents[2]
    keys = read_retracted(root / RETRACTED_FILE)
    stored = {r.event_key for r in load_records(root / "events")}
    assert keys <= stored, f"retracted keys not in the store: {sorted(keys - stored)[:3]}"
