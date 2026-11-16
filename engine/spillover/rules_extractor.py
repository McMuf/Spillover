"""A free, deterministic headline labeler: phrase rules say *what* happened, a company list *who*.

It stands in for the Claude extractor (same answer format, same validation, same cache and
"needs review" handling) when no paid model is available. It is less capable than a language
model, so its accuracy is measured against the same hand-labeled gold set and published.

* **What happened**: an ordered list of phrase rules, one per event type in the taxonomy. The first
  rule that matches wins; no match means NONE.
* **Who it is about**: company names and tickers of NYSE and Nasdaq listings from Wikidata (CC0),
  kept as a committed snapshot (``labels/companies.json``) so labeling never changes silently.
  Names that are ordinary words ("Target", "Block") count only next to a corporate suffix or an
  exchange ticker, so a headline about a "target rate" is not about Target Corp.
* **Confidence**: high when the company is identified unambiguously (an exchange ticker, a
  multi-word name, or a name with a corporate suffix); medium for a single-word name; low when the
  event type matched but no company did, which sends the event to human review.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path

from spillover.taxonomy import NONE

RULES_VERSION = "1"  # bump when the logic (not just the rule text) changes
COMPANIES_FILE = Path("labels/companies.json")

_SUFFIXES = {
    "inc", "incorporated", "corp", "corporation", "co", "company", "ltd", "limited", "plc",
    "holdings", "holding", "group", "sa", "nv", "ag", "se", "llc", "lp", "the", "trust",
}  # fmt: skip
# Single-word names that are also everyday words. They count only with a suffix or a ticker.
_COMMON = {
    "target", "block", "visa", "gap", "ball", "best", "general", "first", "united", "american",
    "national", "standard", "federal", "bank", "energy", "global", "international", "capital",
    "financial", "progressive", "public", "service", "services", "southern", "western", "eastern",
    "northern", "pacific", "atlantic", "central", "liberty", "freedom", "unity", "intercontinental",
    "community", "independent", "republic", "union", "security", "insight", "matrix", "vision",
    "focus", "edge", "core", "apex", "summit", "pioneer", "frontier", "harmony", "advance",
    "progress", "genesis", "alpha", "beta", "delta", "omega", "sigma", "data", "digital", "smart",
    "simply", "match", "snap", "square", "shift", "lucid", "rivian", "fox", "news", "sun", "star",
    "meta", "oracle", "apple", "amazon", "alphabet", "intel", "micron", "tesla", "nvidia",
    "netflix", "uber", "airbnb", "zoom", "dell", "hp", "arm", "ford", "nike", "boeing", "pfizer",
    "chevron", "exxon", "walmart", "costco", "starbucks", "disney", "coinbase", "palantir",
}  # fmt: skip
# Famous single-word names above are still matched when written with their usual capital letter
# outside an all-capitals headline; see _significant_single.
_FAMOUS = {
    "meta", "oracle", "apple", "amazon", "alphabet", "intel", "micron", "tesla", "nvidia",
    "netflix", "uber", "airbnb", "zoom", "dell", "ford", "nike", "boeing", "pfizer", "chevron",
    "exxon", "walmart", "costco", "starbucks", "disney", "coinbase", "palantir",
}  # fmt: skip

_TICKER_TAG = re.compile(r"\((?:NYSE|NASDAQ|Nasdaq|NYSE American)\s*:\s*([A-Z][A-Z.\-]{0,6})\)")
_WORD = re.compile(r"[A-Za-z0-9&'.\-]+")

# (event type, pattern). Order matters: the first match wins.
_RULES: list[tuple[str, re.Pattern[str]]] = [
    (
        "TOKEN_UNLOCK",
        re.compile(r"\btoken unlocks?\b|\bunlock(?:s|ing)?\b.{0,40}\btokens?\b", re.I),
    ),
    (
        "REGULATORY_ACTION",
        re.compile(
            r"^(?:SEC|CFTC|FTC|FINRA|DOJ)\s+(?:charges|sues|fines|bars|suspends|obtains)\b"
            r"|\b(?:charged|sued|fined|penalized|sanctioned)\s+by\b"
            r"|\b(?:SEC|Securities and Exchange Commission|CFTC|FTC|FINRA|Justice Department|DOJ"
            r"|Federal Reserve(?: Board)?|OCC|regulators?)\b.{0,80}\b(?:charges?|sues|fines?"
            r"|penalt(?:y|ies)|enforcement action|cease[- ]and[- ]desist|settles? charges)\b",
            re.I,
        ),
    ),
    (
        "EXEC_DEPARTURE",
        re.compile(
            r"\b(?:CEO|CFO|chief executive(?: officer)?|chief financial officer)\b.{0,60}"
            r"\b(?:steps? down|resigns?|resignation|to leave|leaves|departs?|departure|ousted"
            r"|fired|to retire|retires|retirement|exits?)\b"
            r"|\b(?:ousts?|fires?|replaces)\b.{0,30}\b(?:CEO|CFO|chief executive)\b",
            re.I,
        ),
    ),
    (
        "ACQUISITION_ANNOUNCED",
        re.compile(
            r"\b(?:to acquire|acquires|agrees? to (?:buy|acquire)|to buy|buyout of|to be acquired"
            r"|merger with|to merge with|takeover of|acquisition of)\b",
            re.I,
        ),
    ),
    (
        "FCF_TURNS_NEGATIVE",
        re.compile(r"\bfree cash flow\b.{0,60}\b(?:negative|turns? negative)\b", re.I),
    ),
    (
        "CAPEX_RAISE",
        re.compile(
            r"\b(?:raises?|boosts?|lifts?|hikes?|increases?|ups)\b.{0,40}"
            r"\b(?:capex|capital (?:expenditures?|spending)"
            r"|spending on (?:AI|data cent(?:er|re)s?))\b"
            r"|\b(?:capex|capital (?:expenditures?|spending))\b.{0,30}"
            r"\b(?:to rise|jumps?|surges?)\b",
            re.I,
        ),
    ),
    (
        "GUIDANCE_CUT",
        re.compile(
            r"\b(?:cuts?|lowers?|slashes?|trims?|reduces?)\b.{0,40}\b(?:guidance|outlook|forecast)\b",
            re.I,
        ),
    ),
    (
        "GUIDANCE_RAISE",
        re.compile(
            r"\b(?:raises?|lifts?|boosts?|hikes?|ups)\b.{0,40}\b(?:guidance|outlook|forecast)\b",
            re.I,
        ),
    ),
    (
        "EARNINGS_MISS",
        re.compile(
            r"\b(?:miss(?:es)?|falls? short of|trails?)\b.{0,50}\b(?:estimates?|expectations"
            r"|forecasts?|consensus)\b",
            re.I,
        ),
    ),
    (
        "EARNINGS_BEAT",
        re.compile(
            r"\b(?:beats?|tops?|exceeds?|surpass(?:es)?|crushes)\b.{0,50}\b(?:estimates?"
            r"|expectations|forecasts?|consensus)\b",
            re.I,
        ),
    ),
]
# Things that look like an event but are not one, for the types listed.
_NOT: dict[str, re.Pattern[str]] = {
    "REGULATORY_ACTION": re.compile(
        r"\btermination of\b|\bproposes?\b|\bproposed\b|\bcomment period\b", re.I
    ),
    "ACQUISITION_ANNOUNCED": re.compile(r"\bapproval of\b|\bapproves?\b|\bapplication\b", re.I),
}


# For regulatory actions, the company must be the TARGET: the words after the charge ("SEC charges
# X with...", "enforcement action against X to...", "X fined by..."), not a company merely
# mentioned later ("...in funds that held interests in SpaceX").
_STOP = r"(?=\s+(?:with|for|in|over|tied to|to|regarding|after|alleging|who)\s|[,;:]|$)"
_TARGET = [
    re.compile(r"^(?:SEC|CFTC|FTC|FINRA|DOJ)\s+\w+\s+(?P<t>.+?)" + _STOP, re.I),
    re.compile(r"\b(?:against|actions? with|charges|sues|fines)\s+(?P<t>.+?)" + _STOP, re.I),
    re.compile(
        r"^(?P<t>.+?)\s+(?:is |are |was |were )?(?:charged|sued|fined|penalized|sanctioned)\s+by\b",
        re.I,
    ),
]


def target_segment(title: str) -> str | None:
    """The part of a regulatory headline that names who the action is against, if findable."""
    for pattern in _TARGET:
        m = pattern.search(title)
        if m:
            return m.group("t")
    return None


def normalize(name: str) -> list[str]:
    """Lowercase words of a company name, without punctuation or corporate suffixes."""
    words = [w.strip(".'-").lower() for w in _WORD.findall(name.replace(",", " "))]
    words = [w for w in words if w]
    while words and words[-1] in _SUFFIXES:
        words.pop()
    while words and words[0] == "the":
        words.pop(0)
    return words


@dataclass(frozen=True)
class Company:
    ticker: str
    name: str


class RulesExtractor:
    """Answers like the Claude extractor (JSON with event_type, entities, confidence)."""

    def __init__(self, companies: list[Company]) -> None:
        self._by_name: dict[tuple[str, ...], str] = {}
        for c in sorted(companies, key=lambda c: (c.ticker, c.name)):
            key = tuple(normalize(c.name))
            if key and key not in self._by_name:
                self._by_name[key] = c.ticker
        self._tickers = {c.ticker for c in companies}
        self._longest = max((len(k) for k in self._by_name), default=1)
        digest = hashlib.sha256(
            json.dumps(
                {
                    "rules": [(t, p.pattern) for t, p in _RULES],
                    "not": {t: p.pattern for t, p in _NOT.items()},
                    "target": [p.pattern for p in _TARGET],
                    "names": sorted(
                        f"{k}={v}" for k, v in ((" ".join(k), v) for k, v in self._by_name.items())
                    ),
                },
                sort_keys=True,
            ).encode()
        ).hexdigest()[:8]
        # Frozen into every event this labeler produces, so a change in rules or names is visible.
        self.model_id = f"spillover-rules/{RULES_VERSION}-{digest}"

    @classmethod
    def load(cls, path: Path = COMPANIES_FILE) -> RulesExtractor:
        rows = json.loads(path.read_text(encoding="utf-8"))
        return cls([Company(r["ticker"], r["name"]) for r in rows])

    def complete(self, system: str, user: str) -> str:
        """``user`` is the extractor's message; only its 'Headline:' line is read."""
        del system
        title = next(
            (
                ln[len("Headline:") :].strip()
                for ln in user.splitlines()
                if ln.startswith("Headline:")
            ),
            "",
        )
        return json.dumps(self.label(title))

    def label(self, title: str) -> dict[str, object]:
        kind = NONE
        for event_type, pattern in _RULES:
            if pattern.search(title) and not (
                event_type in _NOT and _NOT[event_type].search(title)
            ):
                kind = event_type
                break
        if kind == NONE:
            return {"event_type": NONE, "entities": [], "confidence": "medium"}
        scope = title
        if kind == "REGULATORY_ACTION":
            scope = target_segment(title) or title
        strong, weak = self._companies(scope)
        entities = sorted(strong | weak)[:8]
        if not entities:
            confidence = "low"
        elif weak and not strong:
            confidence = "medium"
        else:
            confidence = "high"
        return {"event_type": kind, "entities": entities, "confidence": confidence}

    def _companies(self, title: str) -> tuple[set[str], set[str]]:
        """(identified unambiguously, identified by a single plain word)."""
        strong = {t for t in _TICKER_TAG.findall(title) if t in self._tickers}
        weak: set[str] = set()
        raw = _WORD.findall(title.replace(",", " "))
        words = [w.strip(".'-") for w in raw]
        lower = [w.lower() for w in words]
        shouting = sum(w.isupper() for w in words if len(w) > 3) > len(words) / 2
        i = 0
        while i < len(lower):
            hit = None
            for n in range(min(self._longest, len(lower) - i), 0, -1):
                key = tuple(lower[i : i + n])
                if key in self._by_name:
                    hit = (n, self._by_name[key])
                    break
            if hit is None:
                i += 1
                continue
            n, ticker = hit
            next_word = lower[i + n] if i + n < len(lower) else ""
            if n > 1 or next_word in _SUFFIXES:
                strong.add(ticker)
            elif self._significant_single(words[i], lower[i], shouting):
                weak.add(ticker)
            i += n
        return strong, weak

    @staticmethod
    def _significant_single(original: str, lowered: str, shouting: bool) -> bool:
        if lowered in _COMMON and lowered not in _FAMOUS:
            return False
        if len(lowered) < 4:
            return False
        # A famous name must be written as a name (capitalized), not as an ordinary word.
        return shouting or original[:1].isupper()
