"""Scoreboard: aggregate outcome records into per-claim, per-contributor and calibration data.

Reads only claims and outcome records, so anyone can recompute it from the repo and get the same
numbers. Output is deterministic (no wall-clock time) so regenerating it never creates churn.
"""

from __future__ import annotations

import math
from collections import defaultdict
from pathlib import Path
from typing import Any

import numpy as np

from spillover.eventstudy import DEFAULT_BOOT, DEFAULT_SEED, bootstrap_mean, fdr_adjust
from spillover.ledger import RULES_VERSION, engine_version
from spillover.models import Claim
from spillover.scoring import Outcome, load_outcome, outcome_files

FDR_LEVEL = 0.05
SMALL_SAMPLE = 30  # below this many effective events a contributor's rates carry a warning
CALIBRATION_EDGES = (0.5, 0.6, 0.7, 0.8, 0.9, 1.0)
PLACEBO_EVENT_TYPE = "RANDOM_DATE"

NOTES = [
    "Research, not investment advice.",
    "Statuses describe the pattern in the sample under the stated rules, not a forecast.",
    "Intervals are 95% bootstrap intervals over effective independent events.",
]


def _num(x: float) -> float | None:
    return None if math.isnan(x) or math.isinf(x) else x


def wilson_interval(hits: int, n: int, z: float = 1.96) -> tuple[float, float] | None:
    """Wilson score interval for a proportion; None when there are no trials."""
    if n == 0:
        return None
    p = hits / n
    denom = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return max(0.0, centre - half), min(1.0, centre + half)


def superseded_hashes(outcomes: list[Outcome]) -> set[str]:
    """Hashes of outcomes that a later correction points at (scoring rule 8)."""
    return {o.corrects for o in outcomes if o.corrects is not None}


def effective_outcomes(outcomes: list[Outcome]) -> tuple[list[Outcome], int, int]:
    """Apply the independence rules. Returns (effective, n_scheduled_excluded, n_collapsed)."""
    live = [o for o in outcomes if o.sha256 not in superseded_hashes(outcomes)]
    usable = [o for o in live if not o.scheduled_overlap]
    n_sched = len(live) - len(usable)
    kept: list[Outcome] = []
    for o in sorted(usable, key=lambda o: (o.window_start, o.event_id)):
        if not kept or o.window_start > kept[-1].window_end:
            kept.append(o)
    return kept, n_sched, len(usable) - len(kept)


def claim_status(
    n_eff: int,
    min_events: int,
    lo: float,
    hi: float,
    mean: float,
    expected_sign: str,
    q: float | None,
) -> str:
    """Status per the public thresholds.

    * Proposed: registered, still collecting forward events.
    * Supported: enough events, interval excludes zero in the stated direction, and the result
      survives false-discovery-rate adjustment across claims.
    * Not supported: enough events and the interval excludes zero in the *opposite* direction.
    * Inconclusive: enough events but the interval includes zero, or the result did not survive
      the multiple-comparison adjustment.
    """
    if n_eff < min_events:
        return "Proposed"
    sign = 1.0 if expected_sign == "positive" else -1.0
    excludes_zero = lo > 0 or hi < 0
    if excludes_zero and sign * mean > 0:
        return "Supported" if q is not None and q < FDR_LEVEL else "Inconclusive"
    if excludes_zero:
        return "Not supported"
    return "Inconclusive"


def calibration_bins(outcomes: list[Outcome]) -> list[dict[str, Any]]:
    """Stated confidence versus realized hit rate, for outcomes that stated a confidence."""
    stated = [(o.confidence, o.hit) for o in outcomes if o.confidence is not None]
    bins: list[dict[str, Any]] = []
    for lo, hi in zip(CALIBRATION_EDGES[:-1], CALIBRATION_EDGES[1:], strict=True):
        last = hi == CALIBRATION_EDGES[-1]
        inside = [(c, h) for c, h in stated if lo <= c < hi + (1e-9 if last else 0)]
        hits = sum(1 for _, h in inside if h)
        n = len(inside)
        bins.append(
            {
                "range": [lo, hi],
                "n": n,
                "mean_confidence": float(np.mean([c for c, _ in inside])) if n else None,
                "hit_rate": hits / n if n else None,
                "hit_rate_ci": wilson_interval(hits, n),
            }
        )
    return bins


def _load_all(outcomes_root: Path) -> dict[str, list[Outcome]]:
    grouped: dict[str, list[Outcome]] = defaultdict(list)
    for path in outcome_files(outcomes_root):
        o = load_outcome(path)
        grouped[o.claim_id].append(o)
    return grouped


def build_scoreboard(
    claims: list[Claim],
    outcomes_root: Path,
    n_boot: int = DEFAULT_BOOT,
    seed: int = DEFAULT_SEED,
) -> dict[str, Any]:
    registered = sorted((c for c in claims if c.registered_at_utc is not None), key=lambda c: c.id)
    grouped = _load_all(outcomes_root)

    # First pass: effective sample and bootstrap for every registered claim.
    prelim: dict[str, dict[str, Any]] = {}
    for c in registered:
        outs = grouped.get(c.id, [])
        live = [o for o in outs if o.sha256 not in superseded_hashes(outs)]
        eff, n_sched, n_coll = effective_outcomes(outs)
        values = np.array([o.value for o in eff], dtype=np.float64)
        boot = bootstrap_mean(values, n_boot=n_boot, seed=seed) if len(eff) else None
        prelim[c.id] = {
            "live": live,
            "eff": eff,
            "n_sched": n_sched,
            "n_coll": n_coll,
            "boot": boot,
        }

    # False-discovery-rate adjustment across the claims that have a defined p-value.
    testable = [cid for cid, d in prelim.items() if d["boot"] is not None and len(d["eff"]) >= 2]
    qs = dict(
        zip(testable, fdr_adjust([prelim[cid]["boot"].p_value for cid in testable]), strict=True)
    )

    rows: list[dict[str, Any]] = []
    for c in registered:
        d = prelim[c.id]
        eff: list[Outcome] = d["eff"]
        boot = d["boot"]
        n_eff = len(eff)
        hits = sum(1 for o in eff if o.hit)
        q = qs.get(c.id)
        mean, lo, hi, p = (
            (boot.mean, boot.lo, boot.hi, boot.p_value)
            if boot is not None
            else (math.nan,) * 3 + (1.0,)
        )
        sign = 1.0 if c.expected_sign == "positive" else -1.0
        beat = bool(n_eff >= 2 and (lo > 0 or hi < 0) and sign * mean > 0)
        rows.append(
            {
                "claim_id": c.id,
                "version": c.version,
                "statement": " ".join(c.statement.split()),
                "instrument": f"{c.instrument.symbol} · {c.instrument.venue}",
                "registered_by": c.registered_by,
                "registered_at": c.registered_at_utc.isoformat() if c.registered_at_utc else None,
                "event_type": c.event_type,
                "expected_sign": c.expected_sign,
                "measure": c.measure,
                "baseline": c.baseline,
                "placebo": c.event_type == PLACEBO_EVENT_TYPE,
                "status": claim_status(
                    n_eff, c.success.min_forward_events, lo, hi, mean, c.expected_sign, q
                ),
                "forward_events": len(d["live"]),
                "effective_events": n_eff,
                "min_events": c.success.min_forward_events,
                "excluded_scheduled_overlap": d["n_sched"],
                "collapsed_overlapping": d["n_coll"],
                "mean": _num(mean),
                "ci_lo": _num(lo),
                "ci_hi": _num(hi),
                "p_value": _num(p) if boot is not None else None,
                "q_value": q,
                "beat_baseline": beat,
                "hits": hits,
                "hit_rate": hits / n_eff if n_eff else None,
                "hit_rate_ci": wilson_interval(hits, n_eff),
                "synthetic": any(o.data_synthetic for o in d["live"]),
            }
        )

    by_claim = {r["claim_id"]: r for r in rows}
    contributors: list[dict[str, Any]] = []
    for who in sorted({c.registered_by for c in registered}):
        mine = [c for c in registered if c.registered_by == who]
        rs = [by_claim[c.id] for c in mine]
        verdicts = [r for r in rs if r["status"] in ("Supported", "Not supported", "Inconclusive")]
        supported = sum(1 for r in verdicts if r["status"] == "Supported")
        eff_all = [o for c in mine for o in prelim[c.id]["eff"]]
        hits = sum(1 for o in eff_all if o.hit)
        n = len(eff_all)
        contributors.append(
            {
                "registered_by": who,
                "claims_registered": len(mine),
                "claims_with_verdict": len(verdicts),
                "share_supported": supported / len(verdicts) if verdicts else None,
                "effective_events": n,
                "hit_rate": hits / n if n else None,
                "hit_rate_ci": wilson_interval(hits, n),
                "small_sample": n < SMALL_SAMPLE,
                "small_sample_note": (
                    f"Only {n} effective events so far; rates below {SMALL_SAMPLE} are noisy."
                    if n < SMALL_SAMPLE
                    else None
                ),
                "calibration": calibration_bins(eff_all),
            }
        )

    all_eff = [o for d in prelim.values() for o in d["eff"]]
    placebo_rows = [r for r in rows if r["placebo"]]
    fired = [
        r["claim_id"]
        for r in placebo_rows
        if r["effective_events"] >= r["min_events"] and (r["ci_lo"] or 0) * (r["ci_hi"] or 0) > 0
    ]
    all_outcomes = [o for d in prelim.values() for o in d["live"]]

    return {
        "schema_version": 1,
        "rules_version": RULES_VERSION,
        "engine_version": engine_version(),
        "as_of": max((o.data_as_of for o in all_outcomes), default=None),
        "synthetic": any(o.data_synthetic for o in all_outcomes),
        "claims": rows,
        "contributors": contributors,
        "calibration": calibration_bins(all_eff),
        "placebo": {
            "claims": [r["claim_id"] for r in placebo_rows],
            "alert": bool(fired),
            "message": (
                "A placebo claim showed a significant result. One in twenty is expected by chance; "
                "repeated alerts mean the engine is broken."
                if fired
                else "No placebo claim has shown a significant result."
            ),
        },
        "notes": NOTES,
    }
