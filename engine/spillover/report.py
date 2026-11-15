"""Plain-text rendering of a backtest report."""

from __future__ import annotations

import math

from spillover.eventstudy import EST_GAP, EST_LEN, BacktestReport


def _pct(x: float) -> str:
    return "n/a" if math.isnan(x) else f"{x * 100:+.2f}%"


def format_report(r: BacktestReport) -> str:
    data_line = (
        f"Data: SYNTHETIC fixtures in {r.data_root} (simulated, not real market data)"
        if r.data_synthetic
        else f"Data: {r.data_root}"
    )
    what = (
        "mean cumulative abnormal return"
        if r.measure == "abnormal_return"
        else "mean excess |move| (|CAR| minus its typical size)"
    )
    lines = [
        "SPILLOVER BACKTEST REPORT (backtest only, not forward evidence)",
        data_line,
        "",
        f"Claim:      {r.claim_id}",
        f"Statement:  {r.statement}",
        f"Instrument: {r.instrument}    Baseline: {r.baseline}    Measure: {r.measure}",
        f"Window:     day 0 to +{r.window_days - 1} trading day(s) ({r.window_days} days)",
        f"Estimation: {EST_LEN} trading days ending {EST_GAP} days before each event",
        "",
        "Events",
        f"  matched the claim            {r.n_matched:>4}",
        f"  dropped, not enough history  {r.n_no_history:>4}",
        f"  dropped, scheduled overlap   {r.n_scheduled_overlap:>4}",
        f"  collapsed, overlapping       {r.n_overlap_collapsed:>4}",
        f"  effective independent events {r.n_effective:>4}   (claim requires {r.min_events})",
        "",
        f"Estimate ({what}):",
        f"  {_pct(r.mean)}   95% interval [{_pct(r.ci_lo)}, {_pct(r.ci_hi)}]   n = {r.n_effective}",
        f"  bootstrap p = {r.p_value:.4f}   (B = {r.n_boot}, seed = {r.seed}; not adjusted for "
        "multiple claims)",
        f"  expected sign: {r.expected_sign}    as of {r.as_of.isoformat()}",
        "",
        f"Result: {r.verdict}",
        "",
        "Research, not investment advice.",
    ]
    return "\n".join(lines)
