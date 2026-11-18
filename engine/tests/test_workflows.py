"""Policy tests for .github/workflows: the security review, kept as code so it cannot regress."""

import re
from pathlib import Path
from typing import Any

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[2]
WORKFLOWS = sorted((ROOT / ".github" / "workflows").glob("*.yml"))


def load(path: Path) -> dict[str, Any]:
    data = yaml.safe_load(path.read_text())
    data["_triggers"] = set(data.get(True) or data.get("on") or {})  # YAML reads `on:` as True
    return data


SECRET = re.compile(r"\$\{\{\s*secrets\.")  # an actual expression, not the word in a comment
OWN_SECRET = re.compile(r"\$\{\{\s*secrets\.(?!GITHUB_TOKEN\b)")


def on_block(path: Path) -> dict[str, Any]:
    """The `on:` table (YAML reads the key `on` as the boolean True)."""
    data: Any = yaml.safe_load(path.read_text())
    block: dict[str, Any] = data.get(True) or data.get("on")
    return block


def steps(wf: dict[str, Any]) -> list[tuple[str, dict[str, Any]]]:
    return [(job, st) for job, j in wf["jobs"].items() for st in j.get("steps", [])]


@pytest.mark.parametrize("path", WORKFLOWS, ids=lambda p: p.name)
def test_every_action_is_pinned_to_a_commit_sha(path: Path) -> None:
    for uses in re.findall(r"uses:\s*(\S+)", path.read_text()):
        assert re.search(r"@[0-9a-f]{40}$", uses), f"{path.name}: {uses} is not pinned to a commit"


@pytest.mark.parametrize("path", WORKFLOWS, ids=lambda p: p.name)
def test_no_expression_is_interpolated_into_a_shell_script(path: Path) -> None:
    """Untrusted values must travel through env: a ${{ }} inside run: is script injection."""
    for job, step in steps(load(path)):
        assert "${{" not in step.get("run", ""), f"{path.name}/{job}: expression inside run:"


@pytest.mark.parametrize("path", WORKFLOWS, ids=lambda p: p.name)
def test_pull_request_target_is_never_used(path: Path) -> None:
    assert "pull_request_target" not in load(path)["_triggers"]


@pytest.mark.parametrize("path", WORKFLOWS, ids=lambda p: p.name)
def test_secrets_are_scoped_to_single_steps_and_never_to_whole_jobs(path: Path) -> None:
    wf = load(path)
    for name, job in wf["jobs"].items():
        assert not SECRET.search(str(job.get("env", ""))), f"{path.name}/{name}: job-level secret"
        for st in job.get("steps", []):
            assert not SECRET.search(str(st.get("with", ""))), (
                f"{path.name}/{name}: secret in with:"
            )
            assert not SECRET.search(st.get("run", "")), f"{path.name}/{name}: secret in a script"


def test_write_access_is_never_reachable_from_a_pull_request() -> None:
    for path in WORKFLOWS:
        wf = load(path)
        grants = str(wf.get("permissions", "")) + "".join(
            str(j.get("permissions", "")) for j in wf["jobs"].values()
        )
        if "write" in grants and path.name != "check.yml":
            assert not (wf["_triggers"] & {"pull_request", "pull_request_target"}), path.name
    check = load(ROOT / ".github" / "workflows" / "check.yml")
    assert check["permissions"] == {"contents": "read"}
    assert not SECRET.search((ROOT / ".github" / "workflows" / "check.yml").read_text())


@pytest.mark.parametrize("name", ["ingest.yml", "score.yml"])
def test_jobs_that_spend_money_or_write_to_main_stay_off_until_enabled(name: str) -> None:
    wf = load(ROOT / ".github" / "workflows" / name)
    assert wf["_triggers"] <= {"schedule", "workflow_dispatch"}, "never on push or pull_request"
    for job in wf["jobs"].values():
        assert "vars.INGEST_ENABLED == 'true'" in job["if"]
        assert "github.repository ==" in job["if"], "forks must never run it"


def test_comment_bot_never_checks_out_the_pull_request() -> None:
    wf = load(ROOT / ".github" / "workflows" / "comment.yml")
    assert wf["_triggers"] == {"workflow_run"}
    for _, st in steps(wf):
        if "actions/checkout" in st.get("uses", ""):
            assert "ref" not in st.get("with", {}), "checking out a ref could fetch fork code"


# --- registration is precise: only what a push added, never every draft on main -----------------


def test_register_triggers_ignore_templates() -> None:
    paths = on_block(ROOT / ".github" / "workflows" / "register.yml")["push"]["paths"]
    for folder in ("claims", "challenges", "replications"):
        assert f"{folder}/*.yaml" in paths and f"!{folder}/_*.yaml" in paths
        assert paths.index(f"{folder}/*.yaml") < paths.index(f"!{folder}/_*.yaml"), (
            "exclude after include"
        )


def test_register_never_stamps_every_draft() -> None:
    """A bare `spillover register` would freeze any draft sitting on main (this happened once)."""
    wf = load(ROOT / ".github" / "workflows" / "register.yml")
    scripts = "\n".join(st.get("run", "") for _, st in steps(wf))
    calls = [line for line in scripts.splitlines() if "spillover register" in line]
    assert calls, "register.yml must call spillover register"
    for line in calls:
        assert '"${args[@]}"' in line, f"unscoped register call: {line.strip()}"
    assert "--only" in scripts and "--diff-filter=A" in scripts
    checkout = next(st for _, st in steps(wf) if "actions/checkout" in st.get("uses", ""))
    assert checkout["with"]["fetch-depth"] == 0, "the diff against the push's parent needs history"


def test_a_broken_extraction_setup_turns_the_ingest_run_red() -> None:
    wf = load(ROOT / ".github" / "workflows" / "ingest.yml")
    runs = [st.get("run", "") for _, st in steps(wf)]
    assert any("ingest-headlines" in r and "--strict" in r for r in runs)


def test_no_ingest_step_runs_on_a_ledger_that_failed_verification() -> None:
    """Later steps may run after a headline failure, but never after the ledger check failed."""
    wf = load(ROOT / ".github" / "workflows" / "ingest.yml")
    named = [st for _, st in steps(wf) if "name" in st]
    order = [st["name"] for st in named]
    verify_at = order.index("Verify the ledger")
    assert named[verify_at].get("id") == "verify"
    for st in named[verify_at + 1 :]:
        cond = str(st.get("if", ""))
        if "!cancelled()" in cond or "always()" in cond:
            assert "steps.verify.outcome == 'success'" in cond or "steps.prices.outcome" in cond, (
                st["name"]
            )
    prices = next(st for st in named if st.get("id") == "prices")
    assert "steps.verify.outcome == 'success'" in prices["if"]


def test_the_paid_headline_step_has_its_own_switch_and_is_the_only_one_with_the_claude_key() -> (
    None
):
    """Free parts (calendar, placebo, prices, predictions) must run without any paid credit."""
    wf = load(ROOT / ".github" / "workflows" / "ingest.yml")
    for _, st in steps(wf):
        uses_claude = "ANTHROPIC_API_KEY" in str(st.get("env", {}))
        if "ingest-headlines" in st.get("run", ""):
            assert uses_claude
            assert "vars.EXTRACT_HEADLINES == 'true'" in str(st.get("if", ""))
        else:
            assert not uses_claude, st.get("name")


def test_the_site_reads_secrets_only_before_any_npm_package_runs() -> None:
    """A malicious package installed by pnpm must never run before a step that holds a key."""
    wf = load(ROOT / ".github" / "workflows" / "site.yml")
    build = wf["jobs"]["build"]["steps"]
    pnpm_at = next(
        i for i, st in enumerate(build) if "pnpm" in st.get("run", "") + str(st.get("uses", ""))
    )
    for i, st in enumerate(build):
        if SECRET.search(str(st.get("env", {})) + str(st.get("with", {}))):
            assert i < pnpm_at, f"step {st.get('name')} holds a secret after pnpm runs"


def test_the_site_falls_back_to_synthetic_data_when_ingest_is_off() -> None:
    wf = load(ROOT / ".github" / "workflows" / "site.yml")
    export = next(st for st in wf["jobs"]["build"]["steps"] if "export-site" in st.get("run", ""))
    assert "fixtures/synthetic" in export["env"]["SPILLOVER_DATA"]
    cache = next(st for st in wf["jobs"]["build"]["steps"] if st.get("id") == "cache")
    assert "vars.INGEST_ENABLED == 'true'" in cache["if"]


def test_new_predictions_are_submitted_for_timestamping_in_the_same_run() -> None:
    wf = load(ROOT / ".github" / "workflows" / "ingest.yml")
    names = [st.get("name", "") for _, st in steps(wf)]
    runs = [st.get("run", "") for _, st in steps(wf)]
    predict_at = next(i for i, r in enumerate(runs) if "spillover predict" in r)
    stamp_at = next(i for i, r in enumerate(runs) if "spillover stamp" in r)
    upgrade_at = next(i for i, r in enumerate(runs) if "spillover upgrade" in r)
    commit_at = next(i for i, n in enumerate(names) if n.startswith("Commit"))
    assert predict_at < stamp_at < commit_at
    assert upgrade_at < commit_at, "completed proofs must be in the same commit"


def test_a_secret_holding_workflow_is_only_chained_after_workflows_no_pull_request_can_start() -> (
    None
):
    """workflow_run inherits trust from the run that triggered it; never let a PR be that run."""
    by_name = {load(p).get("name"): load(p) for p in WORKFLOWS}
    for path in WORKFLOWS:
        wf = load(path)
        # Our own keys (FRED, Anthropic...). GitHub's built-in GITHUB_TOKEN is excluded: the comment
        # bot uses it after `check` by design and is covered by its own never-run-PR-code test.
        if "workflow_run" not in wf["_triggers"] or not OWN_SECRET.search(path.read_text()):
            continue
        for upstream in on_block(path)["workflow_run"]["workflows"]:
            assert not (by_name[upstream]["_triggers"] & {"pull_request", "pull_request_target"}), (
                f"{path.name} holds secrets and runs after {upstream}, which a pull request can start"
            )


def test_a_commit_step_never_adds_a_path_that_may_not_exist() -> None:
    """`git add missing/path` is a fatal error (exit 128) that silently discards a run's results.

    Every plain `git add` must name paths that are in the repository; anything that appears only
    later is added inside an existence check.
    """
    root = Path(__file__).resolve().parents[2]
    for path in sorted((root / ".github" / "workflows").glob("*.yml")):
        for line in path.read_text().splitlines():
            cmd = line.strip()
            if not cmd.startswith("git add ") or "$" in cmd:
                continue
            for target in cmd.split()[2:]:
                if target.startswith("-"):
                    continue
                assert (root / target).exists(), (
                    f"{path.name}: `{cmd}` adds {target}, which may not exist"
                )


def test_the_site_reads_discussions_but_can_never_write_them() -> None:
    wf = load(ROOT / ".github" / "workflows" / "site.yml")
    build = wf["jobs"]["build"]
    assert build["permissions"].get("discussions") == "read"
    export = next(st for st in build["steps"] if "export-site" in st.get("run", ""))
    assert "--discussions" in export["run"]
    for name, job in wf["jobs"].items():
        assert job.get("permissions", {}).get("discussions", "read") == "read", name


def test_the_site_build_stores_real_icons_and_keeps_them_between_builds() -> None:
    wf = load(ROOT / ".github" / "workflows" / "site.yml")
    build = wf["jobs"]["build"]["steps"]
    export = next(st for st in build if "export-site" in st.get("run", ""))
    assert "--icons" in export["run"]
    caches = [st for st in build if "actions/cache" in str(st.get("uses", ""))]
    assert any(st["with"]["path"] == "data/icons" for st in caches)
    icons_at = next(
        i for i, st in enumerate(build) if st in caches and st["with"]["path"] == "data/icons"
    )
    assert icons_at < build.index(export)
