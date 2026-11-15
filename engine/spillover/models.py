"""Claim model: the single source of truth for what a valid Spillover claim is.

The JSON Schema in ``schemas/claim.schema.json`` is generated from these models
(``spillover schema``), so editors, CI and the web form all validate against the same rules.
"""

from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path
from typing import Annotated, Any, Literal, Self

import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

# Minimum value allowed for ``success.min_forward_events``.
# The public scoring rules say a floor exists but do not state the number yet; 8 matches the
# template default. Changing it is a rules change (7-day public comment window).
MIN_FORWARD_EVENTS_FLOOR = 8

_END_RE = re.compile(r"^\+([1-9][0-9]*)_trading_days?$")
_PLACEHOLDER = "REPLACE_ME"


class ClaimError(ValueError):
    """Raised when a claim file cannot be read or fails validation."""


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class Instrument(_Strict):
    """A thing with a price, always labeled with where it trades."""

    venue: Annotated[str, Field(pattern=r"^[a-z][a-z0-9_]*$", description="Where it trades.")]
    symbol: Annotated[str, Field(min_length=1, max_length=32, pattern=r"^[A-Za-z0-9._-]+$")]


class Window(_Strict):
    """Event window, in trading days, relative to the headline's first verifiable time."""

    start: Literal["first_report"]
    end: Annotated[str, Field(pattern=r"^\+[1-9][0-9]*_trading_days?$")]

    @property
    def end_offset(self) -> int:
        match = _END_RE.match(self.end)
        if match is None:  # pragma: no cover - guarded by the field pattern
            raise ValueError(f"bad window end: {self.end!r}")
        return int(match.group(1))

    @property
    def n_days(self) -> int:
        """Number of trading days in the window (day 0 through the end offset)."""
        return self.end_offset + 1


class Success(_Strict):
    # Only the interval-based rule exists in v0.1 of the scoring rules.
    spillover_ci_excludes_zero: Literal[True]
    min_forward_events: Annotated[int, Field(ge=MIN_FORWARD_EVENTS_FLOOR)]


class Claim(_Strict):
    id: Annotated[str, Field(pattern=r"^clm_[a-z0-9]+(?:_[a-z0-9]+)*_v[0-9]+$")]
    statement: Annotated[str, Field(min_length=10)]
    event_type: Annotated[str, Field(pattern=r"^[A-Z][A-Z0-9_]*$")]
    trigger_entities: Annotated[list[str], Field(min_length=1)]
    instrument: Instrument
    window: Window
    expected_sign: Literal["positive", "negative"]
    decompose: list[Literal["mechanical_weight", "spillover"]] = Field(default_factory=list)
    # "factor_only" is the default naive baseline; "constant_mean" has no factor and is meant for
    # index-level claims where the instrument *is* the market.
    baseline: Literal["factor_only", "constant_mean"] = "factor_only"
    # Name of the factor series the baseline controls for.
    factor: Annotated[str, Field(min_length=1)] = "MKT"
    # "abnormal_return" tests the mean cumulative abnormal return over the window.
    # "abs_excess_return" tests whether |CAR| exceeds its typical size in the estimation window
    # (used for volatility claims such as FOMC days).
    measure: Literal["abnormal_return", "abs_excess_return"] = "abnormal_return"
    success: Success
    falsifier: Annotated[str, Field(min_length=10)]
    registered_by: Annotated[str, Field(min_length=1)]
    registered_at: Literal["set_by_ci_on_merge"] | datetime

    @field_validator("falsifier", "statement", "event_type", "registered_by")
    @classmethod
    def _no_placeholder(cls, value: str) -> str:
        if _PLACEHOLDER in value or value == "YOUR_GITHUB_HANDLE":
            raise ValueError("replace the template placeholder with real content")
        return value

    @field_validator("trigger_entities")
    @classmethod
    def _entities_filled(cls, value: list[str]) -> list[str]:
        if any(not v.strip() or v == "TICKER_OR_ENTITY_ID" for v in value):
            raise ValueError("trigger_entities contains an empty or placeholder entry")
        return value

    @model_validator(mode="after")
    def _consistent(self) -> Self:
        if "mechanical_weight" in self.decompose and "spillover" not in self.decompose:
            raise ValueError("decompose: 'mechanical_weight' needs 'spillover' alongside it")
        if self.baseline == "constant_mean" and self.decompose:
            raise ValueError("decompose requires a factor baseline (baseline: factor_only)")
        return self

    @property
    def version(self) -> int:
        return int(self.id.rsplit("_v", 1)[1])


def claim_json_schema() -> dict[str, Any]:
    schema = Claim.model_json_schema()
    schema["$schema"] = "https://json-schema.org/draft/2020-12/schema"
    schema["title"] = "Spillover claim"
    return schema


def load_claim(path: Path) -> Claim:
    """Parse and validate one claim file. Raises ``ClaimError`` with a readable message."""
    try:
        raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as exc:
        raise ClaimError(f"{path}: cannot read claim: {exc}") from exc
    if not isinstance(raw, dict):
        raise ClaimError(f"{path}: a claim file must be a YAML mapping")
    try:
        return Claim.model_validate(raw)
    except ValidationError as exc:
        lines = [f"{path}: invalid claim"]
        for err in exc.errors():
            where = ".".join(str(p) for p in err["loc"]) or "<root>"
            lines.append(f"  - {where}: {err['msg']}")
        raise ClaimError("\n".join(lines)) from exc


def claim_files(directory: Path) -> list[Path]:
    """Claim files in a directory. Files starting with ``_`` (the template) are skipped."""
    return sorted(p for p in directory.glob("*.yaml") if not p.name.startswith("_"))
