import { useEffect, useRef, useState } from "react";
import type { SiteData } from "../generated/site";

export type Headline = SiteData["headlines"][number];

/**
 * Live headlines, fetched by the browser from the GDELT Project when the page is open (free "for any
 * academic, commercial, or governmental use", with a citation). The same query and filters as the
 * engine's build-time fetch (engine/spillover/ingest/gdelt.py), kept in step by tests on both sides.
 * Testable tags come only from the build, where the labeler runs; a headline newer than the last
 * build is shown untagged until the next one.
 */
export const GDELT_QUERY =
  '(stocks OR "stock market" OR earnings OR merger OR acquisition OR bankruptcy OR layoffs OR ' +
  'cyberattack OR outage OR recall OR tariff OR "interest rate" OR inflation OR CEO OR SEC OR ' +
  '"Federal Reserve") sourcelang:english';

export function gdeltUrl(): string {
  const q = new URLSearchParams({ query: GDELT_QUERY, mode: "artlist", format: "json", maxrecords: "75", timespan: "1d", sort: "datedesc" });
  return `https://api.gdeltproject.org/api/v2/doc/doc?${q.toString()}`;
}

const SPAM = /\b(shareholder|investor)s?\s+alert\b|lead plaintiff|class action|deadline alert|\binvestigation on behalf of\b/i;
const MARKET =
  /\b(stocks?|shares?|markets?|investors?|earnings|profits?|revenue|sales|guidance|forecast|merger|acquisitions?|acquires?|buyout|deal|bankruptcy|layoffs?|jobs|hiring|ceo|cfo|chief executive|board|tariffs?|trade|inflation|interest rates?|rates?|fed|federal reserve|central bank|economy|economic|recession|gdp|bonds?|yields?|dollar|oil|prices?|cyberattack|hack(ed|ers)?|breach|outages?|disruptions?|grounded|airlines?|flights?|tech|technology|recall|antitrust|lawsuit|regulators?|sec|ftc|ipo|dividend|chips?|semiconductors?|banks?|crypto|bitcoin|ai)\b/i;

export function tidy(title: string): string {
  return title
    .replace(/\s+([,.:;!?%)])/g, "$1")
    .replace(/([(])\s+/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s+[|]\s+[^|]{1,60}$/, "")
    .slice(0, 300);
}

const key = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

interface Article {
  url?: unknown;
  title?: unknown;
  seendate?: unknown;
  domain?: unknown;
  socialimage?: unknown;
}

/** GDELT's article list, filtered like the build: https only, no spam, about markets, no repeats. */
export function parseGdelt(body: unknown, known: Headline[]): Headline[] {
  const articles = (body as { articles?: unknown }).articles;
  if (!Array.isArray(articles)) throw new Error("GDELT's response has no article list");
  const byUrl = new Map(known.map((h) => [h.url, h]));
  const seen = new Set<string>();
  const out: Headline[] = [];
  for (const raw of articles as Article[]) {
    const url = String(raw.url ?? "").trim();
    const title = tidy(String(raw.title ?? ""));
    const domain = String(raw.domain ?? "").trim().toLowerCase().slice(0, 100);
    const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(String(raw.seendate ?? ""));
    if (!m || !title || !domain || !url.startsWith("https://") || url.length > 500 || SPAM.test(title)) continue;
    const k = key(title);
    if (seen.has(k)) continue;
    seen.add(k);
    const tagged = byUrl.get(url);
    if (!tagged && !MARKET.test(title)) continue;
    const image = String(raw.socialimage ?? "").trim();
    out.push({
      headline_id: tagged?.headline_id ?? `live-${k.slice(0, 40)}`,
      title,
      url,
      domain,
      seen_at: `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`,
      image: image.startsWith("https://") && image.length <= 500 ? image : (tagged?.image ?? null),
      event_type: tagged?.event_type ?? "NONE",
      entities: tagged?.entities ?? [],
      confidence: tagged?.confidence ?? "low",
    });
    if (out.length >= 50) break;
  }
  return out;
}

export interface LiveNews {
  headlines: Headline[];
  /** "live": fetched from GDELT just now; "build": GDELT was unreachable, so the build's copy. */
  source: "live" | "build";
  /** Headlines that arrived since the page opened, for a one-time arrival animation. */
  fresh: Set<string>;
  updatedAt: number | null;
  /** True once the first live attempt has finished, whether it worked or not. */
  checked: boolean;
}

export const LIVE_NEWS_MS = 5 * 60 * 1000;

export function useLiveNews(site: SiteData, everyMs = LIVE_NEWS_MS): LiveNews {
  const [state, setState] = useState<LiveNews>({ headlines: site.headlines, source: "build", fresh: new Set(), updatedAt: null, checked: false });
  const known = useRef(site.headlines);
  known.current = site.headlines;
  useEffect(() => {
    let alive = true;
    let ids = new Set<string>();
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(gdeltUrl(), { referrerPolicy: "no-referrer" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const list = parseGdelt(await res.json(), known.current);
        if (!alive || list.length === 0) return;
        const fresh = new Set(ids.size ? list.filter((h) => !ids.has(h.headline_id)).map((h) => h.headline_id) : []);
        ids = new Set(list.map((h) => h.headline_id));
        setState({ headlines: list, source: "live", fresh, updatedAt: Date.now(), checked: true });
      } catch {
        // Unreachable, rate-limited or blocked: keep showing what we have (the build's copy at first).
        if (alive) setState((s) => (s.checked ? s : { ...s, checked: true }));
      }
    };
    void load();
    const id = window.setInterval(() => void load(), everyMs);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [everyMs]);
  return state;
}
