import type { GoldLabel, LabelCandidate } from "../generated/site";

/** One person's answer for one headline, kept in the browser until downloaded. */
export interface Draft {
  type: string; // an event type name, "NONE", or "" for not labeled yet
  entities: string; // tickers as typed, e.g. "COIN, axp"
}

const TICKER = /^[A-Z0-9][A-Z0-9._-]{0,31}$/;

/** "coin, AXP ,," -> ["AXP", "COIN"]; bad pieces are reported, never silently dropped. */
export function parseTickers(raw: string): { tickers: string[]; bad: string[] } {
  const parts = raw
    .split(/[\s,;]+/)
    .map((p) => p.trim().toUpperCase())
    .filter(Boolean);
  const bad = parts.filter((p) => !TICKER.test(p));
  const tickers = [...new Set(parts.filter((p) => TICKER.test(p)))].sort();
  return { tickers, bad };
}

/** Rows ready for labels/gold.jsonl: the existing labels first, then the new ones. */
export function goldRows(existing: GoldLabel[], candidates: LabelCandidate[], drafts: Record<string, Draft>): GoldLabel[] {
  const rows: GoldLabel[] = existing.map((g) => ({ ...g, expected_entities: [...g.expected_entities] }));
  const seen = new Set(rows.map((r) => `${r.source}\u0000${r.title}`));
  for (const c of candidates) {
    const d = drafts[c.headline_id];
    if (!d || !d.type) continue;
    const key = `${c.source}\u0000${c.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      title: c.title,
      source: c.source,
      expected_type: d.type,
      expected_entities: d.type === "NONE" ? [] : parseTickers(d.entities).tickers,
    });
  }
  return rows;
}

/** JSON Lines with a fixed key order, so the same labels always give the same file (and hash). */
export function toJsonl(rows: GoldLabel[]): string {
  return rows
    .map((r) =>
      JSON.stringify({
        title: r.title,
        source: r.source,
        expected_type: r.expected_type,
        expected_entities: r.expected_entities,
      }),
    )
    .join("\n")
    .concat(rows.length ? "\n" : "");
}

const KEY = "spillover:gold-drafts:v1";

/** Drafts survive a reload in this browser only. Storage can be unavailable; then they just don't. */
export function loadDrafts(): Record<string, Draft> {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? (parsed as Record<string, Draft>) : {};
  } catch {
    return {};
  }
}

export function saveDrafts(drafts: Record<string, Draft>): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(drafts));
  } catch {
    /* private mode or storage blocked: labels still work until the page is closed */
  }
}
