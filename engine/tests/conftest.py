from pathlib import Path

import pytest

from spillover.data import MarketData, load_market_data

ROOT = Path(__file__).resolve().parents[2]
CLAIMS = ROOT / "claims"
FIXTURES = ROOT / "fixtures" / "synthetic"


@pytest.fixture(scope="session")
def market() -> MarketData:
    return load_market_data(FIXTURES)
