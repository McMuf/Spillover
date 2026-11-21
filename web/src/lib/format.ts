import type { ScoreboardClaim, SiteClaim } from "../generated/site";

/** A fraction as a signed percent: 0.0083 -> "+0.83%". Missing values read "n/a", never 0. */
export function pct(x: number | null | undefined, digits = 2): string {
  if (x === null || x === undefined || Number.isNaN(x)) return "n/a";
  const v = x * 100;
  return `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(digits)}%`;
}

export function plainPct(x: number | null | undefined, digits = 0): string {
  if (x === null || x === undefined || Number.isNaN(x)) return "n/a";
  return `${(x * 100).toFixed(digits)}%`;
}

export function shortHash(hash: string, n = 12): string {
  return hash.slice(0, n);
}

export function venueLabel(venue: string): string {
  return venue.replace(/_/g, " ");
}

export function windowLabel(days: number): string {
  return `day 0 to +${days - 1}`;
}

export type Status = SiteClaim["status"];
export const STATUSES: readonly Status[] = ["Draft", "Proposed", "Supported", "Not supported", "Inconclusive"];

/** What an interval means in words, so numbers never stand alone. */
/** A size rank (rules 0.2 store rank minus one half) as a share of normal days: 0.22 -> "72%". */
export function rankPct(v: number): string {
  return `${Math.round(Math.min(1, Math.max(0, v + 0.5)) * 100)}%`;
}

/** The 95% range in the claim's own units: percent moves, or the share of normal days for swings. */
export function intervalText(lo: number | null, hi: number | null, measure?: string): string {
  if (lo === null || hi === null) return "no interval (too few events)";
  return measure === "abs_excess_return" ? `[${rankPct(lo)}, ${rankPct(hi)}]` : `[${pct(lo)}, ${pct(hi)}]`;
}

export function scoreboardRow(rows: ScoreboardClaim[], id: string): ScoreboardClaim | undefined {
  return rows.find((r) => r.claim_id === id);
}

/** The version is the trailing `_vN` of a claim id. */
export function claimVersion(id: string): number {
  const m = /_v(\d+)$/.exec(id);
  return m ? Number(m[1]) : 1;
}

export function citation(claimId: string, version: number, commit: string, repo: string): string {
  return `Spillover claim ${claimId} (v${version}), commit ${commit}, https://github.com/${repo}`;
}

export type Direction = "up" | "down" | "flat";

/** Up, down or flat, for coloring a market number green, red or grey. Missing values are flat. */
export function direction(x: number | null | undefined): Direction {
  if (x === null || x === undefined || Number.isNaN(x) || Math.abs(x) < 5e-5) return "flat";
  return x > 0 ? "up" : "down";
}

/** Text color for a market number by its sign. */
export function dirText(x: number | null | undefined): string {
  return { up: "text-positive", down: "text-negative", flat: "text-muted" }[direction(x)];
}

export interface Stat {
  /** The number as shown: "−0.66%" for a move; for a swing, the share of normal days that moved less. */
  value: string;
  /** For swings, what the number means ("of normal days moved less"); null for moves. */
  note: string | null;
  /** A two-word label for tight spaces: "bigger swing" or "smaller swing"; null for moves. */
  short: string | null;
  /** Number and note in one phrase, for chips and table cells. */
  text: string;
  cls: string;
  dir: Direction;
}

/**
 * A claim's statistic as text and colour. Above zero is green, below zero is red, everywhere. A claim
 * that measures swing size ("moves more than usual", measure abs_excess_return) is a rank (rules 0.2):
 * "72% of normal days moved less", green above the typical 50% and red below, never read as a fall.
 */
export function claimStat(measure: string, v: number | null | undefined): Stat {
  if (v === null || v === undefined || Number.isNaN(v)) return { value: "n/a", note: null, short: null, text: "n/a", cls: "text-muted", dir: "flat" };
  if (measure === "abs_excess_return") {
    const value = rankPct(v);
    const note = "of normal days moved less";
    const short = `${v >= 0 ? "bigger" : "smaller"} swing`;
    return { value, note, short, text: `${value} ${note}`, cls: dirText(v), dir: direction(v) };
  }
  return { value: pct(v), note: null, short: null, text: pct(v), cls: dirText(v), dir: direction(v) };
}
