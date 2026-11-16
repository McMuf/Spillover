"""The company name and ticker snapshot the rule-based labeler uses (``labels/companies.json``).

Built from Wikidata (CC0, public domain): companies with a current listing on the NYSE or Nasdaq
and the ticker of that listing. The snapshot is committed, so labels never change because a
website changed; refresh it on purpose with ``spillover company-names``.
"""

from __future__ import annotations

import json
import re
import urllib.parse
from pathlib import Path

from spillover.ingest.http import Fetcher

WIKIDATA_SPARQL = "https://query.wikidata.org/sparql"
NYSE, NASDAQ = "Q13677", "Q82059"
QUERY = f"""
SELECT ?itemLabel ?ticker WHERE {{
  VALUES ?exchange {{ wd:{NYSE} wd:{NASDAQ} }}
  ?item p:P414 ?listing .
  ?listing ps:P414 ?exchange ; pq:P249 ?ticker .
  FILTER NOT EXISTS {{ ?listing pq:P582 ?delisted }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
}}
"""
_TICKER = re.compile(r"^[A-Z][A-Z0-9.\-]{0,9}$")
_QID = re.compile(r"^Q[0-9]+$")


def parse_companies(payload: str) -> list[dict[str, str]]:
    """Sorted, de-duplicated {ticker, name} rows; entries without an English name are dropped."""
    rows = json.loads(payload)["results"]["bindings"]
    by_ticker: dict[str, str] = {}
    for r in rows:
        ticker = r["ticker"]["value"].strip().upper()
        name = r["itemLabel"]["value"].strip()
        if not _TICKER.match(ticker) or not name or _QID.match(name):
            continue
        by_ticker[ticker] = min(name, by_ticker.get(ticker, name))  # stable choice of one name
    return [{"ticker": t, "name": n} for t, n in sorted(by_ticker.items())]


def fetch_companies(fetch: Fetcher) -> list[dict[str, str]]:
    url = WIKIDATA_SPARQL + "?" + urllib.parse.urlencode({"query": QUERY, "format": "json"})
    return parse_companies(fetch(url))


def write_companies(path: Path, rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(rows, indent=0, ensure_ascii=False) + "\n", encoding="utf-8")
