"""The event taxonomy: the fixed list of event types the extractor may output.

A fixed list is what makes events countable and comparable across claims. This is a deliberately
small starting set (it covers the seed claims and common company news). To add a type, open an
issue proposing it with a definition and a handful of example headlines; changing a definition
changes what past events mean, so definitions are versioned with the extractor prompt.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

# Where events of a type come from. Only "headlines" types are offered to the labeler.
Origin = Literal["headlines", "calendar", "prices", "filings", "control"]

NONE = "NONE"

# The fixed rule for price-move events. It is part of the event definition, so a claim cannot pick a
# threshold after seeing which one "works". Changing either number is a rules change.
MOVE_LOOKBACK = 60  # trading days of the stock's own history used to measure its normal volatility
MOVE_SIGMA = 3.0  # a move counts when it exceeds this many standard deviations of that history


@dataclass(frozen=True)
class EventType:
    name: str
    definition: str
    origin: Origin = "headlines"

    @property
    def extractable(self) -> bool:
        """Offered to the headline labeler. Every other origin never comes from a headline."""
        return self.origin == "headlines"


TAXONOMY: tuple[EventType, ...] = (
    EventType(
        "EARNINGS_BEAT",
        "A company reports quarterly or annual results that beat analyst consensus or guidance.",
    ),
    EventType(
        "EARNINGS_MISS",
        "A company reports quarterly or annual results that miss analyst consensus or guidance.",
    ),
    EventType("GUIDANCE_RAISE", "A company raises its own financial outlook or targets."),
    EventType("GUIDANCE_CUT", "A company lowers its own financial outlook or targets."),
    EventType(
        "CAPEX_RAISE",
        "A company announces higher planned capital expenditure than previously stated.",
    ),
    EventType(
        "FCF_TURNS_NEGATIVE",
        "A company reports free cash flow that turned negative in the period.",
    ),
    EventType(
        "TOKEN_UNLOCK",
        "A scheduled or announced release of locked crypto tokens into circulation.",
    ),
    EventType(
        "ACQUISITION_ANNOUNCED",
        "A company announces an agreement to acquire, or be acquired by, another company.",
    ),
    EventType(
        "REGULATORY_ACTION",
        "A regulator announces an enforcement action, fine or ruling against a named company.",
    ),
    EventType(
        "EXEC_DEPARTURE",
        "A company announces that its CEO or CFO is leaving or has been removed.",
    ),
    # Not produced by the extractor:
    EventType(
        "FOMC_DECISION",
        "A Federal Open Market Committee policy decision. Comes from the Fed's calendar.",
        origin="calendar",
    ),
    EventType(
        "RANDOM_DATE",
        "A randomly chosen date. The permanent placebo control.",
        origin="control",
    ),
    EventType(
        "CPI_RELEASE",
        "The US Consumer Price Index report is published (8:30 a.m. New York time, before the "
        "stock market opens). Comes from the release calendar on FRED.",
        origin="calendar",
    ),
    EventType(
        "JOBS_REPORT",
        "The US Employment Situation report (payrolls, unemployment rate) is published (8:30 "
        "a.m. New York time). Comes from the release calendar on FRED.",
        origin="calendar",
    ),
    EventType(
        "LARGE_MOVE_UP",
        "The named instrument's daily return on its own exchange is above +3 standard deviations "
        "of its previous 60 trading days. Derived from prices, never from headlines.",
        origin="prices",
    ),
    EventType(
        "LARGE_MOVE_DOWN",
        "The named instrument's daily return on its own exchange is below -3 standard deviations "
        "of its previous 60 trading days. Derived from prices, never from headlines.",
        origin="prices",
    ),
    # From SEC 8-K filings: the filing's item number fixes the type (see ingest/filings.py). Dated
    # by when SEC accepted the filing, which can be days after the news first broke.
    EventType(
        "CYBER_INCIDENT",
        "A company discloses a material cybersecurity incident (SEC Form 8-K Item 1.05). From "
        "filings, never from headlines.",
        origin="filings",
    ),
    EventType(
        "BANKRUPTCY",
        "A company reports a bankruptcy or receivership (SEC Form 8-K Item 1.03). From filings, "
        "never from headlines.",
        origin="filings",
    ),
    EventType(
        "RESTATEMENT",
        "A company says its previously issued financial statements should no longer be relied on "
        "(SEC Form 8-K Item 4.02). From filings, never from headlines.",
        origin="filings",
    ),
    EventType(
        "DELISTING_NOTICE",
        "A company reports a delisting notice or a failure to meet a listing rule (SEC Form 8-K "
        "Item 3.01). From filings, never from headlines.",
        origin="filings",
    ),
)

EXTRACTABLE: tuple[EventType, ...] = tuple(t for t in TAXONOMY if t.extractable)
EXTRACTABLE_NAMES: frozenset[str] = frozenset(t.name for t in EXTRACTABLE)
ALL_NAMES: frozenset[str] = frozenset(t.name for t in TAXONOMY)
