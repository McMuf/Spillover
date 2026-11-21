"""Claim model: the single source of truth for what a valid Spillover claim is.

The JSON Schema in ``schemas/claim.schema.json`` is generated from these models
(``spillover schema``), so editors, CI and the web form all validate against the same rules.
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated, Any, Literal, Self

import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

# Minimum value allowed for ``success.min_forward_events``.
# The public scoring rules say a floor exists but do not state the number yet; 8 matches the
# template default. Changing it is a rules change (7-day public comment window).
MIN_FORWARD_EVENTS_FLOOR = 8

_SYMBOL = r"^[A-Za-z0-9._-]+$"  # no "+": several factors are written "BTC+ETH" in the ledger
MAX_FACTORS = 3
_END_RE = re.compile(r"^\+([1-9][0-9]*)_trading_days?$")
_PLACEHOLDER = "REPLACE_ME"


class ClaimError(ValueError):
    """Raised when a claim file cannot be read or fails validation."""


class _Strict(BaseModel):
    # Only affects serialization-mode schemas (the website data): fields with defaults are
    # always written out, so the generated TypeScript types should not call them optional.
    model_config = ConfigDict(
        extra="forbid", frozen=True, json_schema_serialization_defaults_required=True
    )


class Instrument(_Strict):
    """A thing with a price, always labeled with where it trades."""

    venue: Annotated[str, Field(pattern=r"^[a-z][a-z0-9_]*$", description="Where it trades.")]
    symbol: Annotated[str, Field(min_length=1, max_length=32, pattern=_SYMBOL)]
    # An equal-weighted basket. When set, the instrument's daily return is the average of these
    # members' daily returns (rebalanced daily) and ``symbol`` is just the basket's name.
    basket: (
        Annotated[
            list[Annotated[str, Field(min_length=1, max_length=32, pattern=_SYMBOL)]],
            Field(min_length=2, max_length=50),
        ]
        | None
    ) = None

    @field_validator("basket")
    @classmethod
    def _distinct_members(cls, value: list[str] | None) -> list[str] | None:
        if value is not None and len(set(value)) != len(value):
            raise ValueError("basket lists the same symbol twice")
        return value

    @property
    def members(self) -> list[str]:
        """The symbols whose prices this instrument needs."""
        return list(self.basket) if self.basket else [self.symbol]


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


CLAIM_ID = r"^clm_[a-z0-9]+(?:_[a-z0-9]+)*_v[0-9]+$"


class RespondsTo(_Strict):
    """A claim written as an answer to another one, graded on its own like any claim.

    * ``counter``: expects the opposite of the other claim (the other side of the argument).
    * ``refine``: the same idea, narrowed or sharpened (another market, window or kind of event).
    """

    claim: Annotated[str, Field(pattern=CLAIM_ID)]
    stance: Literal["counter", "refine"]


class Claim(_Strict):
    id: Annotated[str, Field(pattern=CLAIM_ID)]
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
    factor: Annotated[str, Field(min_length=1, max_length=32, pattern=_SYMBOL)] = "MKT"
    # Several factors at once (for example [BTC, ETH] for a crypto claim). When set, it replaces
    # ``factor`` and the baseline is alpha + beta_1 * f_1 + ... fitted on the estimation window.
    factors: (
        Annotated[
            list[Annotated[str, Field(min_length=1, max_length=32, pattern=_SYMBOL)]],
            Field(min_length=1, max_length=MAX_FACTORS),
        ]
        | None
    ) = None
    # "abnormal_return" tests the mean cumulative abnormal return over the window.
    # "abs_excess_return" tests whether |CAR| exceeds its typical size in the estimation window
    # (used for volatility claims such as FOMC days); since rules 0.2 it is the rank of |CAR| among
    # same-length ordinary windows, minus one half.
    measure: Literal["abnormal_return", "abs_excess_return"] = "abnormal_return"
    # The claim this one answers, if any: a counter-claim or a refinement (grouped on its page).
    responds_to: RespondsTo | None = None
    # Optional stated probability that the sign is as expected on any one event. Only claims that
    # state a confidence enter the calibration plot.
    confidence: Annotated[float, Field(ge=0.5, le=0.99)] | None = None
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
        if self.factors is not None:
            if self.baseline == "constant_mean":
                raise ValueError("factors needs a factor baseline (baseline: factor_only)")
            if len(set(self.factors)) != len(self.factors):
                raise ValueError("factors lists the same series twice")
            if "factor" in self.model_fields_set and self.factor != "MKT":
                raise ValueError("use either factor or factors, not both")
            if set(self.factors) & set(self.instrument.members):
                raise ValueError("a factor cannot also be the instrument (or one of its basket)")
        elif self.baseline == "factor_only" and self.factor in self.instrument.members:
            raise ValueError("the factor cannot also be the instrument (or one of its basket)")
        if self.responds_to is not None:
            own, other = self.id.rsplit("_v", 1)[0], self.responds_to.claim.rsplit("_v", 1)[0]
            if own == other:
                raise ValueError(
                    "a claim cannot respond to itself; a new version supersedes instead"
                )
        return self

    @property
    def factor_names(self) -> list[str]:
        """The factor series the baseline uses, in order (empty for constant_mean)."""
        if self.baseline != "factor_only":
            return []
        return list(self.factors) if self.factors else [self.factor]

    @property
    def symbols(self) -> list[str]:
        """Every series whose prices this claim needs: the instrument (or basket) and factors."""
        return [*self.instrument.members, *self.factor_names]

    @property
    def factor_label(self) -> str:
        """Factors as one string, "BTC+ETH", as stored in ledger records."""
        return "+".join(self.factor_names) if self.factor_names else self.factor

    @property
    def version(self) -> int:
        return int(self.id.rsplit("_v", 1)[1])

    @property
    def registered_at_utc(self) -> datetime | None:
        """Registration time in UTC, or None while the claim is still a draft."""
        if not isinstance(self.registered_at, datetime):
            return None
        if self.registered_at.tzinfo is None:
            return self.registered_at.replace(tzinfo=UTC)
        return self.registered_at.astimezone(UTC)


def superseded_ids(claims: Iterable[Claim]) -> set[str]:
    """Registered claims replaced by a newer registered version of the same claim.

    ``clm_x_v1`` is superseded once ``clm_x_v2`` (or later) is registered. A superseded claim stays
    on record with everything it already collected, but it collects no new predictions.
    """
    items = list(claims)
    latest: dict[str, int] = {}
    for c in items:
        if c.registered_at_utc is not None:
            stem = c.id.rsplit("_v", 1)[0]
            latest[stem] = max(latest.get(stem, 0), c.version)
    return {
        c.id
        for c in items
        if c.registered_at_utc is not None and c.version < latest[c.id.rsplit("_v", 1)[0]]
    }


def claim_json_schema() -> dict[str, Any]:
    schema = Claim.model_json_schema()
    schema["$schema"] = "https://json-schema.org/draft/2020-12/schema"
    schema["title"] = "Spillover claim"
    return schema


def parse_claim(text: str, label: str) -> Claim:
    """Parse and validate claim YAML from text. ``label`` names the source in error messages."""
    try:
        raw = yaml.safe_load(text)
    except yaml.YAMLError as exc:
        raise ClaimError(f"{label}: cannot read claim: {exc}") from exc
    if not isinstance(raw, dict):
        raise ClaimError(f"{label}: a claim file must be a YAML mapping")
    try:
        return Claim.model_validate(raw)
    except ValidationError as exc:
        lines = [f"{label}: invalid claim"]
        for err in exc.errors():
            where = ".".join(str(p) for p in err["loc"]) or "<root>"
            lines.append(f"  - {where}: {err['msg']}")
        raise ClaimError("\n".join(lines)) from exc


def load_claim(path: Path) -> Claim:
    """Parse and validate one claim file. Raises ``ClaimError`` with a readable message."""
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise ClaimError(f"{path}: cannot read claim: {exc}") from exc
    return parse_claim(text, str(path))


def claim_files(directory: Path) -> list[Path]:
    """Claim files in a directory. Files starting with ``_`` (the template) are skipped."""
    return sorted(p for p in directory.glob("*.yaml") if not p.name.startswith("_"))
