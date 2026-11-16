"""The labeling section of the site: blind candidates, and accuracy once people have labeled."""

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

from spillover.eventstore import append_records, make_record
from spillover.site_export import build_labeling

TITLES = [
    ("SEC charges Coinbase with operating an unregistered exchange", "REGULATORY_ACTION", ["COIN"]),
    ("Nvidia raises full-year revenue forecast", "GUIDANCE_RAISE", ["NVDA"]),
    ("Federal Reserve announces revised schedule of meetings", "NONE", []),
]


def store_with(tmp: Path) -> Path:
    store = tmp / "events"
    t0 = datetime(2026, 11, 1, 12, tzinfo=UTC)
    records = [
        make_record(
            headline_id=f"h{i}",
            title=title,
            url=f"https://example.gov/{i}",
            source="sec-press",
            published_at=t0 + timedelta(days=i),
            event_type=kind,
            entities=ents,
            confidence="high",
            needs_review=False,
            extractor_version="spillover-rules/1-test",
        )
        for i, (title, kind, ents) in enumerate(TITLES)
    ]
    append_records(store, records)
    return store


def companies(tmp: Path) -> Path:
    path = tmp / "companies.json"
    path.write_text(
        json.dumps([{"ticker": "COIN", "name": "Coinbase"}, {"ticker": "NVDA", "name": "Nvidia"}])
    )
    return path


def test_candidates_are_newest_first_and_carry_no_labeler_answer(tmp_path: Path) -> None:
    lab = build_labeling(store_with(tmp_path), tmp_path / "no-gold.jsonl", companies(tmp_path))
    assert [c.headline_id for c in lab.candidates] == ["h2", "h1", "h0"]
    dumped = lab.candidates[0].model_dump()
    assert set(dumped) == {"headline_id", "title", "source", "url", "published_at"}, (
        "labeling is blind"
    )
    assert lab.gold_rows == 0 and lab.accuracy is None
    assert "NONE" in [t.name for t in lab.event_types]


def test_labeled_headlines_drop_out_and_accuracy_is_published(tmp_path: Path) -> None:
    gold = tmp_path / "gold.jsonl"
    gold.write_text(
        "\n".join(
            json.dumps(
                {"title": t, "source": "sec-press", "expected_type": k, "expected_entities": e}
            )
            for t, k, e in TITLES[:2]
        )
        + "\n"
    )
    lab = build_labeling(store_with(tmp_path), gold, companies(tmp_path))
    assert [c.headline_id for c in lab.candidates] == ["h2"], (
        "already-labeled headlines are not shown"
    )
    assert lab.gold_rows == 2
    assert [g.expected_type for g in lab.gold] == ["REGULATORY_ACTION", "GUIDANCE_RAISE"]
    assert lab.accuracy is not None and lab.accuracy.n_scored == 2
    assert lab.accuracy.type_accuracy == 1.0
    assert lab.accuracy.extractor_version.startswith("spillover-rules/")


def test_a_broken_gold_file_never_breaks_the_site(tmp_path: Path) -> None:
    gold = tmp_path / "gold.jsonl"
    gold.write_text('{"title": "x", "source": "s", "expected_type": ""}\n')
    lab = build_labeling(store_with(tmp_path), gold, companies(tmp_path))
    assert lab.accuracy is None and len(lab.candidates) == 3
