"""Pull-request guard: registered claims are frozen and generated outputs are never hand-edited.

Run on a PR against its base branch. The scheduled jobs on ``main`` write the generated
directories; contributors never should, so any change there from a PR is a violation.
"""

from __future__ import annotations

import subprocess
from collections.abc import Callable, Iterable
from pathlib import Path, PurePosixPath

from spillover.register import has_placeholder, has_submission_placeholder

GENERATED_DIRS = ("events", "predictions", "outcomes", "scoreboard")
SUBMISSION_DIRS = ("challenges", "replications")
GENERATED_PREFIXES = ("replications/results/",)


class FrozenError(RuntimeError):
    """Raised when git cannot be queried (bad ref, not a repository)."""


def _git(repo: Path, *args: str) -> str:
    proc = subprocess.run(
        ["git", "-c", "core.quotepath=off", *args],
        cwd=repo,
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        raise FrozenError(f"git {' '.join(args)} failed: {proc.stderr.strip()}")
    return proc.stdout


def is_submission_path(path: str) -> bool:
    """A challenge or replication file (the templates, starting with ``_``, are not)."""
    p = PurePosixPath(path)
    return (
        p.parent.as_posix() in SUBMISSION_DIRS
        and p.suffix == ".yaml"
        and not p.name.startswith("_")
    )


def is_claim_path(path: str) -> bool:
    p = PurePosixPath(path)
    return p.parent.as_posix() == "claims" and p.suffix == ".yaml" and not p.name.startswith("_")


ReadText = Callable[[str], str]
"""Reads a file's text at one side of a change (base or head); raises if it does not exist."""


def frozen_violations(
    changes: Iterable[tuple[str, str]], read_base: ReadText, read_head: ReadText
) -> list[str]:
    """Pure rule check on a list of ``(status, path)`` changes, status being A, M or D.

    Taking the file contents through callbacks lets the same rules run on a local git diff
    (``check_frozen``) and on a pull request's files fetched as data by the trusted comment bot.
    """
    problems: list[str] = []
    for status, path in changes:
        name = PurePosixPath(path).name
        top = PurePosixPath(path).parts[0] if PurePosixPath(path).parts else ""

        if any(path.startswith(prefix) for prefix in GENERATED_PREFIXES) and name != ".gitkeep":
            problems.append(f"{path}: replication results are generated; never edit them by hand")
        elif top in GENERATED_DIRS and name != ".gitkeep":
            problems.append(
                f"{path}: generated output ({top}/) must not be changed by a pull request"
            )
        elif is_submission_path(path):
            if status != "A":
                problems.append(
                    f"{path}: challenges and replications are append-only; "
                    "submit a new one (_v2) instead of editing or deleting this"
                )
            elif not has_submission_placeholder(read_head(path)):
                problems.append(
                    f"{path}: leave submitted_at as set_by_ci_on_merge; CI stamps the time"
                )
        elif is_claim_path(path):
            if status == "A":
                if not has_placeholder(read_head(path)):
                    problems.append(
                        f"{path}: a new claim must leave registered_at as set_by_ci_on_merge; "
                        "CI stamps the registration time"
                    )
            elif not has_placeholder(read_base(path)):
                problems.append(
                    f"{path}: this claim is registered and frozen; "
                    "register a new version (_v2) instead of editing or deleting it"
                )
            elif status == "M" and not has_placeholder(read_head(path)):
                problems.append(f"{path}: do not set registered_at yourself; CI stamps it")
    return problems


def check_frozen(base_ref: str, repo: Path = Path(".")) -> list[str]:
    """Return a list of violations in the changes between ``base_ref`` and HEAD (empty is good)."""
    if (
        not base_ref
        or base_ref.startswith("-")
        or any(c.isspace() or ord(c) < 32 for c in base_ref)
    ):
        raise FrozenError(f"refusing suspicious base ref {base_ref!r}")
    diff = _git(repo, "diff", "--name-status", "--no-renames", f"{base_ref}...HEAD")
    changes = [(line.partition("\t")[0], line.partition("\t")[2]) for line in diff.splitlines()]
    return frozen_violations(
        changes,
        read_base=lambda path: _git(repo, "show", f"{base_ref}:{path}"),
        read_head=lambda path: _git(repo, "show", f"HEAD:{path}"),
    )
