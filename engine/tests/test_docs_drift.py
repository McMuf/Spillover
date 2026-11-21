"""Words on the website that restate engine constants must not drift from the code."""

from pathlib import Path

from spillover.eventstudy import EST_GAP, EST_LEN, MIN_EST_DAYS
from spillover.models import MIN_FORWARD_EVENTS_FLOOR

ROOT = Path(__file__).resolve().parents[2]
METHOD = (ROOT / "web" / "src" / "pages" / "Method.tsx").read_text()


def test_the_method_page_states_the_engines_real_constants() -> None:
    assert f"{EST_LEN} trading days" in METHOD, "estimation window length"
    assert f"{EST_GAP} trading days before day 0" in METHOD, "gap before the event"
    assert f"at least {MIN_EST_DAYS} clean days" in METHOD, "clean estimation days"
    assert "Student" in METHOD and "t-interval" in METHOD, "the interval method"


def test_the_method_page_uses_the_real_status_names() -> None:
    for status in ("Draft", "Proposed", "Supported", "Not supported", "Inconclusive"):
        assert f">{status}<" in METHOD or f"{status}</dt>" in METHOD, status


def test_the_claim_floor_is_still_what_the_readme_template_says() -> None:
    assert MIN_FORWARD_EVENTS_FLOOR == 8
    assert "min_forward_events: 8" in (ROOT / "claims" / "_template.yaml").read_text()


def test_the_citation_file_names_the_current_version() -> None:
    import tomllib

    version = tomllib.loads((ROOT / "pyproject.toml").read_text())["project"]["version"]
    assert f'version: "{version}"' in (ROOT / "CITATION.cff").read_text()


def test_the_doi_is_the_same_in_the_citation_file_and_the_readme() -> None:
    import re

    cff = (ROOT / "CITATION.cff").read_text()
    doi = re.search(r'^doi: "(10\.5281/zenodo\.\d+)"', cff, re.MULTILINE)
    assert doi, "CITATION.cff names a DOI"
    assert f"https://doi.org/{doi.group(1)}" in (ROOT / "README.md").read_text()
