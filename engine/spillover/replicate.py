"""Run replications: the claim with a contributor's named changes, executed by the engine.

The contributor supplies only the config. The result is computed here and written once to
``replications/results/<id>.json`` with a hash, so nobody can hand-write a favorable result. A
replication result is a backtest, labeled as one; on synthetic data it is refused unless forced.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

from spillover.data import DataError, MarketData
from spillover.eventstudy import DEFAULT_BOOT, DEFAULT_SEED, run_backtest
from spillover.lanes import (
    LaneError,
    Replication,
    ReplicationResult,
    apply_changes,
    check_target,
    describe_changes,
    lane_files,
    load_replication,
)
from spillover.ledger import RULES_VERSION, engine_version, hash_record
from spillover.models import Claim, ClaimError, claim_files, load_claim

RESULTS_DIR = Path("replications/results")


def _finite(x: float) -> float | None:
    return None if math.isnan(x) or math.isinf(x) else x


def result_path(root: Path, replication_id: str) -> Path:
    return root / f"{replication_id}.json"


def run_replication(
    rep: Replication,
    claim: Claim,
    data: MarketData,
    n_boot: int = DEFAULT_BOOT,
    seed: int = DEFAULT_SEED,
) -> ReplicationResult:
    """Apply the changes to the claim and backtest it. Raises LaneError or DataError."""
    why = check_target(claim, rep.claim)
    if why is not None:
        raise LaneError(f"{rep.id}: {why}")
    variant = apply_changes(claim, rep.changes)
    report = run_backtest(variant, data, n_boot=n_boot, seed=seed)
    draft = ReplicationResult(
        replication_id=rep.id,
        claim_id=claim.id,
        applied_changes=describe_changes(rep.changes),
        n_matched=report.n_matched,
        n_effective=report.n_effective,
        min_events=report.min_events,
        mean=_finite(report.mean),
        ci_lo=_finite(report.ci_lo),
        ci_hi=_finite(report.ci_hi),
        p_value=report.p_value,
        verdict=report.verdict,
        as_of=report.as_of.isoformat(),
        data_synthetic=report.data_synthetic,
        engine_version=engine_version(),
        rules_version=RULES_VERSION,
        sha256="0" * 64,
    )
    return draft.model_copy(update={"sha256": hash_record(draft)})


def write_result(root: Path, result: ReplicationResult) -> Path:
    path = result_path(root, result.replication_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(result.model_dump(mode="json"), indent=2, sort_keys=True) + "\n"
    try:
        with path.open("x", encoding="utf-8") as fh:  # append-only: a result is never replaced
            fh.write(text)
    except FileExistsError:
        raise LaneError(f"{path} already exists; replication results are append-only") from None
    return path


def load_result(path: Path) -> ReplicationResult:
    try:
        result = ReplicationResult.model_validate_json(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise LaneError(f"{path}: unreadable replication result: {exc}") from exc
    if hash_record(result) != result.sha256:
        raise LaneError(f"{path}: hash mismatch; the result was edited after it was generated")
    return result


def run_pending(
    replications_dir: Path,
    claims_dir: Path,
    results_dir: Path,
    data: MarketData,
    n_boot: int = DEFAULT_BOOT,
) -> tuple[list[Path], list[str]]:
    """Run every replication that has no result yet. Returns (written, problems)."""
    claims = {c.id: c for c in (load_claim(p) for p in claim_files(claims_dir))}
    written: list[Path] = []
    problems: list[str] = []
    for path in lane_files(replications_dir):
        try:
            rep = load_replication(path)
        except ClaimError as exc:
            problems.append(str(exc))
            continue
        if result_path(results_dir, rep.id).exists():
            continue
        try:
            result = run_replication(rep, claims.get(rep.claim) or _missing(rep), data, n_boot)
        except (LaneError, DataError) as exc:
            problems.append(f"{rep.id}: {exc}")
            continue
        written.append(write_result(results_dir, result))
    return written, problems


def _missing(rep: Replication) -> Claim:
    raise LaneError(f"{rep.id}: claim {rep.claim} does not exist in claims/")
