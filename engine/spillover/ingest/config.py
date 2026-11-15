"""``data/sources.toml``: which series and events to ingest. No secrets: keys come from env."""

from __future__ import annotations

import tomllib
from datetime import date
from pathlib import Path
from typing import Annotated, Any, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator


class ConfigError(ValueError):
    """The sources file is missing or invalid."""


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class DataSettings(_Strict):
    out: Path = Path("data/cache")
    start: date = date(2021, 1, 1)
    # A one-day move larger than this is treated as a data error (for example an unadjusted split).
    max_abs_return: Annotated[float, Field(gt=0, le=1)] = 0.5


class SeriesSpec(_Strict):
    symbol: Annotated[str, Field(pattern=r"^[A-Za-z0-9._-]+$")]
    provider: Literal["fred", "csv", "alias"]
    id: str | None = None  # FRED series id
    path: Path | None = None  # CSV file you exported yourself
    of: str | None = None  # alias: copy another symbol's returns (for example MKT = SPX)

    @model_validator(mode="after")
    def _fields(self) -> Self:
        need = {"fred": self.id, "csv": self.path, "alias": self.of}[self.provider]
        if need is None:
            field = {"fred": "id", "csv": "path", "alias": "of"}[self.provider]
            raise ValueError(f"provider '{self.provider}' needs '{field}'")
        return self


class EventsSpec(_Strict):
    type: Literal["fomc", "csv", "store"]
    path: Path | None = None  # csv: the file; store: the events/ directory (default events)
    confirmed: Path | None = None  # store: human-confirmed low-confidence events

    @model_validator(mode="after")
    def _fields(self) -> Self:
        if self.type == "csv" and self.path is None:
            raise ValueError("events of type 'csv' need 'path'")
        return self


class FeedSpec(_Strict):
    """A headline feed. ``terms`` is required: say why you are allowed to use it."""

    name: Annotated[str, Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9._-]*$")]
    url: Annotated[str, Field(pattern=r"^https://")]
    terms: Annotated[str, Field(min_length=3)]


class ExtractorSettings(_Strict):
    model: str = "claude-haiku-5-5"
    store: Path = Path("events")
    cache: Path = Path("events/extractions")
    # A cost cap: at most this many new headlines are sent to the model in one run.
    max_new_per_run: Annotated[int, Field(ge=1, le=1000)] = 100


class Config(_Strict):
    data: DataSettings = DataSettings()
    series: Annotated[list[SeriesSpec], Field(min_length=1)]
    events: list[EventsSpec] = Field(default_factory=lambda: list[EventsSpec]())
    headlines: list[FeedSpec] = Field(default_factory=lambda: list[FeedSpec]())
    extractor: ExtractorSettings = ExtractorSettings()

    @model_validator(mode="after")
    def _consistent(self) -> Self:
        names = [f.name for f in self.headlines]
        if len(set(names)) != len(names):
            raise ValueError("headline feed names must be unique")
        symbols = [s.symbol for s in self.series]
        if len(set(symbols)) != len(symbols):
            raise ValueError("series symbols must be unique")
        real = {s.symbol for s in self.series if s.provider != "alias"}
        if not real:
            raise ValueError("at least one series must be a real provider, not an alias")
        for s in self.series:
            if s.provider == "alias" and s.of not in real:
                raise ValueError(f"alias {s.symbol} points at '{s.of}', which is not a real series")
        return self


def load_config(path: Path) -> Config:
    try:
        raw: dict[str, Any] = tomllib.loads(path.read_text(encoding="utf-8"))
    except OSError:
        raise ConfigError(
            f"{path} not found. Copy data/sources.example.toml to {path} and edit it."
        ) from None
    except tomllib.TOMLDecodeError as exc:
        raise ConfigError(f"{path}: not valid TOML: {exc}") from None
    try:
        return Config.model_validate(raw)
    except ValidationError as exc:
        lines = [f"{path}: invalid configuration"]
        for err in exc.errors():
            where = ".".join(str(p) for p in err["loc"]) or "<root>"
            lines.append(f"  - {where}: {err['msg']}")
        raise ConfigError("\n".join(lines)) from None
