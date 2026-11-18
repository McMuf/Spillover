"""Export everything the static website needs as one typed JSON file.

The Pydantic models here are the contract with the web app: ``spillover schema`` turns them into
``schemas/site.schema.json`` and the web build turns that into TypeScript types, so a field change
becomes a compile error in the UI instead of a runtime surprise.

Nothing machine-local is exported (no filesystem paths, no timestamps from the wall clock), so the
output is deterministic for the same inputs.
"""

from __future__ import annotations

import math
import tempfile
from dataclasses import asdict
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Literal

import polars as pl
from pydantic import BaseModel, ConfigDict

from spillover.data import DataError, MarketData
from spillover.eventstore import load_records
from spillover.eventstudy import (
    DEFAULT_BOOT,
    DEFAULT_SEED,
    BacktestReport,
    WindowPath,
    matching_events,
    mean_window_path,
    run_backtest,
)
from spillover.extractor import Extraction, ExtractionError
from spillover.gold import GOLD_FILE, GoldError, GoldRow, evaluate_gold, load_gold
from spillover.ingest.discussions import Discussions
from spillover.ingest.filings import SOURCE as FILINGS_SOURCE
from spillover.ingest.gdelt import MARKET_WORDS, GdeltHeadline
from spillover.lanes import describe_changes, lane_files, load_challenge, load_replication
from spillover.ledger import (
    RULES_VERSION,
    Prediction,
    engine_version,
    load_prediction,
    prediction_files,
)
from spillover.models import Claim, superseded_ids
from spillover.placebo_events import BACKTEST_ONLY_PREFIX
from spillover.replicate import load_result, result_path
from spillover.rules_extractor import COMPANIES_FILE, RulesExtractor
from spillover.scoreboard import build_scoreboard
from spillover.scoring import load_outcome, outcome_files, prediction_symbols, window_closed
from spillover.taxonomy import EXTRACTABLE, NONE, TAXONOMY, Origin

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


class EvidenceOut(_M):
    kind: Literal["link", "replication", "placebo", "data"]
    ref: str
    note: str


class ChallengeOut(_M):
    id: str
    aspect: Literal["definition", "baseline", "sample", "data", "timing", "other"]
    argument: str
    evidence: list[EvidenceOut]
    submitted_by: str
    submitted_at: str | None


class ReplicationResultOut(_M):
    n_matched: int
    n_effective: int
    min_events: int
    mean: float | None
    ci_lo: float | None
    ci_hi: float | None
    p_value: float
    verdict: str
    as_of: str
    data_synthetic: bool


class ReplicationOut(_M):
    id: str
    rationale: str
    changes: dict[str, str]
    submitted_by: str
    submitted_at: str | None
    result: ReplicationResultOut | None


class SiteClaim(_M):
    claim: Claim
    yaml: str
    status: Literal["Draft", "Proposed", "Supported", "Not supported", "Inconclusive"]
    backtest: Backtest | None
    backtest_error: str | None
    chart: Chart | None
    forward_log: list[ForwardRow]
    event_ids: list[str]
    challenges: list[ChallengeOut]
    replications: list[ReplicationOut]


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
    # Symbols with daily prices in the cache: a claim on any other symbol can freeze predictions
    # but cannot be graded until a price source for it is added.
    priced_symbols: list[str]


class LabelCandidate(_M):
    """A recent headline for a person to label. The labeler's own answer is deliberately left out,
    so the person labels blind instead of agreeing with it."""

    headline_id: str
    title: str
    source: str
    url: str
    published_at: datetime


class EventTypeInfo(_M):
    name: str
    definition: str


class LabelerAccuracy(_M):
    """The free labeler scored against the people's labels in labels/gold.jsonl."""

    extractor_version: str
    gold_sha256: str
    n_scored: int
    type_accuracy: float | None
    entity_precision: float | None
    entity_recall: float | None
    low_confidence_rate: float | None


class GoldLabel(_M):
    """A label a person already gave (labels/gold.jsonl is public in the repo anyway)."""

    title: str
    source: str
    expected_type: str
    expected_entities: list[str]


class Labeling(_M):
    candidates: list[LabelCandidate]
    event_types: list[EventTypeInfo]
    gold_rows: int
    # The labels already in the repo, so the page can download the complete file to replace it.
    gold: list[GoldLabel]
    accuracy: LabelerAccuracy | None


class TaxonomyEntry(_M):
    """An event type a claim can name, where its events come from, and how many are in the data."""

    name: str
    definition: str
    origin: Literal["headlines", "calendar", "prices", "filings", "control"]
    past_events: int


class NewsSource(_M):
    """Where a story was reported. Spillover links to sources; it never copies articles."""

    title: str | None  # the headline, when the event came from a headline or a filing
    url: str | None
    source: str  # feed name (fed-press, sec-8k, ...) or a plain description for calendars
    published_at: datetime | None


class NewsStory(_M):
    """A recent real-world event, whether or not any claim is about it yet."""

    event_id: str
    event_type: str
    origin: Literal["headlines", "calendar", "prices", "filings", "control"]
    date: date
    entities: list[str]
    scheduled: bool
    sources: list[NewsSource]
    claim_ids: list[str]  # registered claims this event triggers


class LiveHeadline(_M):
    """A current headline from the GDELT Project, labeled by the free rules labeler.

    Shown on the News tab only; never written to the event ledger (see spillover.ingest.gdelt).
    """

    headline_id: str
    title: str
    url: str
    domain: str
    seen_at: datetime
    image: str | None  # the publisher's preview image link (https), loaded live by the browser
    event_type: str  # NONE when it fits no event type
    entities: list[str]
    confidence: Literal["high", "medium", "low"]


class CommunityQuestion(_M):
    """A question someone asked in the repository's Q&A discussions. Display only."""

    number: int
    title: str
    url: str
    author: str | None
    created_at: datetime
    updated_at: datetime
    excerpt: str
    comments: int
    upvotes: int
    answered: bool


class CommunityThread(_M):
    """The discussion thread on a claim or event page, by its term ("claim:<id>")."""

    term: str
    url: str
    comments: int


class SiteIcons(_M):
    """Real icons stored with the site (paths relative to the page): outlets, companies, people.

    Built by spillover.ingest.icons; a name missing here has no icon, and the site never draws a
    stand-in letter for it.
    """

    domains: dict[str, str]  # news outlet domain (without "www.") -> "icons/<file>"
    symbols: dict[str, str]  # ticker -> "icons/<file>", for companies without a bundled mark
    people: dict[str, str]  # GitHub handle -> "icons/<file>"


EMPTY_ICONS = SiteIcons(domains={}, symbols={}, people={})


class Community(_M):
    """Questions and discussion counts from GitHub Discussions, read when the site was built.

    Never part of the record: questions, comments and reactions cannot change a grade.
    """

    ask_category: str | None  # the Q&A category's slug; None when questions are not set up
    questions: list[CommunityQuestion]
    threads: list[CommunityThread]
    fetched_at: datetime | None  # None when this build could not read GitHub


NEWS_DAYS = 120  # stories from this many days before the data's last day
NEWS_MAX = 150
NEWS_SOURCES_MAX = 5


class SiteData(_M):
    schema_version: Literal[1]
    meta: SiteMeta
    claims: list[SiteClaim]
    events: list[SiteEvent]
    scoreboard: Scoreboard
    labeling: Labeling
    taxonomy: list[TaxonomyEntry]
    news: list[NewsStory]
    upcoming: list[NewsStory]  # the next scheduled events (claims already wait for them)
    headlines: list[LiveHeadline]  # latest general news (GDELT), display only
    community: Community  # questions and discussion counts (GitHub Discussions), display only
    icons: SiteIcons  # real icons stored with the site, so nothing shows a placeholder


EMPTY_COMMUNITY = Community(ask_category=None, questions=[], threads=[], fetched_at=None)


def community_from(found: Discussions, fetched_at: datetime) -> Community:
    return Community(
        ask_category=found.ask_category,
        questions=[CommunityQuestion.model_validate(asdict(q)) for q in found.questions],
        threads=[CommunityThread.model_validate(asdict(t)) for t in found.threads],
        fetched_at=fetched_at,
    )


def site_json_schema() -> dict[str, Any]:
    # Serialization mode: fields with defaults are always present in the exported JSON.
    schema = SiteData.model_json_schema(mode="serialization")
    schema["$schema"] = "https://json-schema.org/draft/2020-12/schema"
    schema["title"] = "Spillover site data"
    return schema


# --- building ----------------------------------------------------------------------------------


def build_taxonomy(data: MarketData) -> list[TaxonomyEntry]:
    counts: dict[str, int] = {}
    if data.events.height:
        per = data.events.group_by("event_type").agg(pl.col("event_id").n_unique())
        counts = dict(zip(per["event_type"].to_list(), per["event_id"].to_list(), strict=True))
    return [
        TaxonomyEntry(
            name=t.name,
            definition=t.definition,
            origin=t.origin,
            past_events=int(counts.get(t.name, 0)),
        )
        for t in TAXONOMY
    ]


UPCOMING_MAX = 8


def label_headlines(
    items: list[GdeltHeadline], companies: Path = COMPANIES_FILE
) -> list[LiveHeadline]:
    """Tag each headline with the free labeler's answer, validated like a ledger extraction."""
    rules = RulesExtractor.load(companies) if companies.exists() else None
    out: list[LiveHeadline] = []
    for h in items:
        ex = (
            Extraction.model_validate(rules.label(h.title))
            if rules
            else Extraction(event_type=NONE, entities=[], confidence="low")
        )
        # Off-topic stories (a house listing, a fashion piece) match the query through words deep
        # in the article. Keep a headline only if it is itself about companies or markets.
        if ex.event_type == NONE and not ex.entities and not MARKET_WORDS.search(h.title):
            continue
        out.append(
            LiveHeadline(
                headline_id=h.headline_id,
                title=h.title,
                url=h.url,
                domain=h.domain,
                seen_at=h.seen_at,
                image=h.image,
                event_type=ex.event_type,
                entities=ex.entities,
                confidence=ex.confidence,
            )
        )
    return out


def headline_candidates(items: list[LiveHeadline]) -> list[LabelCandidate]:
    return [
        LabelCandidate(
            headline_id=h.headline_id,
            title=h.title,
            source=f"gdelt-{h.domain}",
            url=h.url,
            published_at=h.seen_at,
        )
        for h in items
    ]


def build_news(
    data: MarketData,
    event_to_claims: dict[str, list[str]],
    store: Path | None,
    today: date | None = None,
) -> tuple[list[NewsStory], list[NewsStory]]:
    """(news, upcoming): what already happened, newest first, and the next scheduled events.

    Scheduled dates are known months ahead (predictions are frozen before them), so anything after
    ``today`` is "coming up", never news.
    """
    today = today or data.as_of
    origin: dict[str, Origin] = {t.name: t.origin for t in TAXONOMY}
    ev = data.events
    if ev.height == 0:
        return [], []
    cutoff = today - timedelta(days=NEWS_DAYS)
    recent = ev.filter(
        (pl.col("date") >= cutoff) & ~pl.col("event_id").str.starts_with(BACKTEST_ONLY_PREFIX)
    )
    by_event: dict[str, list[NewsSource]] = {}
    if store is not None:
        for r in sorted(load_records(store), key=lambda r: (r.published_at, r.headline_id)):
            by_event.setdefault(r.event_id, []).append(
                NewsSource(title=r.title, url=r.url, source=r.source, published_at=r.published_at)
            )
    stories: list[NewsStory] = []
    for event_id in recent["event_id"].unique(maintain_order=True).to_list():
        rows = recent.filter(pl.col("event_id") == event_id)
        first = rows.row(0, named=True)
        kind: Origin = origin.get(first["event_type"], "headlines")
        if kind == "control":
            continue  # placebo days are a test of the engine, not news
        sources = by_event.get(event_id, [])[:NEWS_SOURCES_MAX]
        if not sources:
            src = str(first["source"])
            is_url = src.startswith(("https://", "http://"))
            sources = [
                NewsSource(
                    title=None,
                    url=src if is_url else None,
                    source=src if not is_url else src.split("/")[2],
                    published_at=None,
                )
            ]
        stories.append(
            NewsStory(
                event_id=event_id,
                event_type=first["event_type"],
                origin=kind,
                date=first["date"],
                entities=sorted({e for e in rows["entity"].to_list() if e and e != "NONE"}),
                scheduled=bool(first["scheduled"]),
                sources=sources,
                claim_ids=sorted(set(event_to_claims.get(event_id, []))),
            )
        )
    past = sorted(
        (s for s in stories if s.date <= today), key=lambda s: (s.date, s.event_id), reverse=True
    )
    ahead = sorted(
        (s for s in stories if s.date > today and s.scheduled), key=lambda s: (s.date, s.event_id)
    )
    return past[:NEWS_MAX], ahead[:UPCOMING_MAX]


def _event_types() -> list[EventTypeInfo]:
    return [EventTypeInfo(name=t.name, definition=t.definition) for t in EXTRACTABLE] + [
        EventTypeInfo(name=NONE, definition="None of the above. Use this whenever unsure.")
    ]


def build_labeling(
    store: Path = Path("events"),
    gold_path: Path = GOLD_FILE,
    companies: Path = COMPANIES_FILE,
    n: int = 60,
    extra: list[LabelCandidate] | None = None,
) -> Labeling:
    """Recent unlabeled headlines to label, and the labeler's accuracy once people have labeled."""
    gold_rows: list[GoldRow] = []
    accuracy: LabelerAccuracy | None = None
    if gold_path.exists():
        try:
            gold_rows, sha = load_gold(gold_path)
            if companies.exists():
                rules = RulesExtractor.load(companies)
                with tempfile.TemporaryDirectory() as cache:  # rules are deterministic: no cache
                    report = evaluate_gold(gold_rows, sha, rules, Path(cache), rules.model_id)
                accuracy = LabelerAccuracy(
                    extractor_version=report.extractor_version,
                    gold_sha256=report.gold_sha256,
                    n_scored=report.n_scored,
                    type_accuracy=report.type_accuracy,
                    entity_precision=report.entity_precision,
                    entity_recall=report.entity_recall,
                    low_confidence_rate=report.low_confidence_rate,
                )
        except (GoldError, ExtractionError):
            gold_rows, accuracy = [], None
    done = {(g.source, g.title) for g in gold_rows}
    seen: set[tuple[str, str]] = set()
    candidates: list[LabelCandidate] = []
    records = sorted(
        load_records(store), key=lambda r: (r.published_at, r.headline_id), reverse=True
    )
    for r in records:
        key = (r.source, r.title)
        # Filing events take their type from the filing's item number: there is nothing to label.
        if r.source == FILINGS_SOURCE or key in done or key in seen:
            continue
        seen.add(key)
        candidates.append(
            LabelCandidate(
                headline_id=r.headline_id,
                title=r.title,
                source=r.source,
                url=r.url,
                published_at=r.published_at,
            )
        )
        if len(candidates) == n:
            break
    # Then current general news, so the labeler's accuracy is measured on it before it is trusted.
    for c in extra or []:
        key = (c.source, c.title)
        if len(candidates) >= n or key in done or key in seen:
            continue
        seen.add(key)
        candidates.append(c)
    return Labeling(
        candidates=candidates,
        event_types=_event_types(),
        gold_rows=len(gold_rows),
        gold=[
            GoldLabel(
                title=g.title,
                source=g.source,
                expected_type=g.expected_type,
                expected_entities=list(g.expected_entities),
            )
            for g in gold_rows
        ],
        accuracy=accuracy,
    )


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


def _own_calendar(data: MarketData, pred: Prediction) -> MarketData:
    """The prediction's own trading calendar, or the shared one if its prices are not cached."""
    try:
        return data.restrict(prediction_symbols(pred))
    except DataError:
        return data


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
        elif window_closed(_own_calendar(data, pred), pred.event_date, pred.window.end_offset):
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


def _stamp(value: object) -> str | None:
    return value.isoformat() if isinstance(value, datetime) else None


def _challenges(directory: Path | None) -> dict[str, list[ChallengeOut]]:
    out: dict[str, list[ChallengeOut]] = {}
    for path in lane_files(directory) if directory and directory.exists() else []:
        c = load_challenge(path)
        out.setdefault(c.claim, []).append(
            ChallengeOut(
                id=c.id,
                aspect=c.aspect,
                argument=c.argument.strip(),
                evidence=[EvidenceOut(kind=e.kind, ref=e.ref, note=e.note) for e in c.evidence],
                submitted_by=c.submitted_by,
                submitted_at=_stamp(c.submitted_at),
            )
        )
    return out


def _replications(directory: Path | None, results: Path | None) -> dict[str, list[ReplicationOut]]:
    out: dict[str, list[ReplicationOut]] = {}
    for path in lane_files(directory) if directory and directory.exists() else []:
        r = load_replication(path)
        file = result_path(results, r.id) if results else None
        result = None
        if file is not None and file.exists():
            x = load_result(file)  # verifies the hash: a hand-edited result fails the export
            result = ReplicationResultOut(
                n_matched=x.n_matched,
                n_effective=x.n_effective,
                min_events=x.min_events,
                mean=x.mean,
                ci_lo=x.ci_lo,
                ci_hi=x.ci_hi,
                p_value=x.p_value,
                verdict=x.verdict,
                as_of=x.as_of,
                data_synthetic=x.data_synthetic,
            )
        out.setdefault(r.claim, []).append(
            ReplicationOut(
                id=r.id,
                rationale=r.rationale.strip(),
                changes=describe_changes(r.changes),
                submitted_by=r.submitted_by,
                submitted_at=_stamp(r.submitted_at),
                result=result,
            )
        )
    return out


def build_site_data(
    claims: list[tuple[Claim, str]],
    data: MarketData,
    predictions_root: Path,
    outcomes_root: Path,
    n_boot: int = DEFAULT_BOOT,
    seed: int = DEFAULT_SEED,
    challenges_dir: Path | None = None,
    replications_dir: Path | None = None,
    results_dir: Path | None = None,
    labeling: Labeling | None = None,
    store: Path | None = None,
    today: date | None = None,
    headlines: list[LiveHeadline] | None = None,
    community: Community | None = None,
) -> SiteData:
    """``claims`` pairs each claim with its raw YAML text (shown on the claim page)."""
    board = Scoreboard.model_validate(
        build_scoreboard([c for c, _ in claims], outcomes_root, n_boot=n_boot, seed=seed)
    )
    status_of = {row.claim_id: row.status for row in board.claims}

    challenges_by_claim = _challenges(challenges_dir)
    replications_by_claim = _replications(replications_dir, results_dir)
    site_claims: list[SiteClaim] = []
    stat_values: dict[tuple[str, str], float] = {}
    event_to_claims: dict[str, list[str]] = {}

    replaced = superseded_ids([c for c, _ in claims])
    latest = {c.id.rsplit("_v", 1)[0]: c.id for c, _ in sorted(claims, key=lambda p: p[0].version)}

    for claim, text in sorted(claims, key=lambda p: p[0].id):
        backtest: Backtest | None = None
        chart: Chart | None = None
        error: str | None = None
        missing = [s for s in claim.symbols if s not in data.returns]
        try:
            if missing:
                # Said plainly, without server paths: this text is published on the website.
                raise DataError(f"No price data for {', '.join(missing)} in this dataset.")
            report = run_backtest(claim, data, n_boot=n_boot, seed=seed)
            backtest = _backtest(report)
            path = mean_window_path(claim, data, report.events)
            chart = _chart(path) if path else None
            for e in report.events:
                stat_values[(claim.id, e.event_id)] = e.value
        except DataError as exc:
            error = str(exc).replace(str(data.root), "the data")
        if claim.id in replaced:
            newer = latest[claim.id.rsplit("_v", 1)[0]]
            error = f"Superseded by {newer}; it keeps its record but collects no new evidence. " + (
                error or ""
            )

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
                challenges=challenges_by_claim.get(claim.id, []),
                replications=replications_by_claim.get(claim.id, []),
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

    news, upcoming = build_news(data, event_to_claims, store, today)
    return SiteData(
        schema_version=1,
        meta=SiteMeta(
            repo=REPO,
            engine_version=engine_version(),
            rules_version=RULES_VERSION,
            data_synthetic=data.synthetic,
            data_as_of=data.as_of,
            priced_symbols=sorted(data.returns),
        ),
        claims=site_claims,
        events=sorted(events, key=lambda e: (e.date, e.event_id)),
        scoreboard=board,
        labeling=labeling
        or Labeling(candidates=[], event_types=_event_types(), gold_rows=0, gold=[], accuracy=None),
        taxonomy=build_taxonomy(data),
        news=news,
        upcoming=upcoming,
        headlines=headlines or [],
        community=community or EMPTY_COMMUNITY,
        icons=EMPTY_ICONS,
    )


# --- icons ----------------------------------------------------------------------------------------


def site_symbols(site: SiteData) -> set[str]:
    """Every ticker or entity the site may draw a logo for."""
    out: set[str] = set()
    for c in site.claims:
        out.add(c.claim.instrument.symbol)
        out.update(c.claim.trigger_entities)
    for e in site.events:
        out.update(e.entities)
    for s in [*site.news, *site.upcoming]:
        out.update(s.entities)
    for h in site.headlines:
        out.update(h.entities)
    out.discard("NONE")
    return out


def site_people(site: SiteData) -> set[str]:
    out = {c.claim.registered_by for c in site.claims}
    for c in site.claims:
        out.update(ch.submitted_by for ch in c.challenges)
        out.update(r.submitted_by for r in c.replications)
    out.update(q.author for q in site.community.questions if q.author)
    return out


def outlet(domain: str) -> str:
    return domain.lower().removeprefix("www.")


def with_icons(
    site: SiteData, domains: dict[str, str], symbols: dict[str, str], people: dict[str, str]
) -> SiteData:
    """Attach the icons, and leave out headlines whose outlet has no icon (no stand-in letters)."""
    icons = SiteIcons(
        domains={d: f"icons/{f}" for d, f in domains.items()},
        symbols={s: f"icons/{f}" for s, f in symbols.items()},
        people={h: f"icons/{f}" for h, f in people.items()},
    )
    kept = [h for h in site.headlines if outlet(h.domain) in icons.domains]
    return site.model_copy(update={"icons": icons, "headlines": kept})
