/**
 * Which news outlets the News tab shows: established, mostly Western financial and general news.
 * The same lists as the engine (engine/spillover/ingest/outlets.py), kept identical by a test. The
 * first tier is ranked ahead of the second; anything else is left out.
 */

export const TIER_ONE: readonly string[] = [
  "bloomberg.com",
  "wsj.com",
  "reuters.com",
  "ft.com",
  "economist.com",
  "nytimes.com",
  "cnbc.com",
  "marketwatch.com",
  "barrons.com",
  "apnews.com",
  "bbc.com",
  "bbc.co.uk",
  "cnn.com",
];

export const TIER_TWO: readonly string[] = [
  "washingtonpost.com",
  "theguardian.com",
  "axios.com",
  "politico.com",
  "fortune.com",
  "forbes.com",
  "businessinsider.com",
  "finance.yahoo.com",
  "foxbusiness.com",
  "npr.org",
  "cbsnews.com",
  "nbcnews.com",
  "abcnews.go.com",
  "usatoday.com",
  "latimes.com",
  "semafor.com",
  "morningstar.com",
  "investors.com",
  "techcrunch.com",
  "theverge.com",
  "wired.com",
  "arstechnica.com",
  "theglobeandmail.com",
  "telegraph.co.uk",
  "afr.com",
];

const matches = (domain: string, outlet: string) => domain === outlet || domain.endsWith("." + outlet);

/** 2 for a first-tier outlet, 1 for a second-tier one, 0 for anything else. */
export function outletTier(domain: string): number {
  const d = domain.trim().toLowerCase();
  if (TIER_ONE.some((o) => matches(d, o))) return 2;
  if (TIER_TWO.some((o) => matches(d, o))) return 1;
  return 0;
}
