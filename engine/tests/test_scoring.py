import json
import math
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
from typer.testing import CliRunner

from spillover.cli import app
from spillover.data import MarketData
from spillover.eventstudy import run_backtest
from spillover.ledger import build_prediction, write_prediction
from spillover.models import Claim, load_claim
from spillover.scoreboard import (
    SMALL_SAMPLE,
    build_scoreboard,
    calibration_bins,
    claim_status,
    effective_outcomes,
    wilson_interval,
)
from spillover.scoring import (
    Outcome,
    ScoreError,
    grade_all,
    grade_prediction,
    seal,
    verify_outcomes,
    write_outcome,
)

from .conftest import FIXTURES
from .test_models import write

runner = CliRunner()
NOW = datetime(2026, 1, 5, 12, 0, tzinfo=UTC)
REGISTERED = "2020-01-01T00:00:00Z"


def make_claim(tmp_path: Path, **overrides: Any) -> Claim:
    base: dict[str, Any] = {
        "id": "clm_syn_shock_v1",
        "event_type": "SYN_SHOCK",
        "trigger_entities": ["SYNCO"],
        "instrument": {"venue": "us_equity", "symbol": "SYN2"},
        "expected_sign": "negative",
        "registered_at": REGISTERED,
    }
    base.update(overrides)
    return load_claim(write(tmp_path, **base))


def freeze(claim: Claim, root: Path, event_id: str, when: date) -> Path:
    """Freeze a prediction made on the event day, before the window closes."""
    created = datetime(when.year, when.month, when.day, 12, tzinfo=UTC)
    return write_prediction(root, build_prediction(claim, event_id, when, created))


def shock_events(market: MarketData) -> list[tuple[str, date]]:
    ev = market.events.filter(market.events["event_type"] == "SYN_SHOCK")
    return list(zip(ev["event_id"].to_list(), ev["date"].to_list(), strict=True))


def clear_shock_events(market: MarketData, end_offset: int = 1) -> list[tuple[str, date]]:
    """Shock events whose window touches no scheduled release (so the overlap rule keeps them)."""
    ev = market.events
    sched = {market.day_index(d) for d in ev.filter(ev["scheduled"])["date"].to_list()}
    out = []
    for event_id, when in shock_events(market):
        t0 = market.day_index(when)
        if t0 is not None and not any(t0 <= s <= t0 + end_offset for s in sched if s is not None):
            out.append((event_id, when))
    return out


def make_outcome(**kw: Any) -> Outcome:
    start = kw.pop("start", date(2026, 3, 2))
    base: dict[str, Any] = {
        "prediction_sha256": "a" * 64,
        "claim_id": "clm_x_v1",
        "claim_version": 1,
        "event_id": "ev",
        "event_date": start,
        "window_start": start,
        "window_end": start + timedelta(days=1),
        "predicted_sign": "negative",
        "measure": "abnormal_return",
        "baseline": "factor_only",
        "car": -0.01,
        "value": -0.01,
        "hit": True,
        "scheduled_overlap": False,
        "confidence": None,
        "data_synthetic": False,
        "data_as_of": date(2026, 6, 1),
        "rules_version": "0.1",
        "engine_version": "test",
        "graded_at": NOW,
        "corrects": None,
        "sha256": "0" * 64,
    }
    base.update(kw)
    return seal(Outcome.model_validate(base))


# --- grading -----------------------------------------------------------------------------------


def test_graded_value_matches_the_backtest_statistic(market: MarketData, tmp_path: Path) -> None:
    """Grading and backtesting must agree: same event, same numbers."""
    claim = make_claim(tmp_path)
    event_id, when = shock_events(market)[3]
    pred = build_prediction(
        claim, event_id, when, datetime(when.year, when.month, when.day, 12, tzinfo=UTC)
    )
    outcome = grade_prediction(pred, market, NOW)
    assert outcome is not None
    stat = next(e for e in run_backtest(claim, market).events if e.event_id == event_id)
    assert outcome.value == pytest.approx(stat.value)
    assert outcome.car == pytest.approx(stat.car)
    assert outcome.prediction_sha256 == pred.sha256
    assert outcome.data_synthetic is True
    assert outcome.hit == (stat.value < 0)


def test_open_window_is_not_graded(tmp_path: Path, data_with_future_events: MarketData) -> None:
    claim = make_claim(tmp_path)
    when = date(2026, 1, 8)
    pred = build_prediction(claim, "shock_future", when, datetime(2026, 1, 5, tzinfo=UTC))
    assert grade_prediction(pred, data_with_future_events, NOW) is None
    last = data_with_future_events.as_of
    pred2 = build_prediction(claim, "shock_last_day", last, datetime(2026, 1, 1, tzinfo=UTC))
    assert grade_prediction(pred2, data_with_future_events, NOW) is None  # day +1 not observed


def test_hindsight_prediction_is_refused(market: MarketData, tmp_path: Path) -> None:
    claim = make_claim(tmp_path)
    event_id, when = shock_events(market)[2]
    late = datetime(when.year, when.month, when.day, tzinfo=UTC) + timedelta(days=30)
    pred = build_prediction(claim, event_id, when, late)  # written long after the window closed
    with pytest.raises(ScoreError, match="hindsight"):
        grade_prediction(pred, market, NOW)

    preds = tmp_path / "predictions"
    write_prediction(preds, pred)
    summary = grade_all(preds, tmp_path / "outcomes", market, NOW)
    assert summary.graded == [] and any("hindsight" in r for r in summary.refused)


def test_tampered_prediction_is_not_graded(market: MarketData, tmp_path: Path) -> None:
    claim = make_claim(tmp_path)
    event_id, when = shock_events(market)[1]
    preds = tmp_path / "predictions"
    path = freeze(claim, preds, event_id, when)
    record = json.loads(path.read_text())
    record["predicted_sign"] = "positive"  # flip the call after seeing the outcome
    path.write_text(json.dumps(record))
    summary = grade_all(preds, tmp_path / "outcomes", market, NOW)
    assert summary.graded == []
    assert any("verification" in r for r in summary.refused)


def test_grade_all_is_idempotent_and_append_only(market: MarketData, tmp_path: Path) -> None:
    claim = make_claim(tmp_path)
    preds, outs = tmp_path / "predictions", tmp_path / "outcomes"
    for event_id, when in shock_events(market)[:4]:
        freeze(claim, preds, event_id, when)
    first = grade_all(preds, outs, market, NOW)
    assert len(first.graded) == 4 and first.refused == []
    second = grade_all(preds, outs, market, NOW)
    assert second.graded == [] and second.already_graded == 4

    outcome = verify_outcomes(outs, preds)
    assert all(not c.problems for c in outcome)
    existing = next(iter(outs.rglob("*.json")))
    with pytest.raises(ScoreError, match="append-only"):
        write_outcome(outs, Outcome.model_validate_json(existing.read_text()))


def test_verify_outcomes_catches_tampering_and_broken_links(
    market: MarketData, tmp_path: Path
) -> None:
    claim = make_claim(tmp_path)
    preds, outs = tmp_path / "predictions", tmp_path / "outcomes"
    event_id, when = shock_events(market)[0]
    freeze(claim, preds, event_id, when)
    grade_all(preds, outs, market, NOW)
    path = next(outs.rglob("*.json"))

    record = json.loads(path.read_text())
    record["hit"] = not record["hit"]
    path.write_text(json.dumps(record))
    assert any("hash mismatch" in p for c in verify_outcomes(outs, preds) for p in c.problems)

    path.unlink()
    orphan = make_outcome(claim_id=claim.id, event_id="ghost")
    write_outcome(outs, orphan)
    assert any(
        "no matching prediction" in p for c in verify_outcomes(outs, preds) for p in c.problems
    )


# --- scoreboard pieces -------------------------------------------------------------------------


def test_wilson_interval_basics() -> None:
    assert wilson_interval(0, 0) is None
    lo, hi = wilson_interval(8, 10) or (0.0, 0.0)
    assert 0.4 < lo < 0.8 < hi < 1.0
    lo0, hi0 = wilson_interval(0, 10) or (1.0, 0.0)
    assert lo0 == 0.0 and 0 < hi0 < 0.4


@pytest.mark.parametrize(
    ("n", "lo", "hi", "mean", "sign", "q", "expected"),
    [
        (3, -0.02, -0.005, -0.01, "negative", 0.001, "Proposed"),
        (10, -0.02, -0.005, -0.01, "negative", 0.01, "Supported"),
        (10, -0.02, -0.005, -0.01, "negative", 0.20, "Inconclusive"),  # lost to the FDR step
        (10, -0.02, 0.01, -0.005, "negative", 0.5, "Inconclusive"),
        (10, 0.005, 0.02, 0.01, "negative", 0.01, "Not supported"),
        (10, -0.02, -0.005, -0.01, "positive", 0.01, "Not supported"),
    ],
)
def test_claim_status_table(
    n: int, lo: float, hi: float, mean: float, sign: str, q: float, expected: str
) -> None:
    assert claim_status(n, 8, lo, hi, mean, sign, q) == expected


def test_effective_outcomes_collapse_overlaps_and_drop_scheduled() -> None:
    d = date(2026, 3, 2)
    a = make_outcome(event_id="a", start=d)
    b = make_outcome(event_id="b", start=d + timedelta(days=1))  # overlaps a's two-day window
    c = make_outcome(event_id="c", start=d + timedelta(days=10))
    s = make_outcome(event_id="s", start=d + timedelta(days=20), scheduled_overlap=True)
    eff, n_sched, n_coll = effective_outcomes([c, s, b, a])
    assert [o.event_id for o in eff] == ["a", "c"]
    assert (n_sched, n_coll) == (1, 1)


def test_a_correction_supersedes_the_original() -> None:
    old = make_outcome(event_id="a", value=-0.05, hit=True)
    fix = make_outcome(event_id="a", value=0.02, hit=False, corrects=old.sha256)
    eff, _, _ = effective_outcomes([old, fix])
    assert [o.value for o in eff] == [0.02]


def test_calibration_bins_compare_stated_confidence_with_hit_rate() -> None:
    outs = [
        make_outcome(
            event_id=f"e{i}",
            start=date(2026, 3, 2) + timedelta(days=5 * i),
            confidence=0.9,
            hit=i < 7,
        )
        for i in range(10)
    ] + [make_outcome(event_id="u", confidence=None)]
    bins = calibration_bins(outs)
    top = next(b for b in bins if b["range"] == [0.9, 1.0])
    assert top["n"] == 10 and top["hit_rate"] == pytest.approx(0.7)
    assert top["mean_confidence"] == pytest.approx(0.9)
    assert sum(b["n"] for b in bins) == 10, "outcomes without a stated confidence are excluded"


# --- scoreboard end to end ---------------------------------------------------------------------


def graded_shocks(market: MarketData, claim: Claim, preds: Path, outs: Path) -> None:
    for event_id, when in shock_events(market):
        freeze(claim, preds, event_id, when)
    summary = grade_all(preds, outs, market, NOW)
    assert summary.refused == []


def test_scoreboard_supports_a_real_effect_and_rejects_the_wrong_sign(
    market: MarketData, tmp_path: Path
) -> None:
    good = make_claim(tmp_path, registered_by="alice")
    bad = make_claim(tmp_path, id="clm_syn_wrong_v1", expected_sign="positive", registered_by="bob")
    preds, outs = tmp_path / "predictions", tmp_path / "outcomes"
    graded_shocks(market, good, preds, outs)
    graded_shocks(market, bad, preds, outs)

    board = build_scoreboard([good, bad], outs)
    rows = {r["claim_id"]: r for r in board["claims"]}
    assert rows["clm_syn_shock_v1"]["status"] == "Supported"
    assert rows["clm_syn_shock_v1"]["beat_baseline"] is True
    assert rows["clm_syn_shock_v1"]["q_value"] < 0.05
    assert rows["clm_syn_wrong_v1"]["status"] == "Not supported"
    # Rules 0.2: the verdict rests on exactly the first min_events effective events; later events
    # are counted separately and never change it (no optional stopping).
    assert rows["clm_syn_shock_v1"]["effective_events"] == rows["clm_syn_shock_v1"]["min_events"]
    assert rows["clm_syn_shock_v1"]["events_after_verdict"] >= 12
    assert board["synthetic"] is True  # outcomes graded on fixtures are always labeled

    who = {c["registered_by"]: c for c in board["contributors"]}
    assert who["alice"]["share_supported"] == 1.0
    assert who["bob"]["share_supported"] == 0.0
    assert who["alice"]["small_sample"] == (who["alice"]["effective_events"] < SMALL_SAMPLE)
    assert board["placebo"]["alert"] is False


def test_scoreboard_proposed_until_enough_events_and_drafts_are_hidden(
    market: MarketData, tmp_path: Path
) -> None:
    claim = make_claim(tmp_path)
    draft = make_claim(tmp_path, id="clm_draft_v1", registered_at="set_by_ci_on_merge")
    preds, outs = tmp_path / "predictions", tmp_path / "outcomes"
    for event_id, when in clear_shock_events(market)[:3]:
        freeze(claim, preds, event_id, when)
    grade_all(preds, outs, market, NOW)

    board = build_scoreboard([claim, draft], outs)
    assert [r["claim_id"] for r in board["claims"]] == ["clm_syn_shock_v1"]
    row = board["claims"][0]
    assert row["status"] == "Proposed" and row["effective_events"] == 3
    assert board["contributors"][0]["small_sample"] is True
    assert "noisy" in board["contributors"][0]["small_sample_note"]


def test_a_placebo_that_works_raises_the_alert(market: MarketData, tmp_path: Path) -> None:
    # A "random date" claim pointed at dates with a real shock must trip the alarm.
    placebo = make_claim(
        tmp_path, id="clm_placebo_bad_v1", event_type="RANDOM_DATE", trigger_entities=["NONE"]
    )
    preds, outs = tmp_path / "predictions", tmp_path / "outcomes"
    graded_shocks(market, placebo, preds, outs)
    board = build_scoreboard([placebo], outs)
    assert board["claims"][0]["placebo"] is True
    assert board["placebo"]["alert"] is True
    assert "engine is broken" in board["placebo"]["message"]


def test_scoreboard_is_deterministic_and_json_safe(market: MarketData, tmp_path: Path) -> None:
    claim = make_claim(tmp_path)
    preds, outs = tmp_path / "predictions", tmp_path / "outcomes"
    graded_shocks(market, claim, preds, outs)
    a = build_scoreboard([claim], outs)
    b = build_scoreboard([claim], outs)
    assert a == b
    text = json.dumps(a, sort_keys=True, default=str)
    assert "NaN" not in text and "Infinity" not in text


def test_empty_scoreboard_has_no_nans() -> None:
    board = build_scoreboard([], Path("/nonexistent"))
    assert board["claims"] == [] and board["as_of"] is None
    assert all(not (isinstance(v, float) and math.isnan(v)) for v in board.values())


# --- CLI ---------------------------------------------------------------------------------------


def test_cli_grade_refuses_synthetic_data_unless_told_otherwise(tmp_path: Path) -> None:
    args = [
        "grade",
        "--data",
        str(FIXTURES),
        "--predictions",
        str(tmp_path / "p"),
        "--outcomes",
        str(tmp_path / "o"),
    ]
    refused = runner.invoke(app, args)
    assert refused.exit_code == 1 and "SYNTHETIC" in refused.output
    assert runner.invoke(app, [*args, "--allow-synthetic"]).exit_code == 0


def test_cli_grade_scoreboard_round_trip(market: MarketData, tmp_path: Path) -> None:
    claims = tmp_path / "claims"
    claims.mkdir()
    claim = make_claim(claims)
    preds, outs = tmp_path / "predictions", tmp_path / "outcomes"
    for event_id, when in shock_events(market)[:10]:
        freeze(claim, preds, event_id, when)
    g = runner.invoke(
        app,
        [
            "grade",
            "--data",
            str(FIXTURES),
            "--predictions",
            str(preds),
            "--outcomes",
            str(outs),
            "--allow-synthetic",
        ],
    )
    assert g.exit_code == 0 and "10 graded" in g.output

    v = runner.invoke(
        app, ["verify-outcomes", "--predictions", str(preds), "--outcomes", str(outs)]
    )
    assert v.exit_code == 0 and "10 outcome(s) checked" in v.output

    out = tmp_path / "scoreboard" / "scoreboard.json"
    s = runner.invoke(
        app,
        [
            "scoreboard",
            "--claims-dir",
            str(claims),
            "--outcomes",
            str(outs),
            "--out",
            str(out),
        ],
    )
    assert s.exit_code == 0, s.output
    board = json.loads(out.read_text())
    assert board["claims"][0]["claim_id"] == "clm_syn_shock_v1"
    assert board["synthetic"] is True


def test_a_prediction_without_price_data_is_left_open_not_fatal(
    market: MarketData, tmp_path: Path
) -> None:
    """One instrument with no prices must not stop the rest of the ledger from being graded."""
    good = make_claim(tmp_path)
    nodata = make_claim(
        tmp_path, id="clm_nodata_v1", instrument={"venue": "us_equity", "symbol": "NOPRICES"}
    )
    preds, outs = tmp_path / "predictions", tmp_path / "outcomes"
    for event_id, when in shock_events(market)[:3]:
        freeze(good, preds, event_id, when)
        freeze(nodata, preds, event_id, when)
    summary = grade_all(preds, outs, market, NOW)
    assert len(summary.graded) == 3 and summary.refused == []
    assert len(summary.ungradable) == 3 and "NOPRICES" in summary.ungradable[0]
    # They stay open: a later run with data will grade them.
    assert not (outs / "clm_nodata_v1").exists()

    result = runner.invoke(
        app,
        [
            "grade",
            "--data",
            str(FIXTURES),
            "--predictions",
            str(preds),
            "--outcomes",
            str(tmp_path / "o2"),
            "--allow-synthetic",
        ],
    )
    assert result.exit_code == 0, result.output
    assert "not graded, no data" in result.output


def test_a_verdict_cannot_change_after_its_fixed_sample(market: MarketData, tmp_path: Path) -> None:
    """Later events never move a verdict: grading more of them leaves status and interval alone."""
    claim = make_claim(tmp_path)
    preds, outs = tmp_path / "predictions", tmp_path / "outcomes"
    events = clear_shock_events(market)
    for event_id, when in events[: claim.success.min_forward_events]:
        freeze(claim, preds, event_id, when)
    grade_all(preds, outs, market, NOW)
    first = build_scoreboard([claim], outs)["claims"][0]
    for event_id, when in events[claim.success.min_forward_events :]:
        freeze(claim, preds, event_id, when)
    grade_all(preds, outs, market, NOW)
    later = build_scoreboard([claim], outs)["claims"][0]
    for key in ("status", "mean", "ci_lo", "ci_hi", "p_value", "q_value"):
        assert later[key] == first[key], key
    assert later["events_after_verdict"] > 0


def test_q_values_only_count_claims_that_finished_first() -> None:
    from datetime import date as d

    from spillover.scoreboard import completion_q_values

    early = completion_q_values({"a": (d(2027, 1, 1), 0.01)})
    both = completion_q_values({"a": (d(2027, 1, 1), 0.01), "b": (d(2027, 6, 1), 0.9)})
    assert both["a"] == early["a"]  # a claim finishing later cannot move an earlier verdict
