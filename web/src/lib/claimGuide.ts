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
  "+4_trading_days": "within a week",
  "+5_trading_days": "within five trading days",
  "+20_trading_days": "within a month",
};

/** The claim in one plain sentence, built only from the form's fields. */
export function plainSentence(
  eventType: string,
  symbol: string,
  sign: "positive" | "negative",
  windowEnd: string,
  baseline: "factor_only" | "constant_mean",
  swing = false,
): string | null {
  if (!eventType || !symbol.trim()) return null;
  if (swing) return `When ${eventLabel(eventType)}, ${shortName(symbol.trim())} moves more than usual in either direction, ${WINDOW[windowEnd] ?? windowEnd}.`;
  const move = sign === "positive" ? "rises" : "falls";
  const versus = baseline === "factor_only" ? "more than the market explains" : "more than usual";
  return `When ${eventLabel(eventType)}, ${shortName(symbol.trim())} ${move} ${versus}, ${WINDOW[windowEnd] ?? windowEnd}.`;
}

/*
 * Guardrails for vague or open-ended ideas. They are fixed rules anyone can read, applied the same way
 * to everyone, and they only check whether a claim CAN be tested, never whether it is right. No AI
 * model judges a claim before it is published.
 */

const QUESTION = /^\s*(will|would|could|does|do|did|is|are|can|should|might)\b|\?\s*$/i;
const DIRECTIONLESS = /\b(affects?|affected|impacts?|influences?|effects? on|changes?|moves? the market)\b/i;
const HAS_DIRECTION = /\b(rises?|rising|rose|up|gains?|climbs?|jumps?|falls?|falling|fell|drops?|down|declines?|sinks?|higher|lower|more|bigger|larger|less|smaller|swings?|volatil\w*)\b/i;
const HEDGE = /\b(might|may|could|possibly|perhaps|probably|maybe)\b/i;
const TARGET = /(\$\s?\d|\b\d+(\.\d+)?\s?(dollars|usd|%|percent)\b|\bto \d)/i;

/** Every guardrail that applies to the statement, most important first. */
export function vagueHints(statement: string): Check[] {
  const s = statement.trim();
  if (!s) return [];
  const out: Check[] = [];
  if (QUESTION.test(s)) {
    out.push({
      level: "warn",
      text: "This reads as a question. Questions are welcome on the Questions page; a claim states what you expect, like \"When X happens, Y falls within a week\". The steps below turn your question into one.",
    });
  }
  if (DIRECTIONLESS.test(s) && !HAS_DIRECTION.test(s)) {
    out.push({
      level: "warn",
      text: "Say which way. \"Affects\" or \"impacts\" can never be proved wrong; up, down, or bigger swings either way can. Step 5 asks for it.",
    });
  }
  if (HEDGE.test(s)) {
    out.push({
      level: "warn",
      text: "Drop the \"might\". A claim states the one direction you expect; whether you were right is what the market decides.",
    });
  }
  if (TARGET.test(s)) {
    out.push({
      level: "ok",
      text: "No price target needed: the claim is graded on whether the move beats a normal day in the direction you say, so a dollar figure or a percentage is not used.",
    });
  }
  const oneOff = oneOffHint(s);
  if (oneOff) out.push(oneOff);
  return out;
}

export type Direction = "up" | "down" | "swing";

/** Index-like series are their own market, so they are compared with their own normal day. */
const OWN_BASELINE = new Set(["SPX", "MKT", "USD", "USDJPY", "WTI"]);
const VENUE: Record<string, string> = { SPX: "us_index", NASDAQ: "us_index", MKT: "us_index", USD: "fx", USDJPY: "fx", WTI: "commodity" };

export function baselineFor(symbol: string): "factor_only" | "constant_mean" {
  return OWN_BASELINE.has(symbol.trim().toUpperCase()) ? "constant_mean" : "factor_only";
}

export function venueFor(symbol: string): string {
  return VENUE[symbol.trim().toUpperCase()] ?? "us_equity";
}

/** A claim id from the choices: clm_<kind>_<market>_<direction>_v1. */
export function suggestedId(eventType: string, symbol: string, direction: Direction): string {
  const part = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const kind = part(eventType).split("_").slice(0, 2).join("_") || "idea";
  const market = part(symbol) || "market";
  return `clm_${kind}_${market}_${direction}_v1`;
}

export const WINDOWS: { value: string; label: string; words: string }[] = [
  { value: "+1_trading_day", label: "Next day", words: "by the next trading day" },
  { value: "+4_trading_days", label: "Within 1 week", words: "within a week" },
  { value: "+20_trading_days", label: "Within 1 month", words: "within a month" },
];

/** A falsifier written from the choices, for people who are not sure how to word one. */
export function suggestedFalsifier(symbol: string, direction: Direction, minEvents: number): string {
  const name = shortName(symbol.trim() || "the market");
  if (direction === "swing") {
    return `After ${minEvents} new events, ${name}'s moves are not bigger than its ordinary moves of the same length (the interval for the size rank includes the typical 50% or lies below it).`;
  }
  const way = direction === "up" ? "above" : "below";
  return `After ${minEvents} new events, ${name}'s average abnormal move is not clearly ${way} zero (the 95% interval includes zero or lies on the other side).`;
}

/** What the claim needs before it can be submitted, in plain words, ticked off as it fills in. */
export function readiness(f: { statement: string; eventType: string; symbol: string; falsifier: string; handle: string }): { label: string; done: boolean }[] {
  return [
    { label: "Your idea in a sentence", done: f.statement.trim().length >= 10 },
    { label: "A kind of event that keeps happening", done: !!f.eventType },
    { label: "A market that should move", done: !!f.symbol.trim() },
    { label: "What would prove it wrong", done: f.falsifier.trim().length >= 10 },
    { label: "Your GitHub username", done: !!f.handle.trim() },
  ];
}
