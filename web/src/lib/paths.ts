import type { SiteClaim, SiteData } from "../generated/site";
import { instrumentName, NAME_BY_SYMBOL } from "./brands";
import { claimStat, intervalText, pct, venueLabel, windowLabel } from "./format";
import { categoryOf, eventTitle } from "./plain";

/**
 * A claim as a chain you can read left to right: who triggers it, what kind of event, which market,
 * plus what it is measured against, the rules applied, and the frozen predictions.
 * Uses the same six node types as before (entity, event, instrument, factor, condition, prediction).
 */
export interface ClaimPath {
  triggers: { id: string; name: string }[];
  event: { type: string; title: string; topic: string; count: number; latest: { id: string; date: string } | null };
  market: { symbol: string; name: string; venue: string; basket: string[] };
  /** The spillover itself. Carries all five facts: estimate, interval, sample size, window, as-of. */
  effect: { estimate: string; interval: string; n: number; window: string; days: number; asOf: string; summary: string; lowSample: boolean } | null;
  /** What is subtracted out: one or more factor series (empty when compared with its own normal movement). */
  controls: { symbol: string; name: string }[];
  rules: string[];
  predictions: {
    needed: number;
    total: number;
    recent: { eventId: string; date: string; outcome: "hit" | "miss" | "open" }[];
  };
}

/** The factor series a claim subtracts out, in order. Mirrors the engine's Claim.factor_names. */
export function factorNames(c: SiteClaim["claim"]): string[] {
  if (c.baseline !== "factor_only") return [];
  return c.factors && c.factors.length > 0 ? [...c.factors] : [c.factor];
}

/** The five things every number on a relationship must show, in one line. */
export function edgeLabel(c: SiteClaim): string | undefined {
  const b = c.backtest;
  if (!b) return undefined;
  return [`${pct(b.mean)} ${intervalText(b.ci_lo, b.ci_hi)}`, `${b.n_effective} events`, windowLabel(b.window_days), `backtest as of ${b.as_of}`].join(", ");
}

export function claimPath(item: SiteClaim, site: SiteData): ClaimPath {
  const c = item.claim;
  const b = item.backtest;
  const matching = site.events.filter((e) => item.event_ids.includes(e.event_id)).sort((x, y) => y.date.localeCompare(x.date));
  const latest = matching[0];

  const rules = [
    "Events that overlap another scheduled event are left out, so one day's news is not mistaken for another's.",
    "Overlapping windows are merged, so no trading day counts twice.",
    `At least ${c.success.min_forward_events} events after registration are needed before a verdict.`,
  ];
  if (c.measure === "abs_excess_return") rules.unshift("Measures the size of the move in either direction, not whether it went up or down.");

  return {
    triggers: c.trigger_entities.filter((t) => t !== "NONE").map((t) => ({ id: t, name: NAME_BY_SYMBOL[t] ?? t })),
    event: {
      type: c.event_type,
      title: eventTitle(c),
      topic: categoryOf(c.event_type),
      count: item.event_ids.length,
      latest: latest ? { id: latest.event_id, date: latest.date } : null,
    },
    market: {
      symbol: c.instrument.symbol,
      name: instrumentName(c.instrument.symbol),
      venue: venueLabel(c.instrument.venue),
      basket: c.instrument.basket ?? [],
    },
    effect: b
      ? {
          estimate: claimStat(c.measure, b.mean).text,
          interval: intervalText(b.ci_lo, b.ci_hi, c.measure),
          n: b.n_effective,
          window: windowLabel(b.window_days),
          days: b.window_days,
          asOf: b.as_of,
          summary: edgeLabel(item) ?? "",
          lowSample: b.n_effective < c.success.min_forward_events,
        }
      : null,
    controls: factorNames(c).map((f) => ({ symbol: f, name: instrumentName(f) })),
    rules,
    predictions: {
      needed: c.success.min_forward_events,
      total: item.forward_log.length,
      recent: item.forward_log.slice(-5).map((f) => ({
        eventId: f.event_id,
        date: f.event_date,
        outcome: f.status === "graded" ? (f.hit ? "hit" : "miss") : "open",
      })),
    },
  };
}
