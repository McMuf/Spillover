"""The free local AI labeler, tested with a stand-in encoder (no model download needed)."""

import json
from collections.abc import Sequence

import numpy as np

from spillover.embed_labeler import EXAMPLES, MARGIN, THRESHOLD, EmbeddingLabeler, prototypes
from spillover.gold import GOLD_FILE, load_gold
from spillover.rules_extractor import Company, RulesExtractor
from spillover.taxonomy import EXTRACTABLE_NAMES, NONE

# A tiny bag-of-words "embedding": enough to test the decision logic deterministically.
VOCAB = [
    "earnings",
    "estimates",
    "results",
    "forecast",
    "outlook",
    "guidance",
    "acquire",
    "deal",
    "charges",
    "fines",
    "ceo",
    "steps",
    "spending",
    "capex",
    "token",
    "cash",
    "weather",
]


def fake_encode(texts: Sequence[str]) -> np.ndarray:
    rows = []
    for t in texts:
        words = t.lower().replace(",", " ").split()
        v = np.array([sum(w.startswith(k) for w in words) for k in VOCAB], dtype=np.float32) + 1e-3
        rows.append(v / np.linalg.norm(v))
    return np.vstack(rows)


def labeler() -> EmbeddingLabeler:
    rules = RulesExtractor([Company("ORCL", "Oracle"), Company("TGT", "Target Corporation")])
    return EmbeddingLabeler(fake_encode, rules)


def test_every_headline_type_has_a_definition_and_examples() -> None:
    types = {t for t, _ in prototypes()}
    assert types == set(EXTRACTABLE_NAMES)
    assert all(len(EXAMPLES[t]) >= 2 for t in EXTRACTABLE_NAMES)


def test_the_test_set_stays_unseen_examples_are_not_gold_headlines() -> None:
    gold, _ = load_gold(GOLD_FILE)
    titles = {g.title.lower() for g in gold}
    assert not any(ex.lower() in titles for exs in EXAMPLES.values() for ex in exs)


class Scored(EmbeddingLabeler):
    """The labeler's decisions on fixed topic scores, so the rules are tested exactly."""

    def __init__(self, topics: dict[str, float]) -> None:
        super().__init__(fake_encode, RulesExtractor([Company("ORCL", "Oracle")]))
        self._topics = topics

    def topic_scores(self, title: str) -> dict[str, float]:
        return self._topics


def test_direction_comes_from_the_words_not_the_topic() -> None:
    guidance = {"GUIDANCE": 0.6, "EARNINGS": 0.4}
    assert (
        Scored(guidance).label("Company cuts its full-year forecast")["event_type"]
        == "GUIDANCE_CUT"
    )
    assert (
        Scored(guidance).label("Company raises its full-year forecast")["event_type"]
        == "GUIDANCE_RAISE"
    )
    earnings = {"EARNINGS": 0.6, "GUIDANCE": 0.4}
    assert Scored(earnings).label("Bank misses estimates")["event_type"] == "EARNINGS_MISS"


def test_an_unclear_direction_a_close_call_or_a_far_away_headline_is_none() -> None:
    assert (
        Scored({"GUIDANCE": 0.6, "X": 0.1}).label("Company updates its forecast")["event_type"]
        == NONE
    )
    assert Scored({"EXEC_DEPARTURE": 0.5, "CAPEX_RAISE": 0.49}).label("x")["event_type"] == NONE
    assert Scored({"EXEC_DEPARTURE": THRESHOLD - 0.01, "X": 0.0}).label("x")["event_type"] == NONE
    assert labeler().label("Weather turns cold across the Midwest")["event_type"] == NONE


def test_companies_come_from_the_rules_and_confidence_drops_without_one() -> None:
    lab = labeler()
    got = lab.label("Oracle CEO steps down")
    assert got["event_type"] == "EXEC_DEPARTURE" and got["entities"] == ["ORCL"]
    unnamed = lab.label("CEO steps down at a private company")
    assert unnamed["confidence"] == "low"


def test_the_version_names_the_pinned_model_and_settings() -> None:
    lab = labeler()
    assert lab.model_id.startswith("spillover-embed/minilm-1110a243-")
    assert "spillover-rules/" in lab.model_id
    assert 0 < MARGIN < THRESHOLD < 1
    answer = json.loads(lab.complete("system", "Source: test\nHeadline: Oracle CEO steps down"))
    assert answer["event_type"] == "EXEC_DEPARTURE"
