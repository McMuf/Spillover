import base64
import re
from pathlib import Path
from typing import Any

import pytest
import yaml
from typer.testing import CliRunner

from spillover.cli import app
from spillover.data import MarketData
from spillover.pr_bot import (
    BOT_LOGIN,
    MARKER,
    BotError,
    changes_from_files,
    code,
    render_comment,
    run,
)

from .test_models import VALID, write

runner = CliRunner()
REPO, FORK = "McMuf/Spillover", "stranger/Spillover"
SHA = "a" * 40


def claim_yaml(**over: Any) -> str:
    data: dict[str, Any] = {**VALID, "id": "clm_demo_v1", "registered_at": "set_by_ci_on_merge"}
    data.update(over)
    return yaml.safe_dump(data)


class FakeGitHub:
    """Stands in for api.github.com and records every write."""

    def __init__(
        self,
        files: list[dict[str, Any]],
        contents: dict[str, str] | None = None,
        comments: list[dict[str, Any]] | None = None,
        prs: list[dict[str, Any]] | None = None,
    ) -> None:
        self.files = files
        self.contents = contents or {}
        self.comments = comments or []
        self.prs = (
            prs
            if prs is not None
            else [
                {
                    "number": 7,
                    "state": "open",
                    "base": {"repo": {"full_name": REPO}},
                    "head": {"sha": SHA},
                }
            ]
        )
        self.calls: list[tuple[str, str]] = []
        self.writes: list[tuple[str, str, dict[str, Any]]] = []

    def __call__(self, method: str, path: str, body: dict[str, Any] | None = None) -> Any:
        self.calls.append((method, path))
        if method in ("POST", "PATCH"):
            assert body is not None
            self.writes.append((method, path, body))
            return {}
        if re.fullmatch(rf"/repos/{REPO}/commits/{SHA}/pulls", path):
            return self.prs
        if "/pulls/7/files" in path:
            return self.files if "page=1" in path else []
        if "/issues/7/comments" in path:
            return self.comments if "page=1" in path else []
        m = re.fullmatch(r"/repos/([^/]+/[^/]+)/contents/(.+)\?ref=([0-9a-f]+)", path)
        if m:
            text = self.contents[f"{m.group(1)}:{m.group(2)}"]
            raw = text.encode()
            return {
                "encoding": "base64",
                "size": len(raw),
                "content": base64.b64encode(raw).decode(),
            }
        raise AssertionError(f"unexpected call {method} {path}")


def added(path: str) -> dict[str, Any]:
    return {"status": "added", "filename": path}


def go(
    gh: FakeGitHub, base: Path, data: MarketData | None = None, head_repo: str = FORK
) -> tuple[str, str]:
    return run(gh, REPO, SHA, head_repo, base, data)


@pytest.fixture
def base_claims(tmp_path: Path) -> Path:
    d = tmp_path / "base"
    d.mkdir()
    write(d, id="clm_old_v1", registered_at="2025-01-01T00:00:00Z")
    write(d, id="clm_draft_v1", registered_at="set_by_ci_on_merge")
    return d


# --- happy path and the comment lifecycle -------------------------------------------------------


def test_reviews_a_valid_new_claim_from_a_fork_without_running_anything(
    base_claims: Path, market: MarketData
) -> None:
    gh = FakeGitHub(
        [added("claims/clm_demo_v1.yaml")], {f"{FORK}:claims/clm_demo_v1.yaml": claim_yaml()}
    )
    outcome, body = go(gh, base_claims, market)
    assert outcome == "created comment on #7"
    assert MARKER in body and "✅" in body and "is a valid claim" in body
    assert "No registered claim or generated output is touched" in body
    assert "Feasibility not run" in body, "the fixtures have no ABC data, and the bot says so"
    assert "- [ ] The instrument has a venue" in body and "Research, not investment advice" in body
    # The head file was fetched from the FORK as text; no other write than the one comment.
    assert ("GET", f"/repos/{FORK}/contents/claims/clm_demo_v1.yaml?ref={SHA}") in gh.calls
    assert [w[0] for w in gh.writes] == ["POST"]


def test_updates_its_own_previous_comment_instead_of_stacking_new_ones(base_claims: Path) -> None:
    mine = {"id": 99, "user": {"login": BOT_LOGIN}, "body": f"{MARKER}\nold"}
    gh = FakeGitHub([], comments=[mine])
    outcome, _ = go(gh, base_claims)
    assert outcome == "updated comment on #7"
    assert gh.writes[0][0] == "PATCH" and gh.writes[0][1].endswith("/issues/comments/99")


def test_ignores_a_comment_that_merely_copies_the_marker(base_claims: Path) -> None:
    """Anyone can paste the marker into a comment; the bot must never edit someone else's."""
    forged = {"id": 5, "user": {"login": "mallory"}, "body": f"{MARKER}\nhello"}
    gh = FakeGitHub([], comments=[forged])
    outcome, _ = go(gh, base_claims)
    assert outcome == "created comment on #7"
    assert gh.writes[0][0] == "POST"


def test_does_nothing_when_the_commit_has_no_open_pull_request(base_claims: Path) -> None:
    gh = FakeGitHub([], prs=[])
    outcome, body = go(gh, base_claims)
    assert "no open pull request" in outcome and body == "" and gh.writes == []


def test_ignores_pull_requests_for_other_repositories_or_stale_heads(base_claims: Path) -> None:
    other = [
        {
            "number": 7,
            "state": "open",
            "base": {"repo": {"full_name": "evil/x"}},
            "head": {"sha": SHA},
        }
    ]
    stale = [
        {
            "number": 7,
            "state": "open",
            "base": {"repo": {"full_name": REPO}},
            "head": {"sha": "b" * 40},
        }
    ]
    for prs in (other, stale):
        assert "no open pull request" in go(FakeGitHub([], prs=prs), base_claims)[0]


# --- validation and frozen files ----------------------------------------------------------------


def test_reports_validation_errors_for_a_bad_claim(base_claims: Path) -> None:
    bad = claim_yaml(falsifier="REPLACE_ME", instrument={"symbol": "ABC"})
    gh = FakeGitHub([added("claims/clm_demo_v1.yaml")], {f"{FORK}:claims/clm_demo_v1.yaml": bad})
    _, body = go(gh, base_claims)
    assert "❌" in body and "does not validate" in body
    assert "falsifier" in body and "instrument.venue" in body


def test_flags_edits_to_registered_claims_and_generated_outputs(base_claims: Path) -> None:
    files = [
        {"status": "modified", "filename": "claims/clm_old_v1.yaml"},
        {"status": "removed", "filename": "claims/clm_old_v1.yaml"},
        added("predictions/clm_old_v1/fake.json"),
        added("scoreboard/scoreboard.json"),
    ]
    gh = FakeGitHub(files, {f"{FORK}:claims/clm_old_v1.yaml": claim_yaml(id="clm_old_v1")})
    _, body = go(gh, base_claims)
    assert body.count("registered and frozen") == 2
    assert body.count("generated output") == 2


def test_flags_a_new_claim_that_registers_itself(base_claims: Path) -> None:
    sneaky = claim_yaml(registered_at="2020-01-01T00:00:00Z")
    gh = FakeGitHub([added("claims/clm_demo_v1.yaml")], {f"{FORK}:claims/clm_demo_v1.yaml": sneaky})
    _, body = go(gh, base_claims)
    assert "must leave registered_at" in body


def test_editing_a_draft_claim_is_allowed(base_claims: Path) -> None:
    gh = FakeGitHub(
        [{"status": "modified", "filename": "claims/clm_draft_v1.yaml"}],
        {f"{FORK}:claims/clm_draft_v1.yaml": claim_yaml(id="clm_draft_v1")},
    )
    _, body = go(gh, base_claims)
    assert "No registered claim or generated output is touched" in body


def test_a_rename_counts_as_deleting_the_old_file_and_adding_the_new_one() -> None:
    files = [
        {
            "status": "renamed",
            "filename": "claims/clm_new_v1.yaml",
            "previous_filename": "claims/clm_old_v1.yaml",
        }
    ]
    assert changes_from_files(files) == [
        ("D", "claims/clm_old_v1.yaml"),
        ("A", "claims/clm_new_v1.yaml"),
    ]


# --- feasibility, when the data can answer ------------------------------------------------------


def test_runs_a_synthetic_smoke_backtest_when_ci_has_matching_data(
    base_claims: Path, market: MarketData
) -> None:
    text = claim_yaml(
        id="clm_syn_shock_v1",
        event_type="SYN_SHOCK",
        trigger_entities=["SYNCO"],
        instrument={"venue": "us_equity", "symbol": "SYN2"},
    )
    gh = FakeGitHub(
        [added("claims/clm_syn_shock_v1.yaml")], {f"{FORK}:claims/clm_syn_shock_v1.yaml": text}
    )
    _, body = go(gh, base_claims, market)
    assert "on SYNTHETIC fixture data (a smoke test only)" in body
    assert re.search(r"\d+ matching events, \d+ effective \(claim requires 8\)", body)


# --- hostile input ------------------------------------------------------------------------------


def test_untrusted_text_is_always_inert() -> None:
    nasty = "[click](http://evil) @octocat ![x](http://evil/x.png)\n# Heading `tick`"
    shown = code(nasty)
    assert shown.startswith("`") and shown.endswith("`")
    assert shown.count("`") == 2, "backticks are removed so the span cannot be closed early"
    assert "\n" not in shown
    assert len(code("x" * 5000)) <= 162


def test_a_malicious_yaml_cannot_inject_markup_or_mentions_into_the_comment(
    base_claims: Path,
) -> None:
    evil = "id: [unclosed @octocat ![img](http://evil/p.png) `x` \nstatement: [link](http://evil)\n"
    gh = FakeGitHub([added("claims/clm_demo_v1.yaml")], {f"{FORK}:claims/clm_demo_v1.yaml": evil})
    _, body = go(gh, base_claims)
    for line in body.splitlines():
        if "octocat" in line or "evil" in line:
            # Every PR-derived line keeps that text inside a code span.
            assert re.search(r"`[^`]*(octocat|evil)[^`]*`", line), line
    assert "![" not in re.sub(r"`[^`]*`", "", body)


def test_unexpected_claim_paths_are_never_fetched(base_claims: Path) -> None:
    sneaky = added("claims/../../etc/passwd.yaml")
    gh = FakeGitHub([sneaky, added("claims/bad name.yaml")])
    _, body = go(gh, base_claims)
    assert not any("/contents/" in path for _, path in gh.calls)
    assert "unexpected file name" in body


def test_oversized_files_are_not_reviewed(base_claims: Path) -> None:
    gh = FakeGitHub(
        [added("claims/clm_demo_v1.yaml")], {f"{FORK}:claims/clm_demo_v1.yaml": "x" * 70_000}
    )
    _, body = go(gh, base_claims)
    assert "not reviewed" in body


@pytest.mark.parametrize("repo", ["bad", "a/b/c", "x y/z", "../etc"])
def test_malformed_repository_names_are_rejected(base_claims: Path, repo: str) -> None:
    with pytest.raises(BotError, match="well-formed"):
        run(FakeGitHub([]), REPO, SHA, repo, base_claims, None)
    with pytest.raises(BotError, match="well-formed"):
        run(FakeGitHub([]), repo, SHA, FORK, base_claims, None)


def test_a_malformed_sha_is_rejected(base_claims: Path) -> None:
    with pytest.raises(BotError, match="well-formed"):
        run(FakeGitHub([]), REPO, "not-a-sha", FORK, base_claims, None)


def test_the_comment_has_a_size_cap(base_claims: Path) -> None:
    many = [added(f"claims/clm_n{i}_v1.yaml") for i in range(5)]
    contents = {
        f"{FORK}:claims/clm_n{i}_v1.yaml": claim_yaml(falsifier="REPLACE_ME " * 3000)
        for i in range(5)
    }
    _, body = go(FakeGitHub(many, contents), base_claims)
    assert len(body) <= 20_000


def test_render_is_pure_and_includes_the_checklist() -> None:
    from spillover.pr_bot import PrReview

    body = render_comment(PrReview([], []))
    assert "None changed." in body and body.count("- [ ]") == 8


# --- CLI ----------------------------------------------------------------------------------------


def test_cli_requires_a_token_and_never_prints_it(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("GITHUB_TOKEN", raising=False)
    result = runner.invoke(
        app, ["pr-comment", "--head-sha", SHA, "--head-repo", FORK, "--repo", REPO]
    )
    assert result.exit_code == 1 and "GITHUB_TOKEN" in result.output


# --- challenges and replications ----------------------------------------------------------------


def lane_yaml(kind: str, **over: Any) -> str:
    if kind == "challenge":
        data: dict[str, Any] = {
            "id": "chl_demo_v1",
            "claim": "clm_old_v1",
            "aspect": "sample",
            "argument": "Three of these dates fall inside the same scheduled event window, which inflates n.",
            "submitted_by": "someone",
            "submitted_at": "set_by_ci_on_merge",
        }
    else:
        data = {
            "id": "rep_demo_v1",
            "claim": "clm_old_v1",
            "changes": {"window_end": "+3_trading_days"},
            "rationale": "A longer window tests whether the effect fades after the first day.",
            "submitted_by": "someone",
            "submitted_at": "set_by_ci_on_merge",
        }
    data.update(over)
    return yaml.safe_dump(data)


def test_a_valid_challenge_and_replication_are_reviewed_against_the_registered_claim(
    base_claims: Path,
) -> None:
    gh = FakeGitHub(
        [added("challenges/chl_demo_v1.yaml"), added("replications/rep_demo_v1.yaml")],
        {
            f"{FORK}:challenges/chl_demo_v1.yaml": lane_yaml("challenge"),
            f"{FORK}:replications/rep_demo_v1.yaml": lane_yaml("replication"),
        },
    )
    _, body = go(gh, base_claims)
    assert "is a valid challenge (`chl_demo_v1`)" in body
    assert "is a valid replication (`rep_demo_v1`)" in body
    assert "the engine runs the replication" in body
    assert "No registered claim or generated output is touched" in body


def test_challenging_a_draft_or_missing_claim_is_flagged(base_claims: Path) -> None:
    gh = FakeGitHub(
        [added("challenges/chl_demo_v1.yaml"), added("challenges/chl_gone_v1.yaml")],
        {
            f"{FORK}:challenges/chl_demo_v1.yaml": lane_yaml("challenge", claim="clm_draft_v1"),
            f"{FORK}:challenges/chl_gone_v1.yaml": lane_yaml(
                "challenge", id="chl_gone_v1", claim="clm_nope_v1"
            ),
        },
    )
    _, body = go(gh, base_claims)
    assert "not registered yet" in body and "does not exist" in body


def test_a_replication_whose_changes_break_the_claim_is_flagged(base_claims: Path) -> None:
    broken = lane_yaml("replication", changes={"window_end": "tomorrow"})
    gh = FakeGitHub(
        [added("replications/rep_demo_v1.yaml")], {f"{FORK}:replications/rep_demo_v1.yaml": broken}
    )
    _, body = go(gh, base_claims)
    assert "does not validate" in body


def test_editing_an_old_submission_or_writing_a_result_is_blocked(base_claims: Path) -> None:
    files = [
        {"status": "modified", "filename": "challenges/chl_demo_v1.yaml"},
        {"status": "removed", "filename": "replications/rep_demo_v1.yaml"},
        added("replications/results/rep_demo_v1.json"),
    ]
    _, body = go(
        FakeGitHub(files, {f"{FORK}:challenges/chl_demo_v1.yaml": lane_yaml("challenge")}),
        base_claims,
    )
    assert body.count("append-only") == 2 and "replication results are generated" in body


def test_a_challenge_that_stamps_its_own_time_is_flagged(base_claims: Path) -> None:
    gh = FakeGitHub(
        [added("challenges/chl_demo_v1.yaml")],
        {
            f"{FORK}:challenges/chl_demo_v1.yaml": lane_yaml(
                "challenge", submitted_at="2020-01-01T00:00:00Z"
            )
        },
    )
    _, body = go(gh, base_claims)
    assert "leave submitted_at" in body
