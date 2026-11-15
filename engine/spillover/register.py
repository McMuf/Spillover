"""Registration: CI stamps ``registered_at`` on a claim when its PR merges.

Only the placeholder line is rewritten, so the author's comments and formatting survive. After
this, the claim is frozen (see ``frozen.py``): changing it means registering a new version.
"""

from __future__ import annotations

import re
from collections.abc import Callable, Collection
from datetime import UTC, datetime
from datetime import datetime as _dt
from pathlib import Path

from spillover.lanes import lane_files, load_challenge, load_replication
from spillover.models import ClaimError, claim_files, load_claim

PLACEHOLDER = "set_by_ci_on_merge"
PLACEHOLDER_LINE = re.compile(rf"^registered_at:[ \t]*{PLACEHOLDER}[ \t]*(#.*)?$", re.MULTILINE)


def has_placeholder(text: str) -> bool:
    return PLACEHOLDER_LINE.search(text) is not None


def _selected(paths: list[Path], only: Collection[Path] | None) -> list[Path]:
    """All paths, or just those named in ``only`` (compared by resolved location)."""
    if only is None:
        return paths
    wanted = {p.resolve() for p in only}
    return [p for p in paths if p.resolve() in wanted]


def register_claims(
    claims_dir: Path, now: datetime, only: Collection[Path] | None = None
) -> list[Path]:
    """Stamp draft claims with ``now`` (UTC). Returns the files that changed.

    With ``only``, nothing but those files can be stamped: CI passes exactly the files a push
    added, so an unrelated push can never register a draft that was merely sitting on main.
    """
    if now.tzinfo is None:
        raise ClaimError("registration time must be timezone-aware")
    stamp = now.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    changed: list[Path] = []
    for path in _selected(claim_files(claims_dir), only):
        claim = load_claim(path)  # never register an invalid claim
        if claim.registered_at_utc is not None:
            continue
        text = path.read_text(encoding="utf-8")
        new_text, n = PLACEHOLDER_LINE.subn(lambda m: f"registered_at: {stamp}", text)
        if n != 1:
            raise ClaimError(f"{path}: expected exactly one registered_at line to stamp")
        path.write_text(new_text, encoding="utf-8")
        registered = load_claim(path)
        if registered.registered_at_utc is None:  # pragma: no cover - defensive
            raise ClaimError(f"{path}: registration did not take effect")
        changed.append(path)
    return changed


SUBMITTED_LINE = re.compile(rf"^submitted_at:[ \t]*{PLACEHOLDER}[ \t]*(#.*)?$", re.MULTILINE)


def has_submission_placeholder(text: str) -> bool:
    return SUBMITTED_LINE.search(text) is not None


def _stamp_submissions(
    directory: Path,
    now: datetime,
    load: Callable[[Path], object],
    is_stamped: Callable[[object], bool],
    only: Collection[Path] | None = None,
) -> list[Path]:
    if now.tzinfo is None:
        raise ClaimError("submission time must be timezone-aware")
    stamp = now.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    changed: list[Path] = []
    for path in _selected(lane_files(directory), only):
        if is_stamped(load(path)):  # also validates: an invalid file is never stamped
            continue
        text = path.read_text(encoding="utf-8")
        new_text, n = SUBMITTED_LINE.subn(lambda m: f"submitted_at: {stamp}", text)
        if n != 1:
            raise ClaimError(f"{path}: expected exactly one submitted_at line to stamp")
        path.write_text(new_text, encoding="utf-8")
        load(path)
        changed.append(path)
    return changed


def stamp_challenges(
    directory: Path, now: datetime, only: Collection[Path] | None = None
) -> list[Path]:
    return _stamp_submissions(
        directory,
        now,
        load_challenge,
        lambda c: isinstance(getattr(c, "submitted_at", None), _dt),
        only,
    )


def stamp_replications(
    directory: Path, now: datetime, only: Collection[Path] | None = None
) -> list[Path]:
    return _stamp_submissions(
        directory,
        now,
        load_replication,
        lambda r: isinstance(getattr(r, "submitted_at", None), _dt),
        only,
    )
