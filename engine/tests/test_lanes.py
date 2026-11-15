import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest
import yaml
from typer.testing import CliRunner

from spillover.cli import app
from spillover.data import MarketData
from spillover.frozen import frozen_violations
from spillover.lanes import (
    LaneError,
    apply_changes,
    check_target,
    parse_challenge,
    parse_replication,
)
from spillover.models import Claim, load_claim
from spillover.register import stamp_challenges, stamp_replications
from spillover.replicate import load_result, run_pending, run_replication

from .conftest import FIXTURES
from .test_models import write

runner = CliRunner()
NOW = datetime(2026, 1, 5, 12, 0, tzinfo=UTC)
ARGUMENT = "The baseline ignores that the sector had a scheduled event on three of these dates."


def challenge_data(**over: Any) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": "chl_syn_baseline_v1",
        "claim": "clm_syn_shock_v1",
        "aspect": "baseline",
        "argument": ARGUMENT,
        "evidence": [{"kind": "link", "ref": "https://example.org/data", "note": "the dates"}],
        "submitted_by": "someone",
        "submitted_at": "set_by_ci_on_merge",
    }
    data.update(over)
    return data


def replication_data(**over: Any) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": "rep_syn_other_window_v1",
        "claim": "clm_syn_shock_v1",
        "changes": {"window_end": "+3_trading_days"},
        "rationale": "A longer window tests whether the effect fades or persists after day one.",
        "submitted_by": "someone",
        "submitted_at": "set_by_ci_on_merge",
    }
    data.update(over)
    return data


def dump(data: dict[str, Any]) -> str:
    return yaml.safe_dump(data, sort_keys=False)


def registered_claim(tmp_path: Path, **over: Any) -> Claim:
    base: dict[str, Any] = {
        "id": "clm_syn_shock_v1",
        "event_type": "SYN_SHOCK",
        "trigger_entities": ["SYNCO"],
        "instrument": {"venue": "us_equity", "symbol": "SYN2"},
        "expected_sign": "negative",
        "registered_at": "2020-01-01T00:00:00Z",
    }
    base.update(over)
    return load_claim(write(tmp_path, **base))


# --- challenges ---------------------------------------------------------------------------------


def test_a_valid_challenge_parses() -> None:
    ch = parse_challenge(dump(challenge_data()), "x")
    assert ch.aspect == "baseline" and ch.evidence[0].kind == "link"


@pytest.mark.parametrize(
    ("over", "needle"),
    [
        ({"id": "Chl_Bad"}, "id"),
        ({"id": "clm_wrong_prefix_v1"}, "id"),
        ({"claim": "not-a-claim"}, "claim"),
        ({"aspect": "vibes"}, "aspect"),
        ({"argument": "too short"}, "argument"),
        ({"argument": "REPLACE_ME " * 10}, "placeholder"),
        ({"submitted_by": "YOUR_GITHUB_HANDLE"}, "placeholder"),
        ({"surprise": 1}, "surprise"),
        ({"evidence": [{"kind": "link", "ref": "http://insecure.example"}]}, "https"),
        ({"evidence": [{"kind": "replication", "ref": "not-an-id"}]}, "replication id"),
        ({"evidence": [{"kind": "link", "ref": "https://e.org"}] * 11}, "evidence"),
    ],
)
def test_invalid_challenges_are_rejected(over: dict[str, Any], needle: str) -> None:
    with pytest.raises(LaneError) as err:
        parse_challenge(dump(challenge_data(**over)), "x")
    assert needle in str(err.value)


def test_a_challenge_can_cite_a_replication() -> None:
    ev = [{"kind": "replication", "ref": "rep_syn_other_window_v1", "note": "fades after day one"}]
    assert (
        parse_challenge(dump(challenge_data(evidence=ev)), "x").evidence[0].ref.startswith("rep_")
    )


# --- replications -------------------------------------------------------------------------------


def test_a_valid_replication_parses_and_must_change_something() -> None:
    assert parse_replication(dump(replication_data()), "x").changes.window_end == "+3_trading_days"
    with pytest.raises(LaneError, match="at least one thing"):
        parse_replication(dump(replication_data(changes={})), "x")


@pytest.mark.parametrize(
    "changes",
    [
        {"event_type": "OTHER"},  # the trigger defines the claim, so it cannot change
        {"window_end": "tomorrow"},
        {"baseline": "magic"},
        {"instrument": {"symbol": "ABC"}},  # a venue is always required
    ],
)
def test_replications_cannot_change_what_defines_the_claim(changes: dict[str, Any]) -> None:
    with pytest.raises(LaneError):
        parse_replication(dump(replication_data(changes=changes)), "x")


def test_changes_are_applied_and_the_changed_claim_is_revalidated(tmp_path: Path) -> None:
    claim = registered_claim(tmp_path)
    rep = parse_replication(
        dump(replication_data(changes={"window_end": "+3_trading_days", "factor": "ALT"})), "x"
    )
    variant = apply_changes(claim, rep.changes)
    assert variant.window.end_offset == 3 and variant.factor == "ALT"
    assert claim.window.end_offset == 1, "the original claim is untouched"
    assert (
        variant.event_type == claim.event_type
        and variant.trigger_entities == claim.trigger_entities
    )


def test_only_registered_claims_can_be_challenged_or_replicated(tmp_path: Path) -> None:
    assert check_target(registered_claim(tmp_path), "clm_syn_shock_v1") is None
    draft = registered_claim(tmp_path, registered_at="set_by_ci_on_merge")
    assert "not registered yet" in (check_target(draft, "clm_syn_shock_v1") or "")
    assert "does not exist" in (check_target(None, "clm_nope_v1") or "")


# --- frozen rules and stamping --------------------------------------------------------------------


def test_submissions_are_append_only_and_cannot_stamp_themselves() -> None:
    placeholder, stamped = (
        dump(replication_data()),
        dump(replication_data(submitted_at="2020-01-01T00:00:00Z")),
    )
    read = lambda _p: placeholder  # noqa: E731
    assert (
        frozen_violations(
            [("A", "replications/rep_a_v1.yaml"), ("A", "challenges/chl_a_v1.yaml")], read, read
        )
        == []
    )
    for status in ("M", "D"):
        out = frozen_violations([(status, "challenges/chl_a_v1.yaml")], read, read)
        assert out and "append-only" in out[0]
    forged = frozen_violations([("A", "replications/rep_a_v1.yaml")], read, lambda _p: stamped)
    assert forged and "submitted_at" in forged[0]
    # The templates (starting with "_") are not submissions.
    assert frozen_violations([("M", "challenges/_template.yaml")], read, read) == []


def test_results_are_generated_and_never_hand_edited() -> None:
    read = lambda _p: ""  # noqa: E731
    out = frozen_violations([("A", "replications/results/rep_a_v1.json")], read, read)
    assert out and "generated" in out[0]


def test_ci_stamps_submissions_once(tmp_path: Path) -> None:
    (tmp_path / "challenges").mkdir()
    (tmp_path / "replications").mkdir()
    (tmp_path / "challenges" / "chl_syn_baseline_v1.yaml").write_text(
        "# note\n" + dump(challenge_data())
    )
    (tmp_path / "replications" / "rep_syn_other_window_v1.yaml").write_text(
        dump(replication_data())
    )
    assert len(stamp_challenges(tmp_path / "challenges", NOW)) == 1
    assert len(stamp_replications(tmp_path / "replications", NOW)) == 1
    text = (tmp_path / "challenges" / "chl_syn_baseline_v1.yaml").read_text()
    assert "# note" in text and "submitted_at: 2026-01-05T12:00:00Z" in text
    assert stamp_challenges(tmp_path / "challenges", datetime(2030, 1, 1, tzinfo=UTC)) == [], (
        "never re-stamped"
    )


# --- running a replication ------------------------------------------------------------------------


def test_a_replication_is_run_by_the_engine_and_recorded_with_a_hash(
    market: MarketData, tmp_path: Path
) -> None:
    claim = registered_claim(tmp_path)
    rep = parse_replication(dump(replication_data()), "x")
    result = run_replication(rep, claim, market, n_boot=300)
    assert result.replication_id == rep.id and result.claim_id == claim.id
    assert result.applied_changes == {"window_end": "+3_trading_days"}
    assert result.data_synthetic is True and result.n_effective > 15
    assert result.mean is not None and result.mean < 0, (
        "the injected shock persists in the longer window"
    )
    assert len(result.sha256) == 64


def test_replicating_a_draft_claim_is_refused(market: MarketData, tmp_path: Path) -> None:
    draft = registered_claim(tmp_path, registered_at="set_by_ci_on_merge")
    with pytest.raises(LaneError, match="not registered"):
        run_replication(parse_replication(dump(replication_data()), "x"), draft, market, n_boot=100)


def test_pending_replications_are_run_once_and_results_are_tamper_evident(
    market: MarketData, tmp_path: Path
) -> None:
    claims, reps, results = tmp_path / "claims", tmp_path / "replications", tmp_path / "results"
    claims.mkdir()
    reps.mkdir()
    registered_claim(claims)
    (reps / "rep_syn_other_window_v1.yaml").write_text(
        dump(replication_data(submitted_at="2026-01-05T12:00:00Z"))
    )
    (reps / "rep_syn_broken_v1.yaml").write_text(
        dump(replication_data(id="rep_syn_broken_v1", claim="clm_nope_v1"))
    )

    written, problems = run_pending(reps, claims, results, market, n_boot=200)
    assert len(written) == 1 and len(problems) == 1 and "does not exist" in problems[0]
    again, _ = run_pending(reps, claims, results, market, n_boot=200)
    assert again == [], "a replication that has a result is not re-run"

    load_result(written[0])  # verifies the hash
    record = json.loads(written[0].read_text())
    record["mean"] = 0.5  # someone improves the result by hand
    written[0].write_text(json.dumps(record))
    with pytest.raises(LaneError, match="hash mismatch"):
        load_result(written[0])


# --- CLI ----------------------------------------------------------------------------------------


def test_validate_checks_challenges_and_replications_against_real_claims(tmp_path: Path) -> None:
    claims = tmp_path / "claims"
    claims.mkdir()
    registered_claim(claims)
    for name, data in (("challenges", challenge_data()), ("replications", replication_data())):
        (tmp_path / name).mkdir()
        (tmp_path / name / f"{data['id']}.yaml").write_text(dump(data))
    files = [
        str(tmp_path / "challenges" / "chl_syn_baseline_v1.yaml"),
        str(tmp_path / "replications" / "rep_syn_other_window_v1.yaml"),
    ]
    ok = runner.invoke(app, ["validate", *files, "--claims-dir", str(claims)])
    assert ok.exit_code == 0 and "2 file(s) valid" in ok.output, ok.output

    # Challenging a claim that is not registered is not allowed.
    draft_dir = tmp_path / "claims2"
    draft_dir.mkdir()
    registered_claim(draft_dir, registered_at="set_by_ci_on_merge")
    bad = runner.invoke(app, ["validate", *files, "--claims-dir", str(draft_dir)])
    assert bad.exit_code == 1 and "not registered yet" in bad.output

    # A file name must match its id.
    renamed = tmp_path / "challenges" / "other_name.yaml"
    renamed.write_text(dump(challenge_data()))
    assert (
        "file name must match"
        in runner.invoke(app, ["validate", str(renamed), "--claims-dir", str(claims)]).output
    )


def test_the_templates_are_rejected_until_edited() -> None:
    root = Path(__file__).resolve().parents[2]
    for template in (
        root / "challenges" / "_template.yaml",
        root / "replications" / "_template.yaml",
    ):
        result = runner.invoke(app, ["validate", str(template)])
        assert result.exit_code == 1, f"{template.name} must not pass unedited"


def test_cli_replicate_refuses_synthetic_data_unless_forced(tmp_path: Path) -> None:
    claims, reps = tmp_path / "claims", tmp_path / "replications"
    claims.mkdir()
    reps.mkdir()
    registered_claim(claims)
    (reps / "rep_syn_other_window_v1.yaml").write_text(
        dump(replication_data(submitted_at="2026-01-05T12:00:00Z"))
    )
    base = [
        "replicate",
        "--replications-dir",
        str(reps),
        "--claims-dir",
        str(claims),
        "--results-dir",
        str(tmp_path / "res"),
        "--data",
        str(FIXTURES),
        "--boot",
        "200",
    ]
    refused = runner.invoke(app, base)
    assert (
        refused.exit_code == 1 and "SYNTHETIC" in refused.output and not (tmp_path / "res").exists()
    )
    forced = runner.invoke(app, [*base, "--allow-synthetic"])
    assert forced.exit_code == 0 and "1 result(s) written" in forced.output, forced.output


def test_the_site_export_includes_challenges_and_verified_replication_results(
    market: MarketData, tmp_path: Path
) -> None:
    from spillover.models import load_claim as _load
    from spillover.site_export import build_site_data

    claims, chl, reps, results = (
        tmp_path / "claims",
        tmp_path / "challenges",
        tmp_path / "replications",
        tmp_path / "results",
    )
    for d in (claims, chl, reps):
        d.mkdir()
    registered_claim(claims)
    (chl / "chl_syn_baseline_v1.yaml").write_text(
        dump(challenge_data(submitted_at="2026-01-05T12:00:00Z"))
    )
    (reps / "rep_syn_other_window_v1.yaml").write_text(
        dump(replication_data(submitted_at="2026-01-05T12:00:00Z"))
    )
    run_pending(reps, claims, results, market, n_boot=200)

    claim = _load(claims / "clm_syn_shock_v1.yaml")
    site = build_site_data(
        [(claim, "id: x\n")],
        market,
        tmp_path / "p",
        tmp_path / "o",
        n_boot=100,
        challenges_dir=chl,
        replications_dir=reps,
        results_dir=results,
    )
    item = site.claims[0]
    assert [c.id for c in item.challenges] == ["chl_syn_baseline_v1"]
    assert item.challenges[0].submitted_at == "2026-01-05T12:00:00+00:00"
    (rep,) = item.replications
    assert rep.changes == {"window_end": "+3_trading_days"}
    assert rep.result is not None and rep.result.data_synthetic is True

    # A hand-edited result must fail the export instead of being published.
    path = next(results.glob("*.json"))
    record = json.loads(path.read_text())
    record["mean"] = 0.9
    path.write_text(json.dumps(record))
    with pytest.raises(LaneError, match="hash mismatch"):
        build_site_data(
            [(claim, "id: x\n")],
            market,
            tmp_path / "p",
            tmp_path / "o",
            n_boot=100,
            challenges_dir=chl,
            replications_dir=reps,
            results_dir=results,
        )
