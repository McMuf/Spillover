from pathlib import Path
from typing import Any

import pytest
import yaml

from spillover.models import Claim, ClaimError, claim_files, load_claim

from .conftest import CLAIMS

VALID: dict[str, Any] = {
    "id": "clm_demo_v1",
    "statement": "After a headline, the instrument falls by more than the market explains.",
    "event_type": "DEMO_EVENT",
    "trigger_entities": ["ABC"],
    "instrument": {"venue": "us_equity", "symbol": "ABC"},
    "window": {"start": "first_report", "end": "+1_trading_day"},
    "expected_sign": "negative",
    "success": {"spillover_ci_excludes_zero": True, "min_forward_events": 8},
    "falsifier": "The interval includes zero after eight forward events.",
    "registered_by": "someone",
    "registered_at": "set_by_ci_on_merge",
}


def write(tmp_path: Path, **overrides: Any) -> Path:
    data = {**VALID, **overrides}
    path = tmp_path / f"{data['id']}.yaml"
    path.write_text(yaml.safe_dump(data), encoding="utf-8")
    return path


def test_valid_claim_loads(tmp_path: Path) -> None:
    claim = load_claim(write(tmp_path))
    assert isinstance(claim, Claim)
    assert claim.version == 1
    assert claim.window.end_offset == 1
    assert claim.window.n_days == 2
    assert claim.baseline == "factor_only"


def test_seed_claims_are_valid() -> None:
    files = claim_files(CLAIMS)
    assert len(files) >= 2
    for path in files:
        claim = load_claim(path)
        assert path.stem == claim.id


def test_template_is_rejected_until_edited() -> None:
    with pytest.raises(ClaimError) as err:
        load_claim(CLAIMS / "_template.yaml")
    message = str(err.value)
    assert "falsifier" in message
    assert "event_type" in message


def test_template_is_skipped_by_claim_files() -> None:
    assert all(not p.name.startswith("_") for p in claim_files(CLAIMS))


@pytest.mark.parametrize(
    ("overrides", "needle"),
    [
        ({"instrument": {"symbol": "ABC"}}, "instrument.venue"),
        ({"window": {"start": "first_report", "end": "+0_trading_day"}}, "window.end"),
        ({"window": {"start": "first_report", "end": "tomorrow"}}, "window.end"),
        ({"id": "Clm_Bad"}, "id"),
        ({"id": "clm_no_version"}, "id"),
        ({"expected_sign": "up"}, "expected_sign"),
        ({"surprise_field": 1}, "surprise_field"),
        ({"falsifier": "REPLACE_ME"}, "falsifier"),
        ({"success": {"spillover_ci_excludes_zero": True, "min_forward_events": 3}}, "min_forward"),
        ({"success": {"spillover_ci_excludes_zero": False, "min_forward_events": 8}}, "success"),
        ({"decompose": ["mechanical_weight"]}, "decompose"),
        ({"trigger_entities": []}, "trigger_entities"),
    ],
)
def test_invalid_claims_are_rejected(
    tmp_path: Path, overrides: dict[str, Any], needle: str
) -> None:
    with pytest.raises(ClaimError) as err:
        load_claim(write(tmp_path, **overrides))
    assert needle in str(err.value)


def test_non_mapping_yaml_is_rejected(tmp_path: Path) -> None:
    path = tmp_path / "x.yaml"
    path.write_text("- just\n- a list\n", encoding="utf-8")
    with pytest.raises(ClaimError):
        load_claim(path)
