import type { ForwardRow, SiteClaim, SiteData } from "../generated/site";

const isRegistered = (c: SiteClaim) => c.claim.registered_at !== "set_by_ci_on_merge";

/**
 * Entry numbers in the order claims were frozen (registration time, then id). Superseded claims keep
 * their number, because the ledger is append-only; drafts have none until they are registered.
 */
export function entryNumbers(site: SiteData): Map<string, number> {
  const registered = site.claims
    .filter(isRegistered)
    .sort((a, b) => a.claim.registered_at.localeCompare(b.claim.registered_at) || a.claim.id.localeCompare(b.claim.id));
  return new Map(registered.map((c, i) => [c.claim.id, i + 1]));
}

/** Live entries (registered, not superseded), oldest first. */
export function ledger(site: SiteData): { no: number; item: SiteClaim }[] {
  const numbers = entryNumbers(site);
  return site.claims
    .filter((c) => !c.superseded_by && numbers.has(c.claim.id))
    .map((item) => ({ no: numbers.get(item.claim.id)!, item }))
    .sort((a, b) => a.no - b.no);
}

export interface LatestFreeze {
  no: number | undefined;
  item: SiteClaim;
  /** The newest frozen prediction, if the claim has one. */
  prediction: ForwardRow | undefined;
  /** When it was frozen: the prediction's time, or the claim's registration. */
  at: string;
}

/**
 * The most recent thing the ledger froze: the newest prediction from any registered claim (a
 * replaced version's predictions are still real records), else the newest live registration.
 */
export function latestFreeze(site: SiteData): LatestFreeze | undefined {
  const numbers = entryNumbers(site);
  let best: LatestFreeze | undefined;
  for (const item of site.claims) {
    if (!numbers.has(item.claim.id)) continue;
    for (const p of item.forward_log) {
      if (!best || p.created_at > best.at) best = { no: numbers.get(item.claim.id), item, prediction: p, at: p.created_at };
    }
  }
  if (best) return best;
  for (const item of site.claims) {
    if (item.superseded_by || !numbers.has(item.claim.id)) continue;
    const at = item.claim.registered_at;
    if (!best || at > best.at) best = { no: numbers.get(item.claim.id), item, prediction: undefined, at };
  }
  return best;
}

/** "21 Nov 2026, 04:17 UTC" from an ISO time. */
export function stampTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${hh}:${mm} UTC`;
}
