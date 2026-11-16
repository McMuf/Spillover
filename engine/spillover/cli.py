"""Command line for the Spillover engine (``spillover --help`` lists every command)."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated

import typer

from spillover.data import DataError, load_market_data
from spillover.eventstore import StoreError
from spillover.eventstudy import (
    DEFAULT_BOOT,
    DEFAULT_SEED,
    fdr_adjust,
    run_backtest,
)
from spillover.extractor import AnthropicLlm, ExtractionError, Llm
from spillover.fixtures_gen import generate
from spillover.frozen import FrozenError, check_frozen
from spillover.gold import (
    CANDIDATES_FILE,
    GOLD_FILE,
    GoldError,
    evaluate_gold,
    load_gold,
    write_candidates,
)
from spillover.ingest.config import ConfigError, load_config
from spillover.ingest.fomc import FomcParseError
from spillover.ingest.headline_run import HeadlineSummary, run_headlines
from spillover.ingest.headlines import FeedError
from spillover.ingest.http import FetchError, http_get, redact
from spillover.ingest.prices import PriceError
from spillover.ingest.store import IngestError, build_cache
from spillover.lanes import (
    apply_changes,
    check_target,
    lane_files,
    load_challenge,
    load_replication,
)
from spillover.ledger import LedgerError, predict, verify_ledger
from spillover.models import Claim, ClaimError, claim_files, claim_json_schema, load_claim
from spillover.placebo import placebo_rejection_rate
from spillover.placebo_events import PLACEBO_DIR, ensure_future_draws
from spillover.pr_bot import BotError, make_request
from spillover.pr_bot import run as run_pr_bot
from spillover.register import register_claims, stamp_challenges, stamp_replications
from spillover.replicate import RESULTS_DIR, run_pending
from spillover.report import format_report
from spillover.scoreboard import build_scoreboard
from spillover.scoring import ScoreError, grade_all, verify_outcomes
from spillover.site_export import build_site_data, site_json_schema
from spillover.stamp import StampError, ots_binary, stamp_new, upgrade_pending

app = typer.Typer(
    add_completion=False,
    no_args_is_help=True,
    help="Spillover: write the claim, freeze the call, let the market grade it.",
)

DEFAULT_CLAIMS = Path("claims")
DEFAULT_DATA = Path("fixtures/synthetic")
DEFAULT_SCHEMA = Path("schemas/claim.schema.json")
DEFAULT_SITE_SCHEMA = Path("schemas/site.schema.json")
DEFAULT_SITE_OUT = Path("web/public/data")
DEFAULT_PREDICTIONS = Path("predictions")
DEFAULT_OUTCOMES = Path("outcomes")
DEFAULT_SCOREBOARD = Path("scoreboard/scoreboard.json")

PredictionsOpt = Annotated[
    Path, typer.Option("--predictions", help="Directory holding the prediction ledger.")
]
OutcomesOpt = Annotated[
    Path, typer.Option("--outcomes", help="Directory holding graded outcome records.")
]
NowOpt = Annotated[
    str | None, typer.Option("--now", help="Override the current time (ISO 8601, for tests).")
]


def _now(value: str | None) -> datetime:
    if value is None:
        return datetime.now(UTC)
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise typer.BadParameter("--now needs a timezone, e.g. 2026-01-02T12:00:00Z")
    return parsed


DataOpt = Annotated[
    Path,
    typer.Option(
        "--data",
        envvar="SPILLOVER_DATA",
        help="Directory with prices.parquet and events.parquet (env: SPILLOVER_DATA).",
    ),
]


def _fail(message: str) -> typer.Exit:
    typer.echo(message, err=True)
    line = github_error_line(message)
    if line:
        typer.echo(line)
    return typer.Exit(code=1)


def github_error_line(message: str) -> str | None:
    """On GitHub Actions, the failure as an error annotation for the run's summary page.

    Run logs need a login to read; annotations are visible to anyone who can see the run, so the
    reason a scheduled job failed is one click away. The text is redacted like everything else.
    Returns None outside GitHub Actions.
    """
    import os

    if os.environ.get("GITHUB_ACTIONS") != "true":
        return None
    text = redact(message).replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
    return f"::error title=spillover::{text}"


def _inspect(path: Path, claims: dict[str, Claim]) -> tuple[str, str | None]:
    """(id, problem) for one claim, challenge or replication; raises ClaimError if unreadable."""
    kind = path.parent.name
    if kind == "challenges":
        challenge = load_challenge(path)
        return challenge.id, check_target(claims.get(challenge.claim), challenge.claim)
    if kind == "replications":
        rep = load_replication(path)
        problem = check_target(claims.get(rep.claim), rep.claim)
        if problem is None:
            apply_changes(claims[rep.claim], rep.changes)  # the changed claim must be valid too
        return rep.id, problem
    return load_claim(path).id, None


@app.command()
def validate(
    paths: Annotated[
        list[Path] | None,
        typer.Argument(help="Claim, challenge or replication files (default: all of them)."),
    ] = None,
    claims_dir: Annotated[
        Path, typer.Option(help="Where target claims are looked up.")
    ] = DEFAULT_CLAIMS,
) -> None:
    """Validate claims, challenges and replications (a file's kind follows its folder)."""
    files = paths or [
        *claim_files(DEFAULT_CLAIMS),
        *lane_files(Path("challenges")),
        *lane_files(Path("replications")),
    ]
    claims = {c.id: c for c in (load_claim(p) for p in claim_files(claims_dir))}
    failures = 0
    for path in files:
        try:
            ident, problem = _inspect(path, claims)
        except ClaimError as exc:  # LaneError is a ClaimError
            failures += 1
            typer.echo(str(exc), err=True)
            continue
        if path.stem != ident:
            failures += 1
            typer.echo(f"{path}: file name must match the id ({ident}.yaml)", err=True)
        elif problem is not None:
            failures += 1
            typer.echo(f"{path}: {problem}", err=True)
        else:
            typer.echo(f"ok  {ident}")
    if failures:
        raise _fail(f"{failures} file(s) failed validation")
    typer.echo(f"{len(files)} file(s) valid")


@app.command()
def schema(
    out: Annotated[
        Path, typer.Option(help="Where to write the claim JSON Schema.")
    ] = DEFAULT_SCHEMA,
    site_out: Annotated[
        Path, typer.Option(help="Where to write the site-data JSON Schema.")
    ] = DEFAULT_SITE_SCHEMA,
    check: Annotated[bool, typer.Option(help="Fail if a file on disk is out of date.")] = False,
) -> None:
    """Generate (or check) the JSON Schemas for claims and for the website's data."""
    targets = {
        out: json.dumps(claim_json_schema(), indent=2, sort_keys=True) + "\n",
        site_out: json.dumps(site_json_schema(), indent=2, sort_keys=True) + "\n",
    }
    for path, text in targets.items():
        if check:
            if not path.exists() or path.read_text(encoding="utf-8") != text:
                raise _fail(f"{path} is out of date; run `uv run spillover schema` and commit it")
            typer.echo(f"{path} is up to date")
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text, encoding="utf-8")
            typer.echo(f"wrote {path}")


@app.command("export-site")
def export_site(
    claims_dir: Annotated[Path, typer.Option(help="Directory of claim files.")] = DEFAULT_CLAIMS,
    data: DataOpt = DEFAULT_DATA,
    predictions: PredictionsOpt = DEFAULT_PREDICTIONS,
    outcomes: OutcomesOpt = DEFAULT_OUTCOMES,
    out: Annotated[Path, typer.Option(help="Output directory for site.json.")] = DEFAULT_SITE_OUT,
    n_boot: Annotated[int, typer.Option("--boot", help="Bootstrap resamples.")] = DEFAULT_BOOT,
) -> None:
    """Write the single typed JSON file the static website reads (generated, never committed)."""
    try:
        claims = [(load_claim(p), p.read_text(encoding="utf-8")) for p in claim_files(claims_dir)]
        site = build_site_data(
            claims,
            load_market_data(data),
            predictions,
            outcomes,
            n_boot=n_boot,
            challenges_dir=Path("challenges"),
            replications_dir=Path("replications"),
            results_dir=RESULTS_DIR,
        )
    except (ClaimError, DataError, ScoreError, LedgerError) as exc:
        raise _fail(str(exc)) from exc
    out.mkdir(parents=True, exist_ok=True)
    (out / "site.json").write_text(site.model_dump_json(indent=2) + "\n", encoding="utf-8")
    typer.echo(
        f"wrote {out / 'site.json'}: {len(site.claims)} claim(s), {len(site.events)} event(s)"
        + (" (SYNTHETIC data)" if site.meta.data_synthetic else "")
    )


@app.command("gen-fixtures")
def gen_fixtures(
    out: Annotated[Path, typer.Option(help="Output directory.")] = DEFAULT_DATA,
) -> None:
    """Regenerate the deterministic SYNTHETIC fixtures."""
    generate(out)
    typer.echo(f"wrote synthetic fixtures to {out}")


@app.command("test-claim")
def test_claim(
    claim_path: Annotated[Path, typer.Argument(help="Path to a claim YAML file.")],
    data: DataOpt = DEFAULT_DATA,
    boot: Annotated[int, typer.Option(help="Bootstrap resamples.")] = DEFAULT_BOOT,
    seed: Annotated[int, typer.Option(help="Bootstrap seed.")] = DEFAULT_SEED,
    json_out: Annotated[bool, typer.Option("--json", help="Print the report as JSON.")] = False,
) -> None:
    """Feasibility and event-study report for one claim."""
    try:
        claim = load_claim(claim_path)
        report = run_backtest(claim, load_market_data(data), n_boot=boot, seed=seed)
    except (ClaimError, DataError) as exc:
        raise _fail(str(exc)) from exc
    typer.echo(json.dumps(report.to_dict(), indent=2) if json_out else format_report(report))


@app.command("test-all")
def test_all(
    claims_dir: Annotated[Path, typer.Option(help="Directory of claim files.")] = DEFAULT_CLAIMS,
    data: DataOpt = DEFAULT_DATA,
    boot: Annotated[int, typer.Option(help="Bootstrap resamples.")] = DEFAULT_BOOT,
    seed: Annotated[int, typer.Option(help="Bootstrap seed.")] = DEFAULT_SEED,
) -> None:
    """Run every claim and adjust p-values across the set (Benjamini-Hochberg FDR)."""
    try:
        market = load_market_data(data)
        reports = [
            run_backtest(load_claim(p), market, n_boot=boot, seed=seed)
            for p in claim_files(claims_dir)
        ]
    except (ClaimError, DataError) as exc:
        raise _fail(str(exc)) from exc
    if not reports:
        raise _fail(f"no claims found in {claims_dir}")
    adjusted = fdr_adjust([r.p_value for r in reports])
    tag = "SYNTHETIC fixtures" if market.synthetic else str(data)
    typer.echo(
        f"Backtests on {tag} (not forward evidence). "
        f"p-values adjusted across {len(reports)} claims.\n"
    )
    typer.echo(f"{'claim':<34}{'n':>4}{'mean':>10}{'p':>9}{'p (FDR)':>10}  result")
    for r, q in zip(reports, adjusted, strict=True):
        short = r.verdict.split(":")[0].split(" (")[0]
        typer.echo(
            f"{r.claim_id:<34}{r.n_effective:>4}{r.mean * 100:>9.2f}%"
            f"{r.p_value:>9.4f}{q:>10.4f}  {short}"
        )


@app.command("placebo-check")
def placebo_check(
    data: DataOpt = DEFAULT_DATA,
    symbol: Annotated[str, typer.Option(help="Instrument to test.")] = "XLK",
    trials: Annotated[int, typer.Option(help="Random-date trials.")] = 150,
    alpha: Annotated[float, typer.Option(help="Significance level.")] = 0.05,
    limit: Annotated[float, typer.Option(help="Fail above this rejection rate.")] = 0.12,
) -> None:
    """Run the engine on random dates. A rate far above alpha means the engine is broken."""
    try:
        rate = placebo_rejection_rate(load_market_data(data), symbol, n_trials=trials, alpha=alpha)
    except DataError as exc:
        raise _fail(str(exc)) from exc
    typer.echo(
        f"placebo rejection rate on {symbol}: {rate:.1%} (nominal {alpha:.0%}, limit {limit:.0%})"
    )
    if rate > limit:
        raise _fail("PLACEBO FAILED: the engine finds effects on random dates; treat it as broken")


@app.command()
def register(
    claims_dir: Annotated[Path, typer.Option(help="Directory of claim files.")] = DEFAULT_CLAIMS,
    challenges_dir: Annotated[Path, typer.Option(help="Directory of challenges.")] = Path(
        "challenges"
    ),
    replications_dir: Annotated[Path, typer.Option(help="Directory of replications.")] = Path(
        "replications"
    ),
    only: Annotated[
        list[Path] | None,
        typer.Option(
            "--only",
            help="Stamp only these files (repeatable). CI passes exactly what a push added.",
        ),
    ] = None,
    now: NowOpt = None,
) -> None:
    """Stamp draft claims, challenges and replications (run by CI when their PR merges)."""
    when = _now(now)
    try:
        claims = register_claims(claims_dir, when, only)
        challenges = stamp_challenges(challenges_dir, when, only) if challenges_dir.exists() else []
        replications = (
            stamp_replications(replications_dir, when, only) if replications_dir.exists() else []
        )
    except ClaimError as exc:
        raise _fail(str(exc)) from exc
    for path in [*claims, *challenges, *replications]:
        typer.echo(f"registered {path}")
    typer.echo(
        f"{len(claims)} claim(s), {len(challenges)} challenge(s), "
        f"{len(replications)} replication(s) stamped"
    )


@app.command()
def replicate(
    replications_dir: Annotated[Path, typer.Option(help="Replication configs.")] = Path(
        "replications"
    ),
    claims_dir: Annotated[Path, typer.Option(help="Directory of claim files.")] = DEFAULT_CLAIMS,
    results_dir: Annotated[Path, typer.Option(help="Where results are written.")] = RESULTS_DIR,
    data: DataOpt = DEFAULT_DATA,
    n_boot: Annotated[int, typer.Option("--boot", help="Bootstrap resamples.")] = DEFAULT_BOOT,
    allow_synthetic: Annotated[
        bool, typer.Option("--allow-synthetic", help="Run on SYNTHETIC fixtures (tests only).")
    ] = False,
) -> None:
    """Run replications that have no result yet and write their hashed, append-only results."""
    try:
        market = load_market_data(data)
        if market.synthetic and not allow_synthetic:
            raise _fail(
                f"{data} holds SYNTHETIC data; a result written from it would look real. "
                "Pass --allow-synthetic only for tests."
            )
        written, problems = run_pending(replications_dir, claims_dir, results_dir, market, n_boot)
    except (ClaimError, DataError) as exc:
        raise _fail(str(exc)) from exc
    for path in written:
        typer.echo(f"wrote {path}")
    for problem in problems:
        typer.echo(f"problem: {problem}", err=True)
    typer.echo(f"{len(written)} result(s) written, {len(problems)} problem(s)")
    if problems:
        raise typer.Exit(code=1)


@app.command("predict")
def predict_cmd(
    claims_dir: Annotated[Path, typer.Option(help="Directory of claim files.")] = DEFAULT_CLAIMS,
    data: DataOpt = DEFAULT_DATA,
    predictions: PredictionsOpt = DEFAULT_PREDICTIONS,
    now: NowOpt = None,
) -> None:
    """Freeze a prediction for each qualifying forward event whose window is still open."""
    try:
        claims = [load_claim(p) for p in claim_files(claims_dir)]
        summary = predict(claims, load_market_data(data), predictions, _now(now))
    except (ClaimError, DataError, LedgerError) as exc:
        raise _fail(str(exc)) from exc
    for path in summary.written:
        typer.echo(f"froze {path}")
    typer.echo(
        f"{len(summary.written)} prediction(s) written; skipped: "
        f"{len(summary.skipped_draft_claims)} draft claim(s), "
        f"{summary.skipped_before_registration} event(s) before registration, "
        f"{summary.skipped_window_closed} event(s) with a closed window, "
        f"{summary.skipped_existing} already frozen"
    )
    if summary.skipped_superseded_claims:
        typer.echo(
            "  superseded by a newer registered version (no new predictions): "
            + ", ".join(summary.skipped_superseded_claims)
        )


@app.command("verify-ledger")
def verify_ledger_cmd(predictions: PredictionsOpt = DEFAULT_PREDICTIONS) -> None:
    """Re-derive every prediction hash and report timestamp-proof coverage."""
    results = verify_ledger(predictions)
    bad = [r for r in results if r.problems]
    for r in bad:
        for problem in r.problems:
            typer.echo(f"{r.path}: {problem}", err=True)
    proofs = sum(1 for r in results if r.proof == "present")
    typer.echo(f"{len(results)} prediction(s) checked, {proofs} with a timestamp proof")
    if bad:
        raise _fail(f"{len(bad)} prediction(s) failed verification")


@app.command("check-frozen")
def check_frozen_cmd(
    base: Annotated[str, typer.Argument(help="Base ref the PR targets, e.g. origin/main.")],
) -> None:
    """Fail if a PR edits a registered claim or hand-edits generated outputs."""
    try:
        problems = check_frozen(base)
    except FrozenError as exc:
        raise _fail(str(exc)) from exc
    for problem in problems:
        typer.echo(problem, err=True)
    if problems:
        raise _fail(f"{len(problems)} frozen-file violation(s)")
    typer.echo("no frozen-file violations")


@app.command()
def grade(
    data: DataOpt = DEFAULT_DATA,
    predictions: PredictionsOpt = DEFAULT_PREDICTIONS,
    outcomes: OutcomesOpt = DEFAULT_OUTCOMES,
    allow_synthetic: Annotated[
        bool,
        typer.Option("--allow-synthetic", help="Grade against SYNTHETIC fixtures (tests only)."),
    ] = False,
    now: NowOpt = None,
) -> None:
    """Grade predictions whose window has closed into append-only outcome records."""
    try:
        market = load_market_data(data)
        if market.synthetic and not allow_synthetic:
            raise _fail(
                f"{data} holds SYNTHETIC data; outcomes graded on it would look like real scores. "
                "Pass --allow-synthetic only for tests."
            )
        summary = grade_all(predictions, outcomes, market, _now(now))
    except (DataError, ScoreError, LedgerError) as exc:
        raise _fail(str(exc)) from exc
    for path in summary.graded:
        typer.echo(f"graded {path}")
    for problem in summary.refused:
        typer.echo(f"refused: {problem}", err=True)
    for note in summary.ungradable[:10]:
        typer.echo(f"  note: not graded, no data: {redact(note)}")
    if len(summary.ungradable) > 10:
        typer.echo(f"  note: ...and {len(summary.ungradable) - 10} more without data")
    typer.echo(
        f"{len(summary.graded)} graded, {summary.still_open} window(s) still open, "
        f"{summary.already_graded} already graded, {len(summary.refused)} refused"
    )
    if summary.refused:
        raise typer.Exit(code=1)


@app.command()
def ingest(
    config: Annotated[
        Path, typer.Option("--config", help="Sources file (copy data/sources.example.toml).")
    ] = Path("data/sources.toml"),
) -> None:
    """Fetch prices and events from your configured sources into the local cache."""
    import os

    try:
        cfg = load_config(config)
        summary = build_cache(cfg, http_get, os.environ, datetime.now(UTC).date())
    except (ConfigError, IngestError, PriceError, FetchError, FomcParseError) as exc:
        raise _fail(redact(str(exc))) from exc
    typer.echo(
        f"wrote {summary.out}: {summary.n_days} trading days "
        f"({summary.first} to {summary.last}), series {', '.join(summary.symbols)}, "
        f"{summary.n_events} event(s)"
    )
    for symbol, n in summary.dropped_days.items():
        if n:
            typer.echo(
                f"  note: {symbol} had {n} day(s) missing from another series; dropped from all"
            )
    for line in summary.skipped_events:
        typer.echo(f"  note: {line}")
    typer.echo(f"Use it with: --data {summary.out}   (or export SPILLOVER_DATA={summary.out})")


@app.command("pr-comment")
def pr_comment(
    head_sha: Annotated[str, typer.Option(help="Commit sha of the pull request's head.")],
    head_repo: Annotated[str, typer.Option(help="owner/name of the repository the head lives in.")],
    repo: Annotated[
        str, typer.Option(envvar="GITHUB_REPOSITORY", help="owner/name of this repository.")
    ],
    claims_dir: Annotated[
        Path, typer.Option(help="Trusted claims on the base branch.")
    ] = DEFAULT_CLAIMS,
    data: DataOpt = DEFAULT_DATA,
    dry_run: Annotated[bool, typer.Option(help="Print the comment instead of posting it.")] = False,
) -> None:
    """Post the trusted review comment on a pull request (run by comment.yml, from main)."""
    import os

    token = os.environ.get("GITHUB_TOKEN", "")
    if not token:
        raise _fail("GITHUB_TOKEN is not set")
    try:
        market = load_market_data(data)
    except DataError:
        market = None
    try:
        outcome, body = run_pr_bot(
            make_request(token), repo, head_sha, head_repo, claims_dir, market, dry_run
        )
    except BotError as exc:
        raise _fail(str(exc).replace(token, "***")) from exc
    typer.echo(outcome)
    if dry_run and body:
        typer.echo(body)


def _llm_from_env(model: str) -> Llm | None:
    """A Claude client if ANTHROPIC_API_KEY is set, else None (cache-only mode)."""
    import os

    if not os.environ.get("ANTHROPIC_API_KEY", "").strip():
        return None
    try:
        return AnthropicLlm.from_env(model)
    except ImportError:
        raise _fail("the Anthropic SDK is not installed; run `uv sync --group llm`") from None


@app.command("ingest-headlines")
def ingest_headlines(
    config: Annotated[
        Path, typer.Option("--config", help="Sources file (see data/sources.example.toml).")
    ] = Path("data/sources.toml"),
    strict: Annotated[
        bool,
        typer.Option(
            "--strict",
            help="Fail when headlines are waiting for an API key or every model call failed "
            "(for scheduled runs, so a broken setup turns the run red instead of passing).",
        ),
    ] = False,
) -> None:
    """Fetch headline feeds, extract events (cache first) and append them to events/."""
    try:
        cfg = load_config(config)
        if not cfg.headlines:
            raise _fail(f"{config} lists no [[headlines]] feeds")
        summary = run_headlines(cfg, http_get, _llm_from_env(cfg.extractor.model))
    except (ConfigError, StoreError, FeedError, FetchError) as exc:
        raise _fail(redact(str(exc))) from exc
    typer.echo(
        f"feeds ok: {summary.feeds_ok}/{len(cfg.headlines)}; fetched {summary.fetched}, "
        f"already stored {summary.already_stored}, new records written {summary.written} "
        f"({summary.live_calls} model call(s), {summary.from_cache} from cache, "
        f"{summary.no_event} with no event, {summary.needs_review} need review)"
    )
    for line in summary.feed_errors:
        typer.echo(f"  feed problem: {line}", err=True)
    if summary.skipped_items:
        typer.echo(f"  note: {summary.skipped_items} feed item(s) skipped (no usable link or time)")
    if summary.pending_no_client:
        typer.echo(
            f"  note: {summary.pending_no_client} headline(s) wait for ANTHROPIC_API_KEY "
            "(nothing was guessed)"
        )
    if summary.deferred_by_cap:
        typer.echo(f"  note: {summary.deferred_by_cap} more deferred by max_new_per_run")
    for line in summary.extraction_errors[:10]:
        typer.echo(f"  extraction problem: {redact(line)}", err=True)
    if summary.feeds_ok == 0:
        raise _fail("no feed could be read")
    problem = headline_run_problem(summary)
    if strict and problem:
        raise _fail(problem)


def headline_run_problem(summary: HeadlineSummary) -> str | None:
    """Why a headline run did nothing useful, or None. Partial failures (one refusal) are fine."""
    if summary.pending_no_client:
        return (
            f"{summary.pending_no_client} new headline(s) could not be extracted because "
            "ANTHROPIC_API_KEY is not set for this step. Check the repository secret's exact name."
        )
    if summary.extraction_errors and summary.live_calls == 0:
        kinds = sorted(
            {e.rsplit("(", 1)[-1].rstrip(")") for e in summary.extraction_errors if "(" in e}
        )
        hint = ""
        if "AuthenticationError" in kinds or "PermissionDeniedError" in kinds:
            hint = " The API key was rejected: create a new key and update the secret."
        elif "BadRequestError" in kinds:
            hint = (
                " Often this means the Anthropic account has no credit: add billing in the Console."
            )
        elif "RateLimitError" in kinds:
            hint = " Rate limited: lower max_new_per_run or wait for the next run."
        return (
            f"every model call failed ({len(summary.extraction_errors)} headline(s); "
            f"{', '.join(kinds) or 'see above'}).{hint}"
        )
    return None


@app.command("eval-extractor")
def eval_extractor(
    gold: Annotated[Path, typer.Option(help="Hand-labeled gold set (JSONL).")] = GOLD_FILE,
    cache: Annotated[Path, typer.Option(help="Extraction cache.")] = Path("events/extractions"),
    model: Annotated[str, typer.Option(help="Model id.")] = "claude-haiku-5-5",
    out: Annotated[Path | None, typer.Option(help="Write the accuracy report here.")] = None,
) -> None:
    """Score the extractor against the gold set (cache first; live only if a key is set)."""
    try:
        rows, sha = load_gold(gold)
        report = evaluate_gold(rows, sha, _llm_from_env(model), cache, model)
    except (GoldError, ExtractionError) as exc:
        raise _fail(str(exc)) from exc
    text = json.dumps(report.to_dict(), indent=2, sort_keys=True)
    if out is not None:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(text + "\n", encoding="utf-8")
    typer.echo(text)
    if report.n_unscored:
        typer.echo(
            f"{report.n_unscored} row(s) not scored: no cached answer and no API key", err=True
        )


@app.command("gold-template")
def gold_template(
    store: Annotated[Path, typer.Option(help="Event store directory.")] = Path("events"),
    out: Annotated[
        Path, typer.Option(help="Where to write unlabeled candidates.")
    ] = CANDIDATES_FILE,
    n: Annotated[int, typer.Option(help="How many candidates.")] = 50,
) -> None:
    """Write unlabeled candidate headlines for a person to label into labels/gold.jsonl."""
    try:
        count = write_candidates(store, out, n)
    except StoreError as exc:
        raise _fail(str(exc)) from exc
    typer.echo(
        f"wrote {count} unlabeled candidate(s) to {out}. Fill in expected_type (a taxonomy name "
        "or NONE) and expected_entities for each, then save the result as labels/gold.jsonl."
    )


@app.command("placebo-events")
def placebo_events(
    root: Annotated[Path, typer.Option(help="Where the monthly draws are kept.")] = PLACEBO_DIR,
    months: Annotated[int, typer.Option(min=1, max=24, help="Whole future months to cover.")] = 3,
    per_month: Annotated[int, typer.Option(min=1, max=20, help="Random dates per month.")] = 4,
    today: Annotated[
        str | None, typer.Option(help="Override today (YYYY-MM-DD), for tests.")
    ] = None,
) -> None:
    """Pre-register random placebo dates for future months (never rewrites an existing month)."""
    from datetime import date as _date

    when = _date.fromisoformat(today) if today else datetime.now(UTC).date()
    created = ensure_future_draws(root, when, months, per_month)
    for path in created:
        typer.echo(f"drew {path}")
    typer.echo(f"{len(created)} new month(s) drawn; existing months are never rewritten")


@app.command("verify-outcomes")
def verify_outcomes_cmd(
    outcomes: OutcomesOpt = DEFAULT_OUTCOMES, predictions: PredictionsOpt = DEFAULT_PREDICTIONS
) -> None:
    """Re-derive every outcome hash and check it links to an intact prediction."""
    results = verify_outcomes(outcomes, predictions)
    bad = [r for r in results if r.problems]
    for r in bad:
        for problem in r.problems:
            typer.echo(f"{r.path}: {problem}", err=True)
    typer.echo(f"{len(results)} outcome(s) checked")
    if bad:
        raise _fail(f"{len(bad)} outcome(s) failed verification")


@app.command()
def scoreboard(
    claims_dir: Annotated[Path, typer.Option(help="Directory of claim files.")] = DEFAULT_CLAIMS,
    outcomes: OutcomesOpt = DEFAULT_OUTCOMES,
    out: Annotated[
        Path, typer.Option(help="Where to write the scoreboard JSON.")
    ] = DEFAULT_SCOREBOARD,
    n_boot: Annotated[int, typer.Option("--boot", help="Bootstrap resamples.")] = DEFAULT_BOOT,
) -> None:
    """Build the scoreboard data from claims and outcome records (generated, never hand-edited)."""
    try:
        claims = [load_claim(p) for p in claim_files(claims_dir)]
        board = build_scoreboard(claims, outcomes, n_boot=n_boot)
    except (ClaimError, ScoreError) as exc:
        raise _fail(str(exc)) from exc
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        json.dumps(board, indent=2, sort_keys=True, default=str) + "\n", encoding="utf-8"
    )
    typer.echo(
        f"wrote {out}: {len(board['claims'])} claim(s), {len(board['contributors'])} contributor(s)"
    )


@app.command()
def stamp(predictions: PredictionsOpt = DEFAULT_PREDICTIONS) -> None:
    """Submit new predictions to OpenTimestamps (needs `uv sync --group ots`)."""
    try:
        created = stamp_new(predictions, ots=ots_binary())
    except StampError as exc:
        raise _fail(str(exc)) from exc
    for proof in created:
        typer.echo(f"stamped {proof}")
    typer.echo(f"{len(created)} new proof(s) (pending until Bitcoin confirms)")


@app.command()
def upgrade(predictions: PredictionsOpt = DEFAULT_PREDICTIONS) -> None:
    """Complete pending OpenTimestamps proofs once Bitcoin has confirmed them."""
    try:
        summary = upgrade_pending(predictions, ots=ots_binary())
    except StampError as exc:
        raise _fail(str(exc)) from exc
    typer.echo(f"{len(summary.confirmed)} confirmed, {len(summary.pending)} still pending")


if __name__ == "__main__":  # pragma: no cover
    app()
