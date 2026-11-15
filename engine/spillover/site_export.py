"""Export everything the static website needs as one typed JSON file.

The Pydantic models here are the contract with the web app: ``spillover schema`` turns them into
``schemas/site.schema.json`` and the web build turns that into TypeScript types, so a field change
becomes a compile error in the UI instead of a runtime surprise.

Nothing machine-local is exported (no filesystem paths, no timestamps from the wall clock), so the
output is deterministic for the same inputs.
"""

from __future__ import annotations

import math
from datetime import date, datetime
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict

from spillover.data import DataError, MarketData
from spillover.eventstudy import (
    DEFAULT_BOOT,
    DEFAULT_SEED,
    BacktestReport,
    WindowPath,
    matching_events,
    mean_window_path,
    run_backtest,
)
from spillover.ledger import RULES_VERSION, engine_version, load_prediction, prediction_files
from spillover.models import Claim
from spillover.scoreboard import build_scoreboard
from spillover.scoring import load_outcome, outcome_files, window_closed

REPO = "McMuf/Spillover"


class _M(BaseModel):
    model_config = ConfigDict(extra="forbid")


# --- scoreboard --------------------------------------------------------------------------------


class CalibrationBin(_M):
    range: tuple[float, float]
    n: int
    mean_confidence: float | None
    hit_rate: float | None
    hit_rate_ci: tuple[float, float] | None


class ScoreboardClaim(_M):
    claim_id: str
    version: int
    statement: str
    instrument: str
    registered_by: str
    registered_at: str | None
    event_type: str
    expected_sign: Literal["positive", "negative"]
    measure: str
    baseline: str
    placebo: bool
    status: Literal["Proposed", "Supported", "Not supported", "Inconclusive"]
    forward_events: int
    effective_events: int
    min_events: int
    excluded_scheduled_overlap: int
    collapsed_overlapping: int
    mean: float | None
    ci_lo: float | None
    ci_hi: float | None
    p_value: float | None
    q_value: float | None
    beat_baseline: bool
    hits: int
    hit_rate: float | None
    hit_rate_ci: tuple[float, float] | None
    synthetic: bool


class Contributor(_M):
    registered_by: str
    claims_registered: int
    claims_with_verdict: int
    share_supported: float | None
    effective_events: int
    hit_rate: float | None
    hit_rate_ci: tuple[float, float] | None
    small_sample: bool
    small_sample_note: str | None
    calibration: list[CalibrationBin]


class PlaceboInfo(_M):
    claims: list[str]
    alert: bool
    message: str


class Scoreboard(_M):
    schema_version: Literal[1]
    rules_version: str
    engine_version: str
    as_of: date | None
    synthetic: bool
    claims: list[ScoreboardClaim]
    contributors: list[Contributor]
    calibration: list[CalibrationBin]
    placebo: PlaceboInfo
    notes: list[str]


# --- per-claim evidence ------------------------------------------------------------------------


class EventStatOut(_M):
    event_id: str
    event_date: date
    car: float
    value: float


class Backtest(_M):
    claim_id: str
    statement: str
    instrument: str
    baseline: str
    measure: str
    expected_sign: Literal["positive", "negative"]
    window_days: int
    data_synthetic: bool
    as_of: date
    n_matched: int
    n_no_history: int
    n_scheduled_overlap: int
    n_overlap_collapsed: int
    n_effective: int
    min_events: int
    mean: float | None
    ci_lo: float | None
    ci_hi: float | None
    p_value: float
    n_boot: int
    seed: int
    verdict: str
    events: list[EventStatOut]


class Chart(_M):
    days: list[int]
    mean: list[float]
    lo: list[float]
    hi: list[float]
    n_events: int
    event_window_end: int
    estimation_end: int


class ForwardRow(_M):
    event_id: str
    event_date: date
    created_at: datetime
    sha256: str
    status: Literal["open", "closed", "graded"]
    hit: bool | None
    value: float | None
    proof: Literal["none", "present"]


class SiteClaim(_M):
    claim: Claim
    yaml: str
    status: Literal["Draft", "Proposed", "Supported", "Not supported", "Inconclusive"]
    backtest: Backtest | None
    backtest_error: str | None
    chart: Chart | None
    forward_log: list[ForwardRow]
    event_ids: list[str]


class EventClaimStat(_M):
    claim_id: str
    effective: bool
    value: float | None


class SiteEvent(_M):
    event_id: str
    event_type: str
    entities: list[str]
    date: date
    scheduled: bool
    source: str
    claims: list[EventClaimStat]


class SiteMeta(_M):
    repo: str
    engine_version: str
    rules_version: str
    data_synthetic: bool
    data_as_of: date


class SiteData(_M):
    schema_version: Literal[1]
    meta: SiteMeta
    claims: list[SiteClaim]
    events: list[SiteEvent]
    scoreboard: Scoreboard


def site_json_schema() -> dict[str, Any]:
    # Serialization mode: fields with defaults are always present in the exported JSON.
    schema = SiteData.model_json_schema(mode="serialization")
    schema["$schema"] = "https://json-schema.org/draft/2020-12/schema"
    schema["title"] = "Spillover site data"
    return schema


# --- building ----------------------------------------------------------------------------------


def _f(x: float) -> float | None:
    return None if math.isnan(x) or math.isinf(x) else x


def _backtest(r: BacktestReport) -> Backtest:
    return Backtest(
        claim_id=r.claim_id,
        statement=r.statement,
        instrument=r.instrument,
        baseline=r.baseline,
        measure=r.measure,
        expected_sign="positive" if r.expected_sign == "positive" else "negative",
        window_days=r.window_days,
        data_synthetic=r.data_synthetic,
        as_of=r.as_of,
        n_matched=r.n_matched,
        n_no_history=r.n_no_history,
        n_scheduled_overlap=r.n_scheduled_overlap,
        n_overlap_collapsed=r.n_overlap_collapsed,
        n_effective=r.n_effective,
        min_events=r.min_events,
        mean=_f(r.mean),
        ci_lo=_f(r.ci_lo),
        ci_hi=_f(r.ci_hi),
        p_value=r.p_value,
        n_boot=r.n_boot,
        seed=r.seed,
        verdict=r.verdict,
        events=[
            EventStatOut(event_id=e.event_id, event_date=e.event_date, car=e.car, value=e.value)
            for e in r.events
        ],
    )


def _chart(w: WindowPath) -> Chart:
    return Chart(
        days=w.days,
        mean=w.mean,
        lo=w.lo,
        hi=w.hi,
        n_events=w.n_events,
        event_window_end=w.event_window_end,
        estimation_end=w.estimation_end,
    )


def _forward_log(
    claim: Claim, data: MarketData, predictions_root: Path, outcomes_root: Path
) -> list[ForwardRow]:
    graded = {}
    for path in outcome_files(outcomes_root):
        o = load_outcome(path)
        if o.claim_id == claim.id and o.corrects is None:
            graded[o.event_id] = o
    rows: list[ForwardRow] = []
    for path in prediction_files(predictions_root):
        pred = load_prediction(path)
        if pred.claim_id != claim.id:
            continue
        outcome = graded.get(pred.event_id)
        if outcome is not None:
            status: Literal["open", "closed", "graded"] = "graded"
        elif window_closed(data, pred.event_date, pred.window.end_offset):
            status = "closed"
        else:
            status = "open"
        proof = "present" if path.with_name(path.name + ".ots").exists() else "none"
        rows.append(
            ForwardRow(
                event_id=pred.event_id,
                event_date=pred.event_date,
                created_at=pred.created_at,
                sha256=pred.sha256,
                status=status,
                hit=outcome.hit if outcome else None,
                value=outcome.value if outcome else None,
                proof=proof,
            )
        )
    return sorted(rows, key=lambda r: (r.event_date, r.event_id))


def build_site_data(
    claims: list[tuple[Claim, str]],
    data: MarketData,
    predictions_root: Path,
    outcomes_root: Path,
    n_boot: int = DEFAULT_BOOT,
    seed: int = DEFAULT_SEED,
) -> SiteData:
    """``claims`` pairs each claim with its raw YAML text (shown on the claim page)."""
    board = Scoreboard.model_validate(
        build_scoreboard([c for c, _ in claims], outcomes_root, n_boot=n_boot, seed=seed)
    )
    status_of = {row.claim_id: row.status for row in board.claims}

    site_claims: list[SiteClaim] = []
    stat_values: dict[tuple[str, str], float] = {}
    event_to_claims: dict[str, list[str]] = {}

    for claim, text in sorted(claims, key=lambda p: p[0].id):
        backtest: Backtest | None = None
        chart: Chart | None = None
        error: str | None = None
        try:
            report = run_backtest(claim, data, n_boot=n_boot, seed=seed)
            backtest = _backtest(report)
            path = mean_window_path(claim, data, report.events)
            chart = _chart(path) if path else None
            for e in report.events:
                stat_values[(claim.id, e.event_id)] = e.value
        except DataError as exc:
            error = str(exc)

        ids = matching_events(claim, data)["event_id"].to_list()
        for event_id in ids:
            event_to_claims.setdefault(event_id, []).append(claim.id)

        site_claims.append(
            SiteClaim(
                claim=claim,
                yaml=text,
                status=status_of.get(claim.id, "Draft"),  # type: ignore[arg-type]
                backtest=backtest,
                backtest_error=error,
                chart=chart,
                forward_log=_forward_log(claim, data, predictions_root, outcomes_root),
                event_ids=ids,
            )
        )

    events: list[SiteEvent] = []
    ev = data.events
    for event_id in ev["event_id"].unique(maintain_order=True).to_list():
        rows = ev.filter(ev["event_id"] == event_id)
        first = rows.row(0, named=True)
        fired = sorted(set(event_to_claims.get(event_id, [])))
        if not fired:
            continue  # the site only shows events that some claim is about
        events.append(
            SiteEvent(
                event_id=event_id,
                event_type=first["event_type"],
                entities=sorted(set(rows["entity"].to_list())),
                date=first["date"],
                scheduled=bool(first["scheduled"]),
                source=first["source"],
                claims=[
                    EventClaimStat(
                        claim_id=cid,
                        effective=(cid, event_id) in stat_values,
                        value=stat_values.get((cid, event_id)),
                    )
                    for cid in fired
                ],
            )
        )

    return SiteData(
        schema_version=1,
        meta=SiteMeta(
            repo=REPO,
            engine_version=engine_version(),
            rules_version=RULES_VERSION,
            data_synthetic=data.synthetic,
            data_as_of=data.as_of,
        ),
        claims=site_claims,
        events=sorted(events, key=lambda e: (e.date, e.event_id)),
        scoreboard=board,
    )
