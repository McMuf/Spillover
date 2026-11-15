"""OpenTimestamps proofs for ledger records, via the standard ``ots`` command-line client.

Each prediction file ``X.json`` gets a proof ``X.json.ots``. Stamping submits only a salted
SHA-256 digest of the file to public calendar servers; the proof starts *pending* and becomes
a Bitcoin-anchored attestation after the calendars' next block confirmation (usually hours), at
which point ``upgrade`` completes it. Verify a finished proof with ``ots verify X.json.ots``
(needs a Bitcoin node or the verifier's own setup; that is deliberate: nobody must trust us).
"""

from __future__ import annotations

import shutil
import subprocess
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from spillover.ledger import prediction_files

Runner = Callable[[list[str]], "subprocess.CompletedProcess[str]"]
CONFIRMED_MARKER = "BitcoinBlockHeaderAttestation"


class StampError(RuntimeError):
    """Raised when the ots client is missing or a stamp/upgrade fails."""


def default_runner(args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, capture_output=True, text=True, check=False)


def ots_binary() -> str:
    found = shutil.which("ots")
    if found is None:
        raise StampError(
            "the `ots` client is not installed; run `uv sync --group ots` "
            "(then `uv run spillover stamp`)"
        )
    return found


def proof_path(prediction: Path) -> Path:
    return prediction.with_name(prediction.name + ".ots")


def stamp_new(root: Path, run: Runner = default_runner, ots: str = "ots") -> list[Path]:
    """Create a pending proof for every prediction that has none. Returns the new proofs."""
    created: list[Path] = []
    for pred in prediction_files(root):
        proof = proof_path(pred)
        if proof.exists():
            continue
        result = run([ots, "stamp", str(pred)])
        if result.returncode != 0 or not proof.exists():
            raise StampError(f"stamping {pred} failed: {result.stderr.strip() or result.stdout}")
        created.append(proof)
    return created


def is_confirmed(proof: Path, run: Runner = default_runner, ots: str = "ots") -> bool:
    result = run([ots, "info", str(proof)])
    if result.returncode != 0:
        raise StampError(f"cannot read proof {proof}: {result.stderr.strip()}")
    return CONFIRMED_MARKER in result.stdout


@dataclass(frozen=True)
class UpgradeSummary:
    confirmed: list[Path]
    pending: list[Path]


def upgrade_pending(root: Path, run: Runner = default_runner, ots: str = "ots") -> UpgradeSummary:
    """Try to complete every pending proof. Proofs that are not ready yet stay pending."""
    confirmed: list[Path] = []
    pending: list[Path] = []
    for pred in prediction_files(root):
        proof = proof_path(pred)
        if not proof.exists():
            continue
        if is_confirmed(proof, run, ots):
            confirmed.append(proof)
            continue
        run([ots, "upgrade", str(proof)])  # exits nonzero while the calendar is still waiting
        backup = proof.with_name(proof.name + ".bak")
        backup.unlink(missing_ok=True)  # ots keeps a backup of the old proof; we do not commit it
        (confirmed if is_confirmed(proof, run, ots) else pending).append(proof)
    return UpgradeSummary(confirmed, pending)
