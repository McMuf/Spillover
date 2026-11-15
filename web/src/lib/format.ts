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
export function intervalText(lo: number | null, hi: number | null): string {
  return lo === null || hi === null ? "no interval (too few events)" : `[${pct(lo)}, ${pct(hi)}]`;
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
