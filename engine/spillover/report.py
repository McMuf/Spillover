"""Plain-text rendering of a backtest report."""

from __future__ import annotations

import math

from spillover.eventstudy import EST_GAP, EST_LEN, BacktestReport


def _pct(x: float) -> str:
    return "n/a" if math.isnan(x) else f"{x * 100:+.2f}%"


def _rank(x: float) -> str:
    """A size rank (stored minus one half) as the share of ordinary windows that moved less."""
    return "n/a" if math.isnan(x) else f"{min(1.0, max(0.0, x + 0.5)) * 100:.0f}%"


def format_report(r: BacktestReport) -> str:
    data_line = (
        f"Data: SYNTHETIC fixtures in {r.data_root} (simulated, not real market data)"
        if r.data_synthetic
        else f"Data: {r.data_root}"
    )
    swing = r.measure != "abnormal_return"
    what = (
        "mean size rank: share of ordinary same-length windows that moved less (typical = 50%)"
        if swing
        else "mean cumulative abnormal return"
    )
    fmt = _rank if swing else _pct
    lines = [
        "SPILLOVER BACKTEST REPORT (backtest only, not forward evidence)",
        data_line,
        "",
        f"Claim:      {r.claim_id}",
        f"Statement:  {r.statement}",
        f"Instrument: {r.instrument}    Baseline: {r.baseline}    Measure: {r.measure}",
        f"Window:     day 0 to +{r.window_days - 1} trading day(s) ({r.window_days} days)",
        f"Estimation: {EST_LEN} trading days ending {EST_GAP} days before each event, "
        "other news days left out",
        "",
        "Events",
        f"  matched the claim            {r.n_matched:>4}",
        f"  dropped, not enough history  {r.n_no_history:>4}",
        f"  dropped, scheduled overlap   {r.n_scheduled_overlap:>4}",
        f"  collapsed, overlapping       {r.n_overlap_collapsed:>4}",
        f"  effective independent events {r.n_effective:>4}   (claim requires {r.min_events})",
        "",
        f"Estimate ({what}):",
        f"  {fmt(r.mean)}   95% interval [{fmt(r.ci_lo)}, {fmt(r.ci_hi)}]   n = {r.n_effective}",
        f"  t-test p = {r.p_value:.4f}   (not adjusted for multiple claims)",
        f"  expected sign: {r.expected_sign}    as of {r.as_of.isoformat()}",
        "",
        f"Result: {r.verdict}",
        "",
        "Research, not investment advice.",
    ]
    return "\n".join(lines)
