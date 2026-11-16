import json
from collections import Counter
from datetime import UTC, date, datetime
from pathlib import Path

from typer.testing import CliRunner

from spillover.cli import app
from spillover.data import load_market_data
from spillover.ingest.config import load_config
from spillover.ingest.store import build_cache, read_events_csv
from spillover.ledger import predict
from spillover.models import load_claim
from spillover.placebo_events import (
    PLACEBO_SEED,
    ensure_future_draws,
    month_draw,
    month_file,
    placebo_files,
    weekdays_of,
)

from .test_ingest import business_days, walk
from .test_models import write

runner = CliRunner()


def test_a_months_draw_is_deterministic_sorted_and_all_weekdays() -> None:
    a = month_draw(2027, 3, 4)
    assert a == month_draw(2027, 3, 4), "the same month always gives the same dates"
    assert a == sorted(a) and len(a) == len(set(a)) == 4
    assert all(d.weekday() < 5 and (d.year, d.month) == (2027, 3) for d in a)
    assert month_draw(2027, 3, 4) != month_draw(2027, 4, 4), "months are drawn independently"
    assert month_draw(2027, 3, 4, seed="another") != a


def test_asking_for_more_dates_than_a_month_has_returns_every_weekday() -> None:
    assert month_draw(2027, 2, 99) == weekdays_of(2027, 2)


def test_draws_are_spread_across_weekdays_not_clumped() -> None:
    counts = Counter(
        d.weekday() for m in range(1, 13) for y in range(2028, 2040) for d in month_draw(y, m, 4)
    )
    assert set(counts) == {0, 1, 2, 3, 4}
    assert max(counts.values()) / min(counts.values()) < 1.35


def test_only_whole_future_months_are_drawn(tmp_path: Path) -> None:
    created = ensure_future_draws(tmp_path, date(2026, 11, 15), months_ahead=3, per_month=4)
    assert [p.name for p in created] == ["2026-12.csv", "2027-01.csv", "2027-02.csv"], (
        "year rollover, current month skipped"
    )
    for p in created:
        for ev in read_events_csv(p).iter_rows(named=True):
            assert ev["date"] > date(2026, 11, 15), "every draw lies in the future"
            assert (
                ev["event_type"] == "RANDOM_DATE"
                and ev["entity"] == "NONE"
                and ev["scheduled"] is False
            )


def test_existing_months_are_never_rewritten(tmp_path: Path) -> None:
    first = ensure_future_draws(tmp_path, date(2026, 11, 15))
    assert len(first) == 3
    f = month_file(tmp_path, 2026, 12)
    f.write_text("edited by someone\n")
    assert ensure_future_draws(tmp_path, date(2026, 11, 15)) == []
    assert f.read_text() == "edited by someone\n", "append-only: a month is drawn once"
    later = ensure_future_draws(tmp_path, date(2026, 12, 3))
    assert [p.name for p in later] == ["2027-03.csv"], "only the newly reachable month is added"


def test_the_files_are_valid_event_csvs_with_a_source(tmp_path: Path) -> None:
    ensure_future_draws(tmp_path, date(2026, 11, 15))
    assert len(placebo_files(tmp_path)) == 3
    row = read_events_csv(placebo_files(tmp_path)[0]).row(0, named=True)
    assert row["source"].startswith("https://") and row["event_id"].startswith("rnd_")
    assert PLACEBO_SEED  # public on purpose: the guarantee is the commit time, not secrecy


def test_cli_draws_once_and_reports_nothing_new_on_a_rerun(tmp_path: Path) -> None:
    args = ["placebo-events", "--root", str(tmp_path / "p"), "--today", "2026-11-15"]
    first = runner.invoke(app, args)
    assert first.exit_code == 0 and "3 new month(s) drawn" in first.output
    again = runner.invoke(app, args)
    assert again.exit_code == 0 and "0 new month(s) drawn" in again.output


def test_a_pre_registered_draw_becomes_a_frozen_forward_prediction(tmp_path: Path) -> None:
    """Draw dates ahead, build the cache, and the placebo claim freezes a prediction per date."""
    days = business_days(1000)  # prices end around late 2024
    (tmp_path / "px.csv").write_text(
        "Date,Close\n" + "".join(f"{d},{v:.4f}\n" for d, v in walk(days, 5).items())
    )
    (tmp_path / "xlk.csv").write_text(
        "Date,Close\n" + "".join(f"{d},{v:.4f}\n" for d, v in walk(days, 6).items())
    )
    root = tmp_path / "placebo"
    ensure_future_draws(root, days[-1], months_ahead=2, per_month=3)  # months after the data ends

    sources = tmp_path / "s.toml"
    sources.write_text(
        f'[data]\nout = "{tmp_path / "cache"}"\nstart = "2021-01-01"\n'
        f'[[series]]\nsymbol = "SPX"\nprovider = "csv"\npath = "{tmp_path / "px.csv"}"\n'
        f'[[series]]\nsymbol = "XLK"\nprovider = "csv"\npath = "{tmp_path / "xlk.csv"}"\n'
        '[[series]]\nsymbol = "MKT"\nprovider = "alias"\nof = "SPX"\n'
        f'[[events]]\ntype = "placebo"\npath = "{root}"\n'
    )
    summary = build_cache(load_config(sources), lambda url: "", {}, date(2024, 12, 1))
    data = load_market_data(summary.out)
    ev = data.events
    committed = ev.filter(~ev["event_id"].str.starts_with("rnd_bt_"))
    assert committed.height == 6
    # Past months are drawn too (for backtests), including one whose dates are past the price data.
    assert ev.height > 6

    claim = load_claim(
        write(
            tmp_path,
            id="clm_placebo_v1",
            event_type="RANDOM_DATE",
            trigger_entities=["NONE"],
            instrument={"venue": "us_equity", "symbol": "XLK"},
            registered_at="2020-01-01T00:00:00Z",
        )
    )
    result = predict([claim], data, tmp_path / "predictions", datetime(2024, 12, 1, 12, tzinfo=UTC))
    assert len(result.written) == 6, (
        "every pre-registered date freezes a prediction before it happens, "
        "and no after-the-fact backtest draw ever does"
    )
    ids = {json.loads(p.read_text())["event_id"] for p in result.written}
    assert all(i.startswith("rnd_") for i in ids)


def test_past_month_draws_are_blind_complete_and_skip_committed_months() -> None:
    from spillover.placebo_events import historical_draws, month_draw

    got = historical_draws(date(2024, 1, 10), date(2024, 4, 2), have={(2024, 2)})
    months = {(d.year, d.month) for d in got}
    assert months == {(2024, 1), (2024, 3)}, "committed Feb is skipped; April has not ended"
    assert all(d >= date(2024, 1, 10) for d in got)
    # The same month always gives the same dates: nothing depends on prices or on today.
    assert [d for d in got if d.month == 3] == month_draw(2024, 3, 4)
