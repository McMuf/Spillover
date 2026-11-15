import json
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
        assert c.status == "Draft", "seed claims are not registered yet"
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
    assert parsed.scoreboard.claims == []  # drafts never appear on the scoreboard
