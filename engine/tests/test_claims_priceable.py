"""The scheduled scoring job can only grade claims whose prices it can fetch."""

from pathlib import Path

from spillover.ingest.config import load_config
from spillover.models import claim_files, load_claim

ROOT = Path(__file__).resolve().parents[2]

# Registered claims cannot be edited, so a claim that turned out to be unpriceable is superseded
# by a new version instead. List only superseded claims here, with the reason.
SUPERSEDED = {
    "clm_placebo_random_dates_v1": "traded XLK, which the CI price config has no source for; see v2",
}


def test_every_live_claim_can_be_priced_by_the_ci_config() -> None:
    available = {s.symbol for s in load_config(ROOT / "data" / "sources.ci.toml").series}
    problems: list[str] = []
    for path in claim_files(ROOT / "claims"):
        claim = load_claim(path)
        if claim.id in SUPERSEDED:
            continue
        needed = set(claim.instrument.members) | set(claim.factor_names)
        missing = needed - available
        if missing:
            problems.append(
                f"{claim.id} needs {sorted(missing)} but data/sources.ci.toml has {sorted(available)}"
            )
    assert not problems, "\n".join(problems)


def test_superseded_claims_are_really_superseded() -> None:
    """A claim may only be excused if a newer version of it exists."""
    ids = {load_claim(p).id for p in claim_files(ROOT / "claims")}
    for old in SUPERSEDED:
        assert old in ids, f"{old} is listed as superseded but no longer exists"
        stem, _, version = old.rpartition("_v")
        assert f"{stem}_v{int(version) + 1}" in ids, f"{old} is excused but has no successor"
