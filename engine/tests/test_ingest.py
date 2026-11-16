import json
import random
from datetime import date, timedelta
from pathlib import Path

import pytest
from typer.testing import CliRunner

import spillover.cli as cli_module
from spillover.cli import app
from spillover.data import load_market_data
from spillover.eventstudy import run_backtest
from spillover.ingest.config import ConfigError, load_config
from spillover.ingest.fomc import FOMC_URL, FomcParseError, parse_fomc_calendar
from spillover.ingest.http import Fetcher, FetchError, redact
from spillover.ingest.prices import PriceError, parse_fred, read_csv_levels
from spillover.ingest.store import (
    FRED_KEY_ENV,
    IngestError,
    aligned_returns,
    build_cache,
    read_events_csv,
)
from spillover.models import load_claim

from .conftest import CLAIMS, ROOT

runner = CliRunner()

# A miniature of the Fed's page: same markup, invented rows covering every edge case.
FED_HTML = """
<div class="panel-heading"><h4><a id="1">2024 FOMC Meetings</a></h4></div>
<div class="row fomc-meeting"><div class="fomc-meeting__month col-xs-5"><strong>January</strong></div>
<div class="fomc-meeting__date col-xs-4">30-31</div></div>
<div class="row fomc-meeting"><div class="fomc-meeting__month col-xs-5"><strong>March</strong></div>
<div class="fomc-meeting__date col-xs-4">19-20*</div></div>
<div class="row fomc-meeting"><div class="fomc-meeting__month col-xs-5"><strong>Apr/May</strong></div>
<div class="fomc-meeting__date col-xs-4">30-1</div></div>
<div class="row fomc-meeting"><div class="fomc-meeting__month col-xs-5"><strong>August</strong></div>
<div class="fomc-meeting__date col-xs-4">22 (notation vote)</div></div>
<div class="panel-heading"><h4><a id="2">2025 FOMC Meetings</a></h4></div>
<div class="row fomc-meeting"><div class="fomc-meeting__month col-xs-5"><strong>Dec/Jan</strong></div>
<div class="fomc-meeting__date col-xs-4">30-1</div></div>
<div class="row fomc-meeting"><div class="fomc-meeting__month col-xs-5"><strong>June</strong></div>
<div class="fomc-meeting__date col-xs-4">17</div></div>
"""


# --- Fed calendar -----------------------------------------------------------------------------


def test_fomc_parser_handles_ranges_rollovers_and_non_meetings() -> None:
    parsed = parse_fomc_calendar(FED_HTML)
    assert parsed.decisions == [
        date(2024, 1, 31),
        date(2024, 3, 20),  # a trailing * (meeting has projections) is ignored
        date(2024, 5, 1),  # "Apr/May 30-1": decided on May 1, not April 1
        date(2025, 6, 17),  # a single-day meeting
        date(2026, 1, 1),  # "Dec/Jan 30-1" in the 2025 section ends in the next year
    ]
    assert parsed.skipped == ["2024 August 22 (notation vote)"]


def test_fomc_parser_fails_loudly_when_the_page_changes() -> None:
    with pytest.raises(FomcParseError, match="layout changed"):
        parse_fomc_calendar("<html>nothing here</html>")
    with pytest.raises(FomcParseError, match="no parsable"):
        parse_fomc_calendar(
            '<div class="panel-heading"><h4><a id="1">2024 FOMC Meetings</a></h4></div>'
        )


# --- HTTP and secrets --------------------------------------------------------------------------


def test_api_keys_are_redacted_from_messages() -> None:
    url = "https://api.example.com/x?series_id=SP500&api_key=SECRET123&file_type=json"
    assert "SECRET123" not in redact(url)
    assert "api_key=***" in redact(url)
    assert "SECRET123" not in redact("failed: token=SECRET123 rejected")


# --- prices ------------------------------------------------------------------------------------


def test_fred_parsing_skips_missing_observations() -> None:
    payload = json.dumps(
        {
            "observations": [
                {"date": "2024-01-02", "value": "100.5"},
                {"date": "2024-01-03", "value": "."},
                {"date": "2024-01-04", "value": "101"},
            ]
        }
    )
    assert parse_fred(payload, "X") == {date(2024, 1, 2): 100.5, date(2024, 1, 4): 101.0}
    with pytest.raises(PriceError, match="unexpected response"):
        parse_fred('{"error_message": "bad series"}', "X")
    with pytest.raises(PriceError, match="no observations"):
        parse_fred('{"observations": []}', "X")


def write_csv(path: Path, header: str, rows: list[str]) -> Path:
    path.write_text("\n".join([header, *rows]) + "\n", encoding="utf-8")
    return path


def test_csv_reader_prefers_adjusted_close_and_tolerates_formatting(tmp_path: Path) -> None:
    p = write_csv(
        tmp_path / "a.csv",
        "Date,Open,Close,Adj Close",
        ["2024-01-02,1,100,90", '2024-01-03,1,101,"1,000.5"', "2024-01-04,1,,"],
    )
    assert read_csv_levels(p) == {date(2024, 1, 2): 90.0, date(2024, 1, 3): 1000.5}


@pytest.mark.parametrize(
    ("header", "rows", "needle"),
    [
        ("Day,Close", ["2024-01-02,1"], "Date"),
        ("Date,Volume", ["2024-01-02,1"], "needs one of"),
        ("Date,Close", ["01/02/2024,1"], "line 2"),
        ("Date,Close", ["2024-01-02,abc"], "line 2"),
        ("Date,Close", [], "no price rows"),
    ],
)
def test_csv_reader_rejects_bad_files(
    tmp_path: Path, header: str, rows: list[str], needle: str
) -> None:
    with pytest.raises(PriceError, match=needle):
        read_csv_levels(write_csv(tmp_path / "b.csv", header, rows))


def test_csv_reader_reports_a_missing_file(tmp_path: Path) -> None:
    with pytest.raises(PriceError, match="not found"):
        read_csv_levels(tmp_path / "nope.csv")


def business_days(n: int, start: date = date(2021, 1, 4)) -> list[date]:
    out: list[date] = []
    d = start
    while len(out) < n:
        if d.weekday() < 5:
            out.append(d)
        d += timedelta(days=1)
    return out


def walk(days: list[date], seed: int, vol: float = 0.01) -> dict[date, float]:
    rng = random.Random(seed)
    level, out = 100.0, {}
    for d in days:
        level *= 1 + rng.gauss(0.0003, vol)
        out[d] = level
    return out


# --- alignment ---------------------------------------------------------------------------------


def test_alignment_uses_common_days_and_computes_simple_returns() -> None:
    days = business_days(300)
    a, b = walk(days, 1), walk(days, 2)
    del b[days[100]]  # one series is missing a day (e.g. a different holiday calendar)
    out_days, returns, dropped = aligned_returns({"A": a, "B": b}, date(2021, 1, 1), 0.5)
    assert days[100] not in out_days
    assert dropped == {"A": 1, "B": 0}
    assert len(out_days) == 298 == len(returns["A"]) == len(returns["B"])
    common = [d for d in days if d != days[100]]
    assert returns["A"][0] == pytest.approx(a[common[1]] / a[common[0]] - 1)
    # The day after the gap spans two calendar steps, for *every* series alike.
    i = common.index(days[101])
    assert returns["B"][i - 1] == pytest.approx(b[days[101]] / b[days[99]] - 1)


def test_alignment_refuses_implausible_or_thin_data() -> None:
    days = business_days(300)
    ok = walk(days, 1)
    split = dict(ok)
    for d in days[150:]:
        split[d] = ok[d] / 4  # a 4-for-1 split that was not adjusted for
    with pytest.raises(PriceError, match="unadjusted split"):
        aligned_returns({"A": split}, date(2021, 1, 1), 0.5)

    bad = dict(ok)
    bad[days[10]] = 0.0
    with pytest.raises(PriceError, match="non-positive"):
        aligned_returns({"A": bad}, date(2021, 1, 1), 0.5)

    with pytest.raises(IngestError, match="need at least"):
        aligned_returns({"A": walk(business_days(50), 3)}, date(2021, 1, 1), 0.5)


def test_start_date_trims_history() -> None:
    days = business_days(400)
    out_days, _, _ = aligned_returns({"A": walk(days, 1)}, days[100], 0.5)
    assert out_days[0] > days[100]


# --- events CSV --------------------------------------------------------------------------------


def test_events_csv_requires_a_source_and_a_valid_type(tmp_path: Path) -> None:
    good = write_csv(
        tmp_path / "e.csv",
        "event_id,event_type,entity,date,scheduled,source",
        ["e1,MY_EVENT,ABC,2024-03-01,false,https://example.com/a"],
    )
    ev = read_events_csv(good)
    assert ev.row(0, named=True)["event_type"] == "MY_EVENT"
    assert ev.row(0, named=True)["scheduled"] is False

    no_source = write_csv(
        tmp_path / "f.csv",
        "event_id,event_type,entity,date,source",
        ["e1,MY_EVENT,ABC,2024-03-01,"],
    )
    with pytest.raises(IngestError, match="no event without a source"):
        read_events_csv(no_source)
    bad_type = write_csv(
        tmp_path / "g.csv",
        "event_id,event_type,entity,date,source",
        ["e1,my event,ABC,2024-03-01,x"],
    )
    with pytest.raises(IngestError, match="UPPER_SNAKE_CASE"):
        read_events_csv(bad_type)
    no_col = write_csv(tmp_path / "h.csv", "event_id,event_type", ["e1,X"])
    with pytest.raises(IngestError, match="missing column"):
        read_events_csv(no_col)


# --- config ------------------------------------------------------------------------------------


def test_the_example_config_is_valid() -> None:
    cfg = load_config(ROOT / "data" / "sources.example.toml")
    assert {s.symbol for s in cfg.series} == {"SPX", "MKT", "NASDAQ"}
    assert [e.type for e in cfg.events] == ["fomc", "store", "placebo"]


@pytest.mark.parametrize(
    ("body", "needle"),
    [
        ('[[series]]\nsymbol="A"\nprovider="fred"\n', "needs 'id'"),
        ('[[series]]\nsymbol="A"\nprovider="csv"\n', "needs 'path'"),
        (
            '[[series]]\nsymbol="R"\nprovider="fred"\nid="X"\n'
            '[[series]]\nsymbol="A"\nprovider="alias"\nof="B"\n',
            "not a real series",
        ),
        (
            '[[series]]\nsymbol="A"\nprovider="alias"\nof="B"\n',
            "at least one series must be a real",
        ),
        (
            '[[series]]\nsymbol="A"\nprovider="fred"\nid="X"\n[[series]]\nsymbol="A"\nprovider="fred"\nid="Y"\n',
            "unique",
        ),
        ('[[series]]\nsymbol="A"\nprovider="fred"\nid="X"\nsurprise=1\n', "surprise"),
        (
            '[[series]]\nsymbol="A"\nprovider="fred"\nid="X"\n[[events]]\ntype="csv"\n',
            "need 'path'",
        ),
        ("not = valid = toml", "not valid TOML"),
    ],
)
def test_config_errors_are_specific(tmp_path: Path, body: str, needle: str) -> None:
    p = tmp_path / "s.toml"
    p.write_text(body)
    with pytest.raises(ConfigError, match=needle):
        load_config(p)


def test_a_missing_config_says_how_to_create_it(tmp_path: Path) -> None:
    with pytest.raises(ConfigError, match="sources.example.toml"):
        load_config(tmp_path / "nope.toml")


# --- end to end --------------------------------------------------------------------------------


def fake_world(tmp_path: Path) -> tuple[Path, Fetcher]:
    """A config that uses every provider, and a fetcher that serves canned responses."""
    days = business_days(1000)
    fred = walk(days, 11)
    write_csv(
        tmp_path / "XLK.csv", "Date,Adj Close", [f"{d},{v:.4f}" for d, v in walk(days, 12).items()]
    )
    payload = json.dumps(
        {"observations": [{"date": d.isoformat(), "value": f"{v:.4f}"} for d, v in fred.items()]}
    )
    # Real FOMC rows for the data window, plus a future meeting that must not count as history.
    dates = [
        ("March", "15-16", 2022),
        ("June", "14-15", 2022),
        ("September", "20-21", 2022),
        ("December", "13-14", 2022),
        ("March", "14-15", 2023),
        ("January", "27-28", 2040),
    ]
    html = "".join(
        f'<div class="panel-heading"><h4><a>{y} FOMC Meetings</a></h4></div>'
        f'<div class="fomc-meeting__month"><strong>{m}</strong></div><div class="fomc-meeting__date">{d}</div>'
        for m, d, y in dates
    )
    calls: list[str] = []

    def fetch(url: str) -> str:
        calls.append(url)
        if url.startswith("https://api.stlouisfed.org/"):
            return payload
        if url == FOMC_URL:
            return html
        raise AssertionError(f"unexpected request {redact(url)}")

    cfg = tmp_path / "sources.toml"
    cfg.write_text(
        f'[data]\nout = "{tmp_path / "cache"}"\nstart = "2021-01-01"\n'
        '[[series]]\nsymbol = "SPX"\nprovider = "fred"\nid = "SP500"\n'
        f'[[series]]\nsymbol = "XLK"\nprovider = "csv"\npath = "{tmp_path / "XLK.csv"}"\n'
        '[[series]]\nsymbol = "MKT"\nprovider = "alias"\nof = "SPX"\n'
        '[[events]]\ntype = "fomc"\n'
    )
    return cfg, fetch


def test_ingest_builds_a_cache_the_engine_can_use(tmp_path: Path) -> None:
    cfg_path, fetch = fake_world(tmp_path)
    summary = build_cache(
        load_config(cfg_path), fetch, {FRED_KEY_ENV: "SECRET123"}, date(2026, 1, 1)
    )
    assert summary.symbols == ["MKT", "SPX", "XLK"] and summary.n_events == 6

    data = load_market_data(summary.out)  # the exact loader every command uses
    assert data.synthetic is False
    assert set(data.returns) == {"MKT", "SPX", "XLK"}
    assert list(data.returns["MKT"]) == list(data.returns["SPX"]), (
        "alias copies the target's returns"
    )

    manifest = json.loads((summary.out / "MANIFEST.json").read_text())
    assert manifest["synthetic"] is False and "SECRET123" not in json.dumps(manifest)
    cols = [c for c in __import__("polars").read_parquet(summary.out / "prices.parquet").columns]
    assert cols == ["date", "symbol", "ret"], "only derived returns are stored, never price levels"

    # A real backtest runs on it, and the 2040 meeting is upcoming, not history.
    claim = load_claim(CLAIMS / "clm_fomc_abs_move_spx_v1.yaml")
    report = run_backtest(claim, data, n_boot=200)
    assert report.data_synthetic is False
    assert report.n_matched == 5, "the upcoming 2040 meeting is excluded from the backtest"

    # The website export works on a real cache too, and stops claiming the data is synthetic.
    from spillover.site_export import build_site_data

    site = build_site_data([(claim, "id: x\n")], data, tmp_path / "p", tmp_path / "o", n_boot=100)
    assert site.meta.data_synthetic is False
    assert site.claims[0].backtest is not None and site.claims[0].backtest.data_synthetic is False


def test_a_missing_fred_key_is_a_clear_error_and_nothing_is_written(tmp_path: Path) -> None:
    cfg_path, fetch = fake_world(tmp_path)
    with pytest.raises(IngestError, match=FRED_KEY_ENV):
        build_cache(load_config(cfg_path), fetch, {}, date(2026, 1, 1))
    assert not (tmp_path / "cache").exists()


def test_a_failed_download_never_leaks_the_key(tmp_path: Path) -> None:
    cfg_path, _ = fake_world(tmp_path)

    def failing(url: str) -> str:
        raise FetchError(redact(f"GET {url} failed: HTTP 500"))

    with pytest.raises(FetchError) as err:
        build_cache(load_config(cfg_path), failing, {FRED_KEY_ENV: "SECRET123"}, date(2026, 1, 1))
    assert "SECRET123" not in str(err.value)


def test_cli_ingest_end_to_end(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    cfg_path, fetch = fake_world(tmp_path)
    monkeypatch.setattr(cli_module, "http_get", fetch)
    monkeypatch.setenv(FRED_KEY_ENV, "SECRET123")
    result = runner.invoke(app, ["ingest", "--config", str(cfg_path)])
    assert result.exit_code == 0, result.output
    assert "SECRET123" not in result.output
    assert "--data" in result.output

    # And the cache is usable straight from the command line, via the environment variable.
    out = runner.invoke(
        app,
        ["test-claim", str(CLAIMS / "clm_fomc_abs_move_spx_v1.yaml"), "--boot", "200"],
        env={"SPILLOVER_DATA": str(tmp_path / "cache")},
    )
    assert out.exit_code == 0, out.output
    assert "SYNTHETIC" not in out.output


def test_cli_ingest_without_a_config_explains_what_to_do(tmp_path: Path) -> None:
    result = runner.invoke(app, ["ingest", "--config", str(tmp_path / "missing.toml")])
    assert result.exit_code == 1 and "sources.example.toml" in result.output
