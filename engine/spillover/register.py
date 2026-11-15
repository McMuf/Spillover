"""Registration: CI stamps ``registered_at`` on a claim when its PR merges.

Only the placeholder line is rewritten, so the author's comments and formatting survive. After
this, the claim is frozen (see ``frozen.py``): changing it means registering a new version.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime
from pathlib import Path

from spillover.models import ClaimError, claim_files, load_claim

PLACEHOLDER = "set_by_ci_on_merge"
PLACEHOLDER_LINE = re.compile(rf"^registered_at:[ \t]*{PLACEHOLDER}[ \t]*(#.*)?$", re.MULTILINE)


def has_placeholder(text: str) -> bool:
    return PLACEHOLDER_LINE.search(text) is not None


def register_claims(claims_dir: Path, now: datetime) -> list[Path]:
    """Stamp every draft claim with ``now`` (UTC). Returns the files that changed."""
    if now.tzinfo is None:
        raise ClaimError("registration time must be timezone-aware")
    stamp = now.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    changed: list[Path] = []
    for path in claim_files(claims_dir):
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
