import json
from pathlib import Path

import polars as pl
from polars.testing import assert_frame_equal
from typer.testing import CliRunner

from spillover.cli import app
from spillover.fixtures_gen import generate

from .conftest import CLAIMS, FIXTURES, ROOT

runner = CliRunner()


def test_committed_fixtures_match_the_generator(tmp_path: Path) -> None:
    generate(tmp_path)
    for name in ("prices.parquet", "events.parquet"):
        assert_frame_equal(pl.read_parquet(tmp_path / name), pl.read_parquet(FIXTURES / name))
    assert json.loads((FIXTURES / "MANIFEST.json").read_text())["synthetic"] is True


def test_fixtures_store_returns_only() -> None:
    assert pl.read_parquet(FIXTURES / "prices.parquet").columns == ["date", "symbol", "ret"]


def test_cli_validate_passes_on_seed_claims() -> None:
    result = runner.invoke(app, ["validate", *map(str, sorted(CLAIMS.glob("clm_*.yaml")))])
    assert result.exit_code == 0, result.output
    assert "claim file(s) valid" in result.output


def test_cli_validate_fails_on_the_template() -> None:
    result = runner.invoke(app, ["validate", str(CLAIMS / "_template.yaml")])
    assert result.exit_code == 1


def test_cli_validate_requires_filename_to_match_id(tmp_path: Path) -> None:
    src = (CLAIMS / "clm_fomc_abs_move_spx_v1.yaml").read_text()
    wrong = tmp_path / "other_name.yaml"
    wrong.write_text(src)
    result = runner.invoke(app, ["validate", str(wrong)])
    assert result.exit_code == 1
    assert "file name must match" in result.output


def test_cli_test_claim_prints_a_labeled_report() -> None:
    result = runner.invoke(
        app,
        [
            "test-claim",
            str(CLAIMS / "clm_fomc_abs_move_spx_v1.yaml"),
            "--data",
            str(FIXTURES),
            "--boot",
            "500",
        ],
    )
    assert result.exit_code == 0, result.output
    out = result.output
    assert "backtest only, not forward evidence" in out
    assert "SYNTHETIC" in out
    assert "95% interval" in out
    assert "as of " in out
    assert "not investment advice" in out.lower()


def test_cli_test_claim_json() -> None:
    result = runner.invoke(
        app,
        [
            "test-claim",
            str(CLAIMS / "clm_placebo_random_dates_v1.yaml"),
            "--data",
            str(FIXTURES),
            "--boot",
            "300",
            "--json",
        ],
    )
    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["claim_id"] == "clm_placebo_random_dates_v1"
    assert payload["data_synthetic"] is True


def test_cli_test_claim_reports_missing_data_cleanly(tmp_path: Path) -> None:
    result = runner.invoke(
        app, ["test-claim", str(CLAIMS / "clm_fomc_abs_move_spx_v1.yaml"), "--data", str(tmp_path)]
    )
    assert result.exit_code == 1
    assert "missing data file" in result.output


def test_cli_test_all_adjusts_across_claims() -> None:
    result = runner.invoke(
        app, ["test-all", "--claims-dir", str(CLAIMS), "--data", str(FIXTURES), "--boot", "500"]
    )
    assert result.exit_code == 0, result.output
    assert "p (FDR)" in result.output
    assert "clm_fomc_abs_move_spx_v1" in result.output


def test_schema_on_disk_is_up_to_date() -> None:
    result = runner.invoke(
        app, ["schema", "--check", "--out", str(ROOT / "schemas" / "claim.schema.json")]
    )
    assert result.exit_code == 0, result.output


def test_schema_describes_the_required_fields() -> None:
    schema = json.loads((ROOT / "schemas" / "claim.schema.json").read_text())
    for field in ("id", "statement", "instrument", "window", "expected_sign", "falsifier"):
        assert field in schema["required"]
    assert schema["additionalProperties"] is False
