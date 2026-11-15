"""Command line: ``spillover validate | schema | test-claim | test-all | placebo-check``."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Annotated

import typer

from spillover.data import DataError, load_market_data
from spillover.eventstudy import (
    DEFAULT_BOOT,
    DEFAULT_SEED,
    fdr_adjust,
    run_backtest,
)
from spillover.fixtures_gen import generate
from spillover.models import ClaimError, claim_files, claim_json_schema, load_claim
from spillover.placebo import placebo_rejection_rate
from spillover.report import format_report

app = typer.Typer(
    add_completion=False,
    no_args_is_help=True,
    help="Spillover: write the claim, freeze the call, let the market grade it.",
)

DEFAULT_CLAIMS = Path("claims")
DEFAULT_DATA = Path("fixtures/synthetic")
DEFAULT_SCHEMA = Path("schemas/claim.schema.json")

DataOpt = Annotated[
    Path, typer.Option("--data", help="Directory with prices.parquet and events.parquet.")
]


def _fail(message: str) -> typer.Exit:
    typer.echo(message, err=True)
    return typer.Exit(code=1)


@app.command()
def validate(
    paths: Annotated[
        list[Path] | None, typer.Argument(help="Claim files (default: claims/).")
    ] = None,
) -> None:
    """Validate claim files against the claim model."""
    files = paths or claim_files(DEFAULT_CLAIMS)
    failures = 0
    for path in files:
        try:
            claim = load_claim(path)
        except ClaimError as exc:
            failures += 1
            typer.echo(str(exc), err=True)
        else:
            if path.stem != claim.id:
                failures += 1
                typer.echo(f"{path}: file name must match the claim id ({claim.id}.yaml)", err=True)
            else:
                typer.echo(f"ok  {claim.id}")
    if failures:
        raise _fail(f"{failures} claim file(s) failed validation")
    typer.echo(f"{len(files)} claim file(s) valid")


@app.command()
def schema(
    out: Annotated[Path, typer.Option(help="Where to write the JSON Schema.")] = DEFAULT_SCHEMA,
    check: Annotated[bool, typer.Option(help="Fail if the file on disk is out of date.")] = False,
) -> None:
    """Generate (or check) schemas/claim.schema.json from the Pydantic model."""
    text = json.dumps(claim_json_schema(), indent=2, sort_keys=True) + "\n"
    if check:
        if not out.exists() or out.read_text(encoding="utf-8") != text:
            raise _fail(f"{out} is out of date; run `uv run spillover schema` and commit it")
        typer.echo(f"{out} is up to date")
        return
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text, encoding="utf-8")
    typer.echo(f"wrote {out}")


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


if __name__ == "__main__":  # pragma: no cover
    app()
