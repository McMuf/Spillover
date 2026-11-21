"""The News tab's outlet list: established outlets only, the first tier ranked ahead."""

import re
from pathlib import Path

from spillover.ingest.gdelt import QUERY, GdeltHeadline
from spillover.ingest.outlets import TIER_ONE, TIER_TWO, tier, trusted

ROOT = Path(__file__).resolve().parents[2]


def test_tiers_match_the_outlet_and_its_subdomains_only() -> None:
    assert tier("reuters.com") == 2 and tier("www.reuters.com") == 2 and tier("uk.reuters.com") == 2
    assert (
        tier("bbc.co.uk") == 2 and tier("finance.yahoo.com") == 1 and tier("theguardian.com") == 1
    )
    assert tier("timesofindia.indiatimes.com") == 0 and tier("economictimes.indiatimes.com") == 0
    assert tier("notreuters.com") == 0  # a look-alike name is not the outlet
    assert not set(TIER_ONE) & set(TIER_TWO)


def test_only_listed_outlets_are_kept_in_order() -> None:
    from datetime import UTC, datetime

    now = datetime(2026, 11, 21, tzinfo=UTC)

    def h(domain: str) -> GdeltHeadline:
        return GdeltHeadline(domain, "Stocks rise", f"https://{domain}/a", domain, now)

    got = trusted([h("indiatimes.com"), h("cnbc.com"), h("spam.example"), h("forbes.com")])
    assert [x.domain for x in got] == ["cnbc.com", "forbes.com"]


def test_the_search_api_asks_only_first_tier_outlets() -> None:
    for d in TIER_ONE:
        assert f"domain:{d}" in QUERY


def test_the_website_uses_the_same_lists() -> None:
    ts = (ROOT / "web" / "src" / "lib" / "outlets.ts").read_text()

    def listed(name: str) -> list[str]:
        block = re.search(rf"export const {name}[^=]*= \[(.*?)\];", ts, re.S)
        assert block, name
        return re.findall(r'"([^"]+)"', block.group(1))

    assert listed("TIER_ONE") == list(TIER_ONE)
    assert listed("TIER_TWO") == list(TIER_TWO)
