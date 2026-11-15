import shutil
from datetime import date
from pathlib import Path

import polars as pl
import pytest

from spillover.data import MarketData, load_market_data

ROOT = Path(__file__).resolve().parents[2]
CLAIMS = ROOT / "claims"
FIXTURES = ROOT / "fixtures" / "synthetic"


@pytest.fixture(scope="session")
def market() -> MarketData:
    return load_market_data(FIXTURES)


@pytest.fixture
def data_with_future_events(tmp_path: Path) -> MarketData:
    """Fixture data plus three SYN_SHOCK events: one before registration is not needed (the
    fixtures already have those), one after the data ends, one on the last data day."""
    root = tmp_path / "data"
    shutil.copytree(FIXTURES, root)
    events = pl.read_parquet(root / "events.parquet")
    last = load_market_data(root).as_of
    extra = pl.DataFrame(
        {
            "event_id": ["shock_future", "shock_last_day"],
            "event_type": ["SYN_SHOCK", "SYN_SHOCK"],
            "entity": ["SYNCO", "SYNCO"],
            "date": [date(2026, 1, 8), last],
            "scheduled": [False, False],
            "source": ["test", "test"],
        },
        schema=events.schema,
    )
    pl.concat([events, extra]).write_parquet(root / "events.parquet")
    return load_market_data(root)
