import json
import shutil
import subprocess
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

import polars as pl
import pytest
import yaml
from typer.testing import CliRunner

from spillover.cli import app
from spillover.data import MarketData, load_market_data
from spillover.frozen import check_frozen
from spillover.ledger import (
    LedgerError,
    build_prediction,
    compute_hash,
    predict,
    verify_ledger,
    window_is_open,
    write_prediction,
)
from spillover.models import Claim, load_claim
from spillover.register import register_claims
from spillover.stamp import proof_path, stamp_new, upgrade_pending

from .conftest import FIXTURES
from .test_models import write

runner = CliRunner()
NOW = datetime(2026, 1, 5, 12, 0, tzinfo=UTC)


def shock_claim(tmp_path: Path, registered_at: Any = "2025-06-01T00:00:00Z") -> Claim:
    path = write(
        tmp_path,
        id="clm_syn_shock_v1",
        event_type="SYN_SHOCK",
        trigger_entities=["SYNCO"],
        instrument={"venue": "us_equity", "symbol": "SYN2"},
        registered_at=registered_at,
    )
    return load_claim(path)


@pytest.fixture
def data_with_future_events(tmp_path: Path) -> MarketData:
    """Fixture data plus three SYN_SHOCK events: one before registration is not needed (the
    fixtures already have those), one after the data ends, one on the last data day."""
    root = tmp_path / "data"
    shutil.copytree(FIXTURES, root)
    events = pl.read_parquet(root / "events.parquet")
    last = load_market_data(root).as_of
    extra = pl.DataFrame(
        {
            "event_id": ["shock_future", "shock_last_day"],
            "event_type": ["SYN_SHOCK", "SYN_SHOCK"],
            "entity": ["SYNCO", "SYNCO"],
            "date": [date(2026, 1, 8), last],
            "scheduled": [False, False],
            "source": ["test", "test"],
        },
        schema=events.schema,
    )
    pl.concat([events, extra]).write_parquet(root / "events.parquet")
    return load_market_data(root)


# --- hashing and the file format ---------------------------------------------------------------


def test_hash_is_deterministic_and_covers_every_field(tmp_path: Path) -> None:
    claim = shock_claim(tmp_path)
    a = build_prediction(claim, "ev1", date(2026, 1, 8), NOW)
    b = build_prediction(claim, "ev1", date(2026, 1, 8), NOW)
    assert a == b and len(a.sha256) == 64
    assert compute_hash(a) == a.sha256
    changed = build_prediction(claim, "ev1", date(2026, 1, 9), NOW)
    assert changed.sha256 != a.sha256


def test_write_is_append_only(tmp_path: Path) -> None:
    pred = build_prediction(shock_claim(tmp_path), "ev1", date(2026, 1, 8), NOW)
    root = tmp_path / "predictions"
    path = write_prediction(root, pred)
    assert path == root / "clm_syn_shock_v1" / "ev1.json"
    with pytest.raises(LedgerError, match="append-only"):
        write_prediction(root, pred)


def test_unsafe_event_ids_are_rejected(tmp_path: Path) -> None:
    claim = shock_claim(tmp_path)
    with pytest.raises(ValueError):
        build_prediction(claim, "../escape", date(2026, 1, 8), NOW)


def test_naive_timestamps_are_rejected(tmp_path: Path) -> None:
    with pytest.raises(LedgerError):
        build_prediction(shock_claim(tmp_path), "ev1", date(2026, 1, 8), datetime(2026, 1, 5))


def test_verify_detects_tampering_and_misplacement(tmp_path: Path) -> None:
    root = tmp_path / "predictions"
    pred = build_prediction(shock_claim(tmp_path), "ev1", date(2026, 1, 8), NOW)
    path = write_prediction(root, pred)
    assert [c.problems for c in verify_ledger(root)] == [[]]

    record = json.loads(path.read_text())
    record["predicted_sign"] = "positive"  # quietly flip the call after the fact
    path.write_text(json.dumps(record))
    problems = verify_ledger(root)[0].problems
    assert any("hash mismatch" in p for p in problems)

    moved = root / "clm_syn_shock_v1" / "other.json"
    path.rename(moved)
    assert any("location" in p for p in verify_ledger(root)[0].problems)


def test_verify_reports_garbage_files(tmp_path: Path) -> None:
    root = tmp_path / "predictions" / "clm_x_v1"
    root.mkdir(parents=True)
    (root / "bad.json").write_text("{not json")
    assert verify_ledger(tmp_path / "predictions")[0].problems


# --- predict: forward only, never hindsight ----------------------------------------------------


def test_window_is_open_logic(data_with_future_events: MarketData) -> None:
    data = data_with_future_events
    assert window_is_open(data, date(2026, 1, 8), 1)  # after the data ends
    assert window_is_open(data, data.as_of, 1)  # day 0 observed, day +1 not yet
    assert not window_is_open(data, data.dates[-3], 1)  # fully observed: hindsight


def test_predict_freezes_only_open_forward_events(
    tmp_path: Path, data_with_future_events: MarketData
) -> None:
    claim = shock_claim(tmp_path)
    root = tmp_path / "predictions"
    summary = predict([claim], data_with_future_events, root, NOW)

    assert sorted(p.stem for p in summary.written) == ["shock_future", "shock_last_day"]
    assert summary.skipped_window_closed > 0, "old events with observed windows are hindsight"
    # Registered 2025-06-01: older fixture events are not forward evidence, and fixture events
    # after that date already have their window observed, so predicting them would be hindsight.
    assert summary.skipped_before_registration > 0
    assert all(c.problems == [] for c in verify_ledger(root))

    again = predict([claim], data_with_future_events, root, NOW)  # idempotent
    assert again.written == [] and again.skipped_existing == 2


def test_predict_skips_events_before_registration(
    tmp_path: Path, data_with_future_events: MarketData
) -> None:
    claim = shock_claim(tmp_path, registered_at="2026-01-09T00:00:00Z")
    summary = predict([claim], data_with_future_events, tmp_path / "predictions", NOW)
    assert summary.written == []
    assert summary.skipped_before_registration >= 2


def test_predict_skips_draft_claims(tmp_path: Path, data_with_future_events: MarketData) -> None:
    claim = shock_claim(tmp_path, registered_at="set_by_ci_on_merge")
    summary = predict([claim], data_with_future_events, tmp_path / "predictions", NOW)
    assert summary.written == []
    assert summary.skipped_draft_claims == ["clm_syn_shock_v1"]


# --- register ----------------------------------------------------------------------------------


def test_register_stamps_only_the_placeholder_and_keeps_comments(tmp_path: Path) -> None:
    claims = tmp_path / "claims"
    claims.mkdir()
    path = write(claims, registered_at="set_by_ci_on_merge")
    text = path.read_text().replace(
        "registered_by: someone", "# author note\nregistered_by: someone"
    )
    path.write_text(text)

    changed = register_claims(claims, NOW)
    assert changed == [path]
    new_text = path.read_text()
    assert "# author note" in new_text
    assert "registered_at: 2026-01-05T12:00:00Z" in new_text
    registered = load_claim(path).registered_at_utc
    assert registered == NOW

    assert register_claims(claims, datetime(2030, 1, 1, tzinfo=UTC)) == []  # never re-stamped
    assert "2026-01-05" in path.read_text()


def test_register_refuses_invalid_claims(tmp_path: Path) -> None:
    claims = tmp_path / "claims"
    claims.mkdir()
    write(claims, registered_at="set_by_ci_on_merge", falsifier="REPLACE_ME")
    with pytest.raises(Exception, match="falsifier"):
        register_claims(claims, NOW)


# --- frozen guard, against real temporary git repos ---------------------------------------------


def git(repo: Path, *args: str) -> None:
    subprocess.run(
        ["git", "-c", "user.name=t", "-c", "user.email=t@example.com", *args],
        cwd=repo,
        check=True,
        capture_output=True,
    )


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    r = tmp_path / "repo"
    (r / "claims").mkdir(parents=True)
    (r / "predictions").mkdir()
    (r / "predictions" / ".gitkeep").write_text("")
    write(r / "claims", id="clm_old_v1", registered_at="2025-01-01T00:00:00Z")
    write(r / "claims", id="clm_draft_v1", registered_at="set_by_ci_on_merge")
    git(r, "init", "-q", "-b", "main")
    git(r, "add", "-A")
    git(r, "commit", "-q", "-m", "base")
    git(r, "checkout", "-q", "-b", "pr")
    return r


def commit(repo: Path) -> None:
    git(repo, "add", "-A")
    git(repo, "commit", "-q", "-m", "change")


def test_frozen_allows_new_draft_claims_and_editing_drafts(repo: Path) -> None:
    write(repo / "claims", id="clm_new_v1", registered_at="set_by_ci_on_merge")
    draft = repo / "claims" / "clm_draft_v1.yaml"
    draft.write_text(draft.read_text().replace("negative", "positive"))
    commit(repo)
    assert check_frozen("main", repo) == []


def test_frozen_blocks_editing_or_deleting_a_registered_claim(repo: Path) -> None:
    old = repo / "claims" / "clm_old_v1.yaml"
    old.write_text(old.read_text().replace("negative", "positive"))
    commit(repo)
    assert any("frozen" in p for p in check_frozen("main", repo))

    git(repo, "reset", "-q", "--hard", "main")
    old.unlink()
    commit(repo)
    assert any("frozen" in p for p in check_frozen("main", repo))


def test_frozen_blocks_self_registration(repo: Path) -> None:
    write(repo / "claims", id="clm_sneaky_v1", registered_at="2020-01-01T00:00:00Z")
    commit(repo)
    assert any("registered_at" in p for p in check_frozen("main", repo))

    git(repo, "reset", "-q", "--hard", "main")
    draft = repo / "claims" / "clm_draft_v1.yaml"
    draft.write_text(draft.read_text().replace("set_by_ci_on_merge", "2020-01-01T00:00:00Z"))
    commit(repo)
    assert any("do not set registered_at" in p for p in check_frozen("main", repo))


def test_frozen_blocks_hand_edited_generated_output(repo: Path) -> None:
    (repo / "predictions" / "clm_old_v1").mkdir()
    (repo / "predictions" / "clm_old_v1" / "fake.json").write_text("{}")
    commit(repo)
    assert any("generated output" in p for p in check_frozen("main", repo))


def test_frozen_reports_a_bad_ref(repo: Path) -> None:
    from spillover.frozen import FrozenError

    with pytest.raises(FrozenError):
        check_frozen("no-such-branch", repo)


# --- stamping, with a fake ots client ----------------------------------------------------------


class FakeOts:
    """Stands in for the `ots` command so tests never touch the network."""

    def __init__(self, confirm_on_upgrade: bool) -> None:
        self.confirm_on_upgrade = confirm_on_upgrade
        self.calls: list[list[str]] = []
        self.confirmed: set[str] = set()

    def __call__(self, args: list[str]) -> subprocess.CompletedProcess[str]:
        self.calls.append(args)
        _, verb, target = args
        if verb == "stamp":
            Path(target + ".ots").write_text("pending")
            return subprocess.CompletedProcess(args, 0, "", "")
        if verb == "info":
            marker = "BitcoinBlockHeaderAttestation" if target in self.confirmed else "Pending"
            return subprocess.CompletedProcess(args, 0, marker, "")
        if verb == "upgrade":
            Path(target + ".bak").write_text("old")
            if self.confirm_on_upgrade:
                self.confirmed.add(target)
            return subprocess.CompletedProcess(args, 0, "", "")
        raise AssertionError(verb)


def test_stamp_creates_proofs_once_and_upgrade_completes_them(tmp_path: Path) -> None:
    root = tmp_path / "predictions"
    claim = shock_claim(tmp_path)
    p1 = write_prediction(root, build_prediction(claim, "ev1", date(2026, 1, 8), NOW))
    write_prediction(root, build_prediction(claim, "ev2", date(2026, 1, 9), NOW))

    fake = FakeOts(confirm_on_upgrade=True)
    created = stamp_new(root, fake, "ots")
    assert len(created) == 2 and proof_path(p1).exists()
    assert stamp_new(root, fake, "ots") == []  # already stamped, never re-stamped

    summary = upgrade_pending(root, fake, "ots")
    assert len(summary.confirmed) == 2 and summary.pending == []
    assert not list(root.rglob("*.bak")), "ots backup files must not be left behind"
    assert all(c.proof == "present" for c in verify_ledger(root))


def test_upgrade_leaves_unready_proofs_pending(tmp_path: Path) -> None:
    root = tmp_path / "predictions"
    write_prediction(root, build_prediction(shock_claim(tmp_path), "ev1", date(2026, 1, 8), NOW))
    fake = FakeOts(confirm_on_upgrade=False)
    stamp_new(root, fake, "ots")
    summary = upgrade_pending(root, fake, "ots")
    assert summary.confirmed == [] and len(summary.pending) == 1


def test_stamp_fails_loudly_when_ots_fails(tmp_path: Path) -> None:
    from spillover.stamp import StampError

    root = tmp_path / "predictions"
    write_prediction(root, build_prediction(shock_claim(tmp_path), "ev1", date(2026, 1, 8), NOW))

    def broken(args: list[str]) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(args, 1, "", "calendar unreachable")

    with pytest.raises(StampError, match="calendar unreachable"):
        stamp_new(root, broken, "ots")


# --- CLI ---------------------------------------------------------------------------------------


def test_cli_verify_ledger_passes_empty_and_fails_on_tamper(tmp_path: Path) -> None:
    root = tmp_path / "predictions"
    result = runner.invoke(app, ["verify-ledger", "--predictions", str(root)])
    assert result.exit_code == 0 and "0 prediction(s) checked" in result.output

    path = write_prediction(
        root, build_prediction(shock_claim(tmp_path), "ev1", date(2026, 1, 8), NOW)
    )
    assert runner.invoke(app, ["verify-ledger", "--predictions", str(root)]).exit_code == 0
    record = json.loads(path.read_text())
    record["event_date"] = "2020-01-01"
    path.write_text(json.dumps(record))
    bad = runner.invoke(app, ["verify-ledger", "--predictions", str(root)])
    assert bad.exit_code == 1 and "hash mismatch" in bad.output


def test_cli_register_and_predict_round_trip(
    tmp_path: Path, data_with_future_events: MarketData
) -> None:
    claims = tmp_path / "claims"
    claims.mkdir()
    write(
        claims,
        id="clm_syn_shock_v1",
        event_type="SYN_SHOCK",
        trigger_entities=["SYNCO"],
        instrument={"venue": "us_equity", "symbol": "SYN2"},
        registered_at="set_by_ci_on_merge",
    )
    preds = tmp_path / "predictions"
    base = ["--predictions", str(preds)]
    data_args = ["--data", str(data_with_future_events.root), "--claims-dir", str(claims)]

    # Draft claim: nothing is predicted.
    r = runner.invoke(app, ["predict", *data_args, *base, "--now", "2026-01-05T12:00:00Z"])
    assert r.exit_code == 0 and "0 prediction(s) written" in r.output

    # Register well before the future events, then predict.
    r = runner.invoke(
        app, ["register", "--claims-dir", str(claims), "--now", "2025-06-01T00:00:00Z"]
    )
    assert r.exit_code == 0 and "1 claim(s) registered" in r.output
    assert yaml.safe_load((claims / "clm_syn_shock_v1.yaml").read_text())["registered_at"]

    r = runner.invoke(app, ["predict", *data_args, *base, "--now", "2026-01-05T12:00:00Z"])
    assert r.exit_code == 0 and "2 prediction(s) written" in r.output
    assert runner.invoke(app, ["verify-ledger", *base]).exit_code == 0


def test_cli_now_requires_a_timezone() -> None:
    result = runner.invoke(app, ["register", "--now", "2026-01-05T12:00:00"])
    assert result.exit_code != 0
