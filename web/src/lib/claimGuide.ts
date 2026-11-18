import type { SiteData } from "../generated/site";
import { eventLabel, shortName } from "./plain";

export type TaxonomyEntry = SiteData["taxonomy"][number];
export type Origin = TaxonomyEntry["origin"];

export interface Check {
  level: "ok" | "warn" | "error";
  text: string;
}

/** The fewest forward events a claim may be graded on (the form's minimum). */
export const MIN_EVENTS = 8;

export const ORIGIN_LABEL: Record<Origin, string> = {
  filings: "From company SEC filings",
  headlines: "From news headlines",
  calendar: "Scheduled releases",
  prices: "From price moves",
  control: "Control test",
};

export const ORIGIN_ORDER: Origin[] = ["headlines", "filings", "calendar", "prices", "control"];

/** Event types grouped for a select, in a fixed order, most-used first within each group. */
export function groupedTypes(taxonomy: TaxonomyEntry[]): [Origin, TaxonomyEntry[]][] {
  return ORIGIN_ORDER.map((o): [Origin, TaxonomyEntry[]] => [
    o,
    taxonomy.filter((t) => t.origin === o).sort((a, b) => b.past_events - a.past_events || a.name.localeCompare(b.name)),
  ]).filter(([, ts]) => ts.length > 0);
}

export function eventTypeCheck(name: string, taxonomy: TaxonomyEntry[]): Check | null {
  if (!name) return null;
  const t = taxonomy.find((e) => e.name === name);
  if (!t) return { level: "error", text: `${name} is not an event type. Pick one from the list.` };
  if (t.origin === "control") {
    return {
      level: "warn",
      text: "This is the placebo control. A claim on random dates tests the engine itself, not an idea about markets.",
    };
  }
  const n = t.past_events;
  if (n >= MIN_EVENTS * 2) return { level: "ok", text: `${n} past events in the data, enough for a backtest.` };
  return {
    level: "warn",
    text:
      n === 0
        ? "No past events in the data yet, so there is no backtest. The claim can still be registered; it is graded on new events as they happen."
        : `Only ${n} past event${n === 1 ? "" : "s"} in the data, so the backtest will be thin. The claim is graded on new events either way.`,
  };
}

export function symbolCheck(symbol: string, priced: string[]): Check | null {
  const s = symbol.trim().toUpperCase();
  if (!s) return null;
  if (priced.includes(s)) return { level: "ok", text: `${s} is priced daily, so the claim can be graded.` };
  return {
    level: "warn",
    text: `${s} is not priced yet. Predictions still freeze when events happen, but they cannot be graded until a price source for ${s} is added.`,
  };
}

const MONTH = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const ONE_OFF: RegExp[] = [
  new RegExp(`\\b${MONTH}\\.? \\d{1,2}\\b`, "i"), // "March 3"
  new RegExp(`\\b\\d{1,2} ${MONTH}\\b`, "i"), // "3 March"
  /\b(?:19|20)\d{2}\b/, // a year
  /\b\d{4}-\d{2}-\d{2}\b/, // an ISO date
  /\b(?:today|yesterday|tomorrow|tonight|this (?:morning|week|month|year)|last (?:week|night|month)|right now)\b/i,
];

/** A hint when a statement reads like one specific story rather than a kind of event. */
export function oneOffHint(statement: string): Check | null {
  if (!ONE_OFF.some((r) => r.test(statement))) return null;
  return {
    level: "warn",
    text:
      "This sounds like one specific event (it names a date or a time). A claim is about a kind of event that keeps happening, so it can be tested again and again. Describe the kind of event instead; see the example above.",
  };
}

const WINDOW: Record<string, string> = {
  "+1_trading_day": "by the next trading day",
  "+3_trading_days": "within three trading days",
  "+5_trading_days": "within five trading days",
};

/** The claim in one plain sentence, built only from the form's fields. */
export function plainSentence(
  eventType: string,
  symbol: string,
  sign: "positive" | "negative",
  windowEnd: string,
  baseline: "factor_only" | "constant_mean",
): string | null {
  if (!eventType || !symbol.trim()) return null;
  const move = sign === "positive" ? "rises" : "falls";
  const versus = baseline === "factor_only" ? "more than the market explains" : "more than usual";
  return `When ${eventLabel(eventType)}, ${shortName(symbol.trim())} ${move} ${versus}, ${WINDOW[windowEnd] ?? windowEnd}.`;
}
