"""Pull-request guard: registered claims are frozen and generated outputs are never hand-edited.

Run on a PR against its base branch. The scheduled jobs on ``main`` write the generated
directories; contributors never should, so any change there from a PR is a violation.
"""

from __future__ import annotations

import subprocess
from pathlib import Path, PurePosixPath

from spillover.register import has_placeholder

GENERATED_DIRS = ("events", "predictions", "outcomes", "scoreboard")


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


def _is_claim(path: str) -> bool:
    p = PurePosixPath(path)
    return p.parent.as_posix() == "claims" and p.suffix == ".yaml" and not p.name.startswith("_")


def check_frozen(base_ref: str, repo: Path = Path(".")) -> list[str]:
    """Return a list of violations in the changes between ``base_ref`` and HEAD (empty is good)."""
    diff = _git(repo, "diff", "--name-status", "--no-renames", f"{base_ref}...HEAD")
    problems: list[str] = []
    for line in diff.splitlines():
        status, _, path = line.partition("\t")
        name = PurePosixPath(path).name
        top = PurePosixPath(path).parts[0] if PurePosixPath(path).parts else ""

        if top in GENERATED_DIRS and name != ".gitkeep":
            problems.append(
                f"{path}: generated output ({top}/) must not be changed by a pull request"
            )
        elif _is_claim(path):
            if status == "A":
                if not has_placeholder(_git(repo, "show", f"HEAD:{path}")):
                    problems.append(
                        f"{path}: a new claim must leave registered_at as set_by_ci_on_merge; "
                        "CI stamps the registration time"
                    )
            else:
                base_text = _git(repo, "show", f"{base_ref}:{path}")
                if not has_placeholder(base_text):
                    problems.append(
                        f"{path}: this claim is registered and frozen; "
                        "register a new version (_v2) instead of editing or deleting it"
                    )
                elif status == "M" and not has_placeholder(_git(repo, "show", f"HEAD:{path}")):
                    problems.append(f"{path}: do not set registered_at yourself; CI stamps it")
    return problems
