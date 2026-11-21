import type { SiteClaim, SiteData } from "../generated/site";
import { commentsOn, discussionTerm } from "./community";
import { categoryOf, eventLabel } from "./plain";

/**
 * How claims are ordered, with every rule stated on the page. No votes, no popularity loop: the
 * default is a plain catalogue by kind of event, and every other order uses a fact anyone can check
 * (a scheduled date, a count of past events, a registration date, a comment count). Nothing here
 * ever changes a result.
 */
export type SortKey = "kind" | "next" | "evidence" | "newest" | "discussed";

export const SORTS: { key: SortKey; label: string; rule: string }[] = [
  { key: "kind", label: "By kind of event", rule: "Grouped by kind of event, then A to Z by market. Nothing is pushed up or down." },
  { key: "next", label: "Next to be tested", rule: "Soonest scheduled event first (from the release calendar). Claims on unscheduled events come after, A to Z." },
  { key: "evidence", label: "Most evidence", rule: "Most past events in the backtest first. More events mean narrower ranges, not a better idea." },
  { key: "newest", label: "Newest", rule: "Most recently registered first; drafts last." },
  { key: "discussed", label: "Most discussed", rule: "Most comments on the claim's discussion first. Comments never change a result." },
];

const byName = (a: SiteClaim, b: SiteClaim) => a.claim.instrument.symbol.localeCompare(b.claim.instrument.symbol) || a.claim.id.localeCompare(b.claim.id);

/** The date of each claim's next scheduled event, from the calendar of upcoming events. */
export function nextEventDate(site: SiteData): Map<string, string> {
  const out = new Map<string, string>();
  for (const s of [...site.upcoming].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const id of s.claim_ids) if (!out.has(id)) out.set(id, s.date);
  }
  return out;
}

export function sortClaims(claims: SiteClaim[], key: SortKey, site: SiteData): SiteClaim[] {
  const list = [...claims];
  switch (key) {
    case "kind":
      return list.sort((a, b) => categoryOf(a.claim.event_type).localeCompare(categoryOf(b.claim.event_type)) || eventLabel(a.claim.event_type).localeCompare(eventLabel(b.claim.event_type)) || byName(a, b));
    case "next": {
      const next = nextEventDate(site);
      return list.sort((a, b) => (next.get(a.claim.id) ?? "9999").localeCompare(next.get(b.claim.id) ?? "9999") || byName(a, b));
    }
    case "evidence":
      return list.sort((a, b) => (b.backtest?.n_effective ?? -1) - (a.backtest?.n_effective ?? -1) || byName(a, b));
    case "newest": {
      const at = (c: SiteClaim) => (/^\d{4}-/.test(c.claim.registered_at) ? c.claim.registered_at : "0000");
      return list.sort((a, b) => at(b).localeCompare(at(a)) || byName(a, b));
    }
    case "discussed": {
      const n = (c: SiteClaim) => commentsOn(site.community, discussionTerm("claim", c.claim.id));
      return list.sort((a, b) => n(b) - n(a) || byName(a, b));
    }
  }
}
