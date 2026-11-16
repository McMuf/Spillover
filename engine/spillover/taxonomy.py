"""The event taxonomy: the fixed list of event types the extractor may output.

A fixed list is what makes events countable and comparable across claims. This is a deliberately
small starting set (it covers the seed claims and common company news). To add a type, open an
issue proposing it with a definition and a handful of example headlines; changing a definition
changes what past events mean, so definitions are versioned with the extractor prompt.
"""

from __future__ import annotations

from dataclasses import dataclass

NONE = "NONE"

# The fixed rule for price-move events. It is part of the event definition, so a claim cannot pick a
# threshold after seeing which one "works". Changing either number is a rules change.
MOVE_LOOKBACK = 60  # trading days of the stock's own history used to measure its normal volatility
MOVE_SIGMA = 3.0  # a move counts when it exceeds this many standard deviations of that history


@dataclass(frozen=True)
class EventType:
    name: str
    definition: str
    extractable: bool = True  # False: comes from a calendar or is a control, never from a headline


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
        extractable=False,
    ),
    EventType(
        "RANDOM_DATE",
        "A randomly chosen date. The permanent placebo control.",
        extractable=False,
    ),
    EventType(
        "CPI_RELEASE",
        "The US Consumer Price Index report is published (8:30 a.m. New York time, before the "
        "stock market opens). Comes from the release calendar on FRED.",
        extractable=False,
    ),
    EventType(
        "JOBS_REPORT",
        "The US Employment Situation report (payrolls, unemployment rate) is published (8:30 "
        "a.m. New York time). Comes from the release calendar on FRED.",
        extractable=False,
    ),
    EventType(
        "LARGE_MOVE_UP",
        "The named instrument's daily return on its own exchange is above +3 standard deviations "
        "of its previous 60 trading days. Derived from prices, never from headlines.",
        extractable=False,
    ),
    EventType(
        "LARGE_MOVE_DOWN",
        "The named instrument's daily return on its own exchange is below -3 standard deviations "
        "of its previous 60 trading days. Derived from prices, never from headlines.",
        extractable=False,
    ),
)

EXTRACTABLE: tuple[EventType, ...] = tuple(t for t in TAXONOMY if t.extractable)
EXTRACTABLE_NAMES: frozenset[str] = frozenset(t.name for t in EXTRACTABLE)
ALL_NAMES: frozenset[str] = frozenset(t.name for t in TAXONOMY)
