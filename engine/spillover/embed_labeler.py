"""A free, local AI labeler: a small open sentence-embedding model instead of hand-written rules.

The model (`sentence-transformers/all-MiniLM-L6-v2`, Apache-2.0, pinned to one commit) turns a
headline into a vector that captures its meaning. Each event type is described by its definition
and a few example headlines; the headline gets the type whose descriptions it is closest to (cosine
similarity), or NONE when nothing is close enough. It runs on the CPU in a few milliseconds per
headline, with no API, no key and no cost. Company names still come from the rules labeler's
company list.

Why hand labels still matter: a model's answers are only worth trusting if they are checked against
answers people gave, so the gold set (labels/gold.jsonl) is the test set for this labeler exactly as
for the rules. Its accuracy is published the same way, next to the rules', and it only becomes the
default if it beats them there.

Needs the optional extra: ``uv sync --extra ml``.
"""

from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Callable, Sequence
from pathlib import Path

import numpy as np
import numpy.typing as npt

from spillover.rules_extractor import COMPANIES_FILE, RulesExtractor
from spillover.taxonomy import EXTRACTABLE, NONE

MODEL_REPO = "sentence-transformers/all-MiniLM-L6-v2"
MODEL_REVISION = "1110a243fdf4706b3f48f1d95db1a4f5529b4d41"  # pinned: the same weights every run
MODEL_FILE = "onnx/model.onnx"
TOKENIZER_FILE = "tokenizer.json"
MAX_TOKENS = 64  # headlines are short

# A headline is labeled with the closest event type only if it is at least this similar to one of
# that type's descriptions, and clearly closer to it than to the next type. Chosen before any
# positive gold labels existed, and published with the labeler's version, so it cannot be tuned
# to the test set after the fact; it changes only with a new version.
THRESHOLD = 0.36
MARGIN = 0.04

# Sentence embeddings capture what a headline is *about* far better than which way it points
# ("raises its forecast" and "cuts its forecast" sit close together). So the model picks the topic,
# and these published word lists pick the direction for the two topics that have one. Found on the
# labeler's own example headlines during development, never on the gold set.
PAIRS: dict[str, tuple[str, str]] = {
    "EARNINGS_BEAT": ("EARNINGS", "up"),
    "EARNINGS_MISS": ("EARNINGS", "down"),
    "GUIDANCE_RAISE": ("GUIDANCE", "up"),
    "GUIDANCE_CUT": ("GUIDANCE", "down"),
}
TOPIC_TYPES = {v: k for k, v in PAIRS.items()}
UP = re.compile(
    r"\b(beats?|tops?|exceeds?|surpass\w*|ahead of|above|raises?|lifts?|boosts?|hikes?|ups|"
    r"stronger|record)\b",
    re.IGNORECASE,
)
DOWN = re.compile(
    r"\b(miss(es)?|falls? short|below|short of|cuts?|lowers?|slash\w*|trims?|reduces?|warns?|"
    r"weaker|disappoint\w*)\b",
    re.IGNORECASE,
)

Vectors = npt.NDArray[np.float32]
Encoder = Callable[[Sequence[str]], Vectors]

# Example headlines for each type that can come from headlines, written for this labeler (not taken
# from the gold set), so the test set stays unseen.
EXAMPLES: dict[str, list[str]] = {
    "EARNINGS_BEAT": [
        "Company beats Wall Street estimates as quarterly profit jumps",
        "Shares rise after quarterly results top analysts' expectations",
        "Retailer posts stronger-than-expected earnings",
        "Chipmaker's quarterly revenue tops forecasts on strong demand",
        "Bank reports record quarterly earnings, above estimates",
    ],
    "EARNINGS_MISS": [
        "Company misses earnings estimates as sales slow",
        "Quarterly profit falls short of analyst expectations",
        "Results disappoint, revenue below forecasts",
    ],
    "GUIDANCE_RAISE": [
        "Company raises full-year forecast",
        "Chipmaker lifts its revenue outlook for the year",
        "Firm boosts annual profit guidance",
    ],
    "GUIDANCE_CUT": [
        "Company cuts its full-year outlook",
        "Firm lowers revenue guidance citing weak demand",
        "Profit warning: company slashes forecast",
    ],
    "CAPEX_RAISE": [
        "Company raises capital spending plans for data centers",
        "Tech giant to spend more on AI infrastructure this year",
        "Firm lifts capex forecast to build new factories",
    ],
    "FCF_TURNS_NEGATIVE": [
        "Company reports negative free cash flow for the quarter",
        "Cash burn: free cash flow turns negative",
    ],
    "TOKEN_UNLOCK": [
        "Millions of locked crypto tokens to be released this week",
        "Token unlock adds supply as vesting period ends",
    ],
    "ACQUISITION_ANNOUNCED": [
        "Company agrees to buy rival in multibillion-dollar deal",
        "Firm to acquire startup for $2 billion",
        "Merger agreement announced between two companies",
        "Tech giant to acquire software maker in all-cash deal",
        "Takeover: buyer agrees to purchase company for $50 a share",
    ],
    "REGULATORY_ACTION": [
        "SEC charges company with misleading investors",
        "Regulator fines bank over compliance failures",
        "Antitrust authority sues company to block practices",
        "Watchdog orders firm to pay penalty for violations",
        "SEC sues crypto exchange for operating without registration",
    ],
    "EXEC_DEPARTURE": [
        "Chief executive steps down effective immediately",
        "Company announces CFO departure",
        "Board ousts CEO after investigation",
    ],
}


def prototypes() -> list[tuple[str, str]]:
    """(event type, text) pairs: each type's definition plus its example headlines."""
    out: list[tuple[str, str]] = []
    for t in EXTRACTABLE:
        out.append((t.name, t.definition))
        out.extend((t.name, ex) for ex in EXAMPLES.get(t.name, []))
    return out


def onnx_encoder(cache_dir: Path | None = None) -> Encoder:
    """The pinned MiniLM model on ONNX Runtime: mean-pooled, normalized sentence vectors."""
    try:
        import onnxruntime as ort  # type: ignore[import-untyped]
        from huggingface_hub import hf_hub_download  # type: ignore[import-untyped]
        from tokenizers import Tokenizer  # type: ignore[import-untyped]
    except ImportError as exc:  # pragma: no cover - depends on the optional extra
        raise RuntimeError("the embedding labeler needs `uv sync --extra ml`") from exc

    def fetch(name: str) -> str:
        return str(hf_hub_download(MODEL_REPO, name, revision=MODEL_REVISION, cache_dir=cache_dir))

    tok = Tokenizer.from_file(fetch(TOKENIZER_FILE))
    tok.enable_truncation(max_length=MAX_TOKENS)
    tok.enable_padding(length=None)
    session = ort.InferenceSession(fetch(MODEL_FILE), providers=["CPUExecutionProvider"])
    wanted = {i.name for i in session.get_inputs()}

    def encode(texts: Sequence[str]) -> Vectors:
        enc = tok.encode_batch(list(texts))
        ids = np.array([e.ids for e in enc], dtype=np.int64)
        mask = np.array([e.attention_mask for e in enc], dtype=np.int64)
        feeds = {"input_ids": ids, "attention_mask": mask}
        if "token_type_ids" in wanted:
            feeds["token_type_ids"] = np.zeros_like(ids)
        hidden = np.asarray(session.run(None, feeds)[0], dtype=np.float32)  # (batch, tokens, 384)
        weights = mask[..., None].astype(np.float32)
        pooled = (hidden * weights).sum(axis=1) / np.maximum(weights.sum(axis=1), 1e-9)
        norms = np.linalg.norm(pooled, axis=1, keepdims=True)
        return (pooled / np.maximum(norms, 1e-12)).astype(np.float32)

    return encode


class EmbeddingLabeler:
    """Answers like the other labelers (JSON with event_type, entities, confidence)."""

    def __init__(self, encode: Encoder, rules: RulesExtractor) -> None:
        self._encode = encode
        self._rules = rules
        pairs = prototypes()
        self._types = [t for t, _ in pairs]
        self._vectors = encode([text for _, text in pairs])
        digest = hashlib.sha256(
            json.dumps(
                {"p": pairs, "t": THRESHOLD, "m": MARGIN, "up": UP.pattern, "down": DOWN.pattern},
                sort_keys=True,
            ).encode()
        ).hexdigest()[:8]
        # Frozen into every event it produces: the model commit, the settings and the descriptions.
        self.model_id = f"spillover-embed/minilm-{MODEL_REVISION[:8]}-{digest}+{rules.model_id}"

    @classmethod
    def load(
        cls, companies: Path = COMPANIES_FILE, cache_dir: Path | None = None
    ) -> EmbeddingLabeler:
        return cls(onnx_encoder(cache_dir), RulesExtractor.load(companies))

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

    def scores(self, title: str) -> dict[str, float]:
        """Each event type's best cosine similarity to the headline."""
        sims = self._vectors @ self._encode([title])[0]
        best: dict[str, float] = {}
        for t, s in zip(self._types, sims.tolist(), strict=True):
            best[t] = max(best.get(t, -1.0), float(s))
        return best

    def topic_scores(self, title: str) -> dict[str, float]:
        """Scores per topic: paired types (beat/miss, raise/cut) are one topic before direction."""
        out: dict[str, float] = {}
        for t, sc in self.scores(title).items():
            key = PAIRS[t][0] if t in PAIRS else t
            out[key] = max(out.get(key, -1.0), sc)
        return out

    def label(self, title: str) -> dict[str, object]:
        none: dict[str, object] = {"event_type": NONE, "entities": [], "confidence": "medium"}
        ranked = sorted(self.topic_scores(title).items(), key=lambda kv: kv[1], reverse=True)
        (top, top_s), (_, second_s) = ranked[0], ranked[1] if len(ranked) > 1 else ("", -1.0)
        if top_s < THRESHOLD or top_s - second_s < MARGIN:
            return none
        if top in ("EARNINGS", "GUIDANCE"):
            up, down = bool(UP.search(title)), bool(DOWN.search(title))
            if up == down:
                return none  # the direction is unclear: better no label than a wrong one
            top = TOPIC_TYPES[(top, "up" if up else "down")]
        # Who it is about: the rules' company matching (names and tickers), the same as the rules.
        entities = self._rules.label_entities(title, top)
        sure = "high" if top_s >= THRESHOLD + 0.1 else "medium"
        confidence = sure if entities else "low"
        return {"event_type": top, "entities": entities, "confidence": confidence}
