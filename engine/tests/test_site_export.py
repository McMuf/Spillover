import json
from datetime import datetime
from pathlib import Path

import pytest
from typer.testing import CliRunner

from spillover.cli import app
from spillover.data import MarketData
from spillover.eventstudy import mean_window_path, run_backtest
from spillover.models import Claim, load_claim
from spillover.site_export import SiteData, build_site_data, site_json_schema

from .conftest import CLAIMS, FIXTURES
from .test_models import write

runner = CliRunner()


def claims_with_text() -> list[tuple[Claim, str]]:
    out: list[tuple[Claim, str]] = []
    for p in sorted(CLAIMS.glob("clm_*.yaml")):
        out.append((load_claim(p), p.read_text()))
    return out


@pytest.fixture(scope="module")
def site(market: MarketData, tmp_path_factory: pytest.TempPathFactory) -> SiteData:
    empty = tmp_path_factory.mktemp("empty")
    return build_site_data(claims_with_text(), market, empty / "p", empty / "o", n_boot=500)


def test_site_data_covers_every_seed_claim(site: SiteData) -> None:
    ids = [c.claim.id for c in site.claims]
    assert ids == sorted(ids) and len(ids) >= 2
    assert site.meta.data_synthetic is True and site.meta.repo == "McMuf/Spillover"
    for c in site.claims:
        # Registered claims are Proposed (nothing graded yet); a claim that has not merged yet is a
        # Draft. Which is which depends on the claim file, so check the status against the file.
        registered = isinstance(c.claim.registered_at, datetime)
        assert c.status == ("Proposed" if registered else "Draft")
        assert c.backtest is not None and c.chart is not None
        assert "registered_at" in c.yaml, "the claim page shows the real YAML"


def test_every_event_belongs_to_a_claim_and_links_back(site: SiteData) -> None:
    claim_ids = {c.claim.id for c in site.claims}
    assert site.events
    for e in site.events:
        assert e.claims and all(cs.claim_id in claim_ids for cs in e.claims)
    by_id = {e.event_id for e in site.events}
    for c in site.claims:
        assert set(c.event_ids) <= by_id


def test_site_json_has_no_machine_local_data(site: SiteData) -> None:
    text = site.model_dump_json()
    for needle in ("/Users", "/private", "fixtures/", "data_root"):
        assert needle not in text


def test_export_is_deterministic(market: MarketData, tmp_path: Path) -> None:
    a = build_site_data(claims_with_text(), market, tmp_path / "p", tmp_path / "o", n_boot=300)
    b = build_site_data(claims_with_text(), market, tmp_path / "p", tmp_path / "o", n_boot=300)
    assert a.model_dump_json() == b.model_dump_json()


def test_chart_path_shows_the_injected_shock(market: MarketData, tmp_path: Path) -> None:
    """SYN2 was simulated with a -1.2% shock on day 0: the mean path must drop there."""
    claim = load_claim(
        write(
            tmp_path,
            id="clm_syn_shock_v1",
            event_type="SYN_SHOCK",
            trigger_entities=["SYNCO"],
            instrument={"venue": "us_equity", "symbol": "SYN2"},
        )
    )
    report = run_backtest(claim, market, n_boot=200)
    path = mean_window_path(claim, market, report.events)
    assert path is not None and path.n_events >= 15
    i0 = path.days.index(0)
    drop = path.mean[i0] - path.mean[i0 - 1]
    assert drop == pytest.approx(-1.2, abs=0.6)  # levels are indexed to 100, so points = percent
    assert path.days[0] == -40 and path.estimation_end == -10
    assert all(lo <= m <= hi for lo, m, hi in zip(path.lo, path.mean, path.hi, strict=True))


def test_schema_models_every_field_the_web_reads() -> None:
    schema = site_json_schema()
    assert set(schema["required"]) >= {"meta", "claims", "events", "scoreboard"}
    assert schema["additionalProperties"] is False


def test_cli_export_site_writes_valid_json(tmp_path: Path) -> None:
    out = tmp_path / "data"
    result = runner.invoke(
        app,
        [
            "export-site",
            "--claims-dir",
            str(CLAIMS),
            "--data",
            str(FIXTURES),
            "--out",
            str(out),
            "--predictions",
            str(tmp_path / "p"),
            "--outcomes",
            str(tmp_path / "o"),
            "--boot",
            "200",
        ],
    )
    assert result.exit_code == 0, result.output
    assert "SYNTHETIC" in result.output
    parsed = SiteData.model_validate(json.loads((out / "site.json").read_text()))
    # Registered claims appear on the scoreboard as Proposed, with nothing graded yet.
    assert {r.status for r in parsed.scoreboard.claims} == {"Proposed"}
    assert all(r.effective_events == 0 for r in parsed.scoreboard.claims)


def test_a_superseded_unpriced_claim_says_so_plainly(market: MarketData, tmp_path: Path) -> None:
    """Published text names what is missing and what replaced it, never a server path."""
    common = {
        "event_type": "RANDOM_DATE",
        "trigger_entities": ["NONE"],
        "registered_at": "2025-01-01T00:00:00Z",
    }
    old = write(
        tmp_path, id="clm_x_v1", instrument={"venue": "us_equity", "symbol": "ZZZ"}, **common
    )
    new = write(
        tmp_path, id="clm_x_v2", instrument={"venue": "us_index", "symbol": "SPX"}, **common
    )
    claims = [(load_claim(p), p.read_text()) for p in (old, new)]
    site = build_site_data(claims, market, tmp_path / "p", tmp_path / "o", n_boot=200)
    v1 = next(c for c in site.claims if c.claim.id == "clm_x_v1")
    assert v1.backtest is None and v1.backtest_error is not None
    assert v1.backtest_error.startswith("Superseded by clm_x_v2")
    assert "No price data for ZZZ" in v1.backtest_error
    assert str(market.root) not in v1.backtest_error and "/" not in v1.backtest_error


def test_the_claim_form_gets_every_event_type_with_its_history(
    site: SiteData, market: MarketData
) -> None:
    from spillover.taxonomy import TAXONOMY

    assert [t.name for t in site.taxonomy] == [t.name for t in TAXONOMY]
    by_name = {t.name: t for t in site.taxonomy}
    assert by_name["FOMC_DECISION"].origin == "calendar"
    assert by_name["CYBER_INCIDENT"].origin == "filings"
    fomc = market.events.filter(market.events["event_type"] == "FOMC_DECISION")
    assert by_name["FOMC_DECISION"].past_events == fomc["event_id"].n_unique()
    assert site.meta.priced_symbols == sorted(market.returns)


def test_news_lists_recent_real_events_with_their_sources(
    market: MarketData, tmp_path: Path
) -> None:
    from datetime import UTC, timedelta

    from spillover.eventstore import append_records, make_record

    # A headline event inside the window, stored the way ingest stores it.
    when = datetime.combine(market.as_of - timedelta(days=3), datetime.min.time(), tzinfo=UTC)
    rec = make_record(
        headline_id="h1",
        title="Acme Air reports a cyberattack",
        url="https://example.com/acme",
        source="test-feed",
        published_at=when,
        event_type="CYBER_INCIDENT",
        entities=["ACAIR"],
        confidence="high",
        needs_review=False,
        extractor_version="t",
    )
    append_records(tmp_path / "events", [rec])
    import polars as pl

    extra = pl.DataFrame(
        {
            "event_id": [rec.event_id, "rnd_bt_2025-01", "placebo_live"],
            "event_type": ["CYBER_INCIDENT", "RANDOM_DATE", "RANDOM_DATE"],
            "entity": ["ACAIR", "NONE", "NONE"],
            "date": [rec.date, market.as_of, market.as_of],
            "scheduled": [False, True, True],
            "source": [rec.url, "draw", "draw"],
        }
    ).with_columns(pl.col("date").cast(pl.Date))
    data = MarketData(
        market.root,
        market.synthetic,
        market.dates,
        market.returns,
        pl.concat([market.events, extra.select(market.events.columns)], how="vertical_relaxed"),
    )
    site = build_site_data(
        claims_with_text(),
        data,
        tmp_path / "p",
        tmp_path / "o",
        n_boot=200,
        store=tmp_path / "events",
    )
    ids = [s.event_id for s in site.news]
    assert rec.event_id in ids
    assert not any(s.origin == "control" for s in site.news), "placebo days are not news"
    assert "rnd_bt_2025-01" not in ids
    assert [s.date for s in site.news] == sorted((s.date for s in site.news), reverse=True)
    acme = next(s for s in site.news if s.event_id == rec.event_id)
    assert acme.origin == "filings" and acme.claim_ids == []
    assert acme.sources[0].title == "Acme Air reports a cyberattack"
    fomc = [s for s in site.news if s.event_type == "FOMC_DECISION"]
    assert fomc and all(s.claim_ids for s in fomc), "calendar events link the claims they trigger"
