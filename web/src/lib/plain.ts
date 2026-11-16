import type { SiteClaim, SiteEvent } from "../generated/site";
import { instrumentName, NAME_BY_SYMBOL } from "./brands";
import { intervalText, pct } from "./format";

/** Topic labels for event types, shown as small grey chips. */
const CATEGORY: Record<string, string> = {
  EARNINGS_BEAT: "Earnings",
  EARNINGS_MISS: "Earnings",
  GUIDANCE_RAISE: "Earnings",
  GUIDANCE_CUT: "Earnings",
  CAPEX_RAISE: "AI & Tech",
  FCF_TURNS_NEGATIVE: "AI & Tech",
  TOKEN_UNLOCK: "Crypto",
  ACQUISITION_ANNOUNCED: "Deals",
  REGULATORY_ACTION: "Regulation",
  EXEC_DEPARTURE: "Leadership",
  FOMC_DECISION: "Fed & Macro",
  RANDOM_DATE: "Control test",
};

export function categoryOf(eventType: string): string {
  return CATEGORY[eventType] ?? "Markets";
}

const EVENT_LABEL: Record<string, string> = {
  EARNINGS_BEAT: "a company beats earnings expectations",
  EARNINGS_MISS: "a company misses earnings expectations",
  GUIDANCE_RAISE: "a company raises its outlook",
  GUIDANCE_CUT: "a company cuts its outlook",
  CAPEX_RAISE: "a company plans to spend more on equipment and data centers",
  FCF_TURNS_NEGATIVE: "a company's free cash flow turns negative",
  TOKEN_UNLOCK: "a batch of locked crypto tokens is released",
  ACQUISITION_ANNOUNCED: "an acquisition is announced",
  REGULATORY_ACTION: "a regulator acts against a company",
  EXEC_DEPARTURE: "a CEO or CFO leaves",
  FOMC_DECISION: "the Federal Reserve announces an interest-rate decision",
  RANDOM_DATE: "nothing in particular happens (a randomly chosen day)",
};

export function eventLabel(eventType: string): string {
  return EVENT_LABEL[eventType] ?? eventType.replace(/_/g, " ").toLowerCase();
}

/** Plural noun phrases for headlines: "Fed rate decisions make the S&P 500 swing more than usual". */
const EVENT_SHORT: Record<string, string> = {
  EARNINGS_BEAT: "earnings beats",
  EARNINGS_MISS: "earnings misses",
  GUIDANCE_RAISE: "raised outlooks",
  GUIDANCE_CUT: "cut outlooks",
  CAPEX_RAISE: "capex increases",
  FCF_TURNS_NEGATIVE: "negative free cash flow",
  TOKEN_UNLOCK: "token unlocks",
  ACQUISITION_ANNOUNCED: "acquisition news",
  REGULATORY_ACTION: "regulatory action",
  EXEC_DEPARTURE: "CEO and CFO exits",
  FOMC_DECISION: "Fed rate decisions",
  RANDOM_DATE: "random days",
};

/** How a symbol reads mid-sentence. Indices and funds take "the". */
const SHORT_NAME: Record<string, string> = {
  SPX: "the S&P 500",
  NASDAQ: "the Nasdaq",
  XLK: "the tech-sector ETF",
  MKT: "the market",
};

export function shortName(symbol: string): string {
  return SHORT_NAME[symbol.toUpperCase()] ?? instrumentName(symbol);
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A short, plain headline for a claim. The registered statement is always shown alongside it. */
export function shortHeadline(item: SiteClaim): string {
  const c = item.claim;
  const name = shortName(c.instrument.symbol);
  const ev = EVENT_SHORT[c.event_type] ?? c.event_type.replace(/_/g, " ").toLowerCase();
  if (c.event_type === "RANDOM_DATE") return `Placebo: does ${name} move on random days?`;
  if (c.measure === "abs_excess_return") return `${capitalize(ev)} make ${name} swing more than usual`;
  return c.expected_sign === "positive"
    ? `${capitalize(name)} beats the market after ${ev}`
    : `${capitalize(name)} lags the market after ${ev}`;
}

/** Names worth picking out in a headline: the market, and who triggers the event. */
export function highlightTerms(item: SiteClaim): string[] {
  const c = item.claim;
  const terms = [
    shortName(c.instrument.symbol).replace(/^the /, ""),
    instrumentName(c.instrument.symbol),
    c.instrument.symbol,
    ...c.trigger_entities.filter((e) => e !== "NONE").map((e) => NAME_BY_SYMBOL[e] ?? e),
  ];
  if (c.event_type === "FOMC_DECISION") terms.push("Fed", "FOMC");
  return [...new Set(terms.filter((t) => t.length > 1))];
}

/** "+1_trading_day" -> "the event day and the next trading day". */
export function windowWords(end: string): string {
  const m = /^\+(\d+)_trading_days?$/.exec(end);
  const n = m ? Number(m[1]) : 1;
  return n === 1 ? "the event day and the next trading day" : `the event day and the next ${n} trading days`;
}

/** What the claim measures, in words a non-specialist can follow. */
export function whatWeTest(item: SiteClaim): string {
  const c = item.claim;
  const name = shortName(c.instrument.symbol);
  const what =
    c.measure === "abs_excess_return"
      ? `${name} moves by more than it usually does, in either direction`
      : c.expected_sign === "positive"
        ? `${name} rises by more than the rest of the market explains`
        : `${name} falls by more than the rest of the market explains`;
  const against = c.baseline === "factor_only" ? "what the overall market already explains" : "its own normal day-to-day movement";
  return `Each time ${eventLabel(c.event_type)}, we check whether ${what} over ${windowWords(c.window.end)}, compared with ${against}.`;
}

export interface Verdict {
  headline: string;
  detail: string;
}

/** What the past data says, plainly. A backtest is practice, so it never reads as a result. */
export function whatPastDataSays(item: SiteClaim): Verdict {
  const b = item.backtest;
  if (!b) return { headline: "No backtest yet", detail: item.backtest_error ?? "There is not enough history to test this claim yet." };
  const clear = b.ci_lo !== null && b.ci_hi !== null && (b.ci_lo > 0 || b.ci_hi < 0);
  const name = shortName(item.claim.instrument.symbol);
  return clear
    ? {
        headline: `On ${b.n_effective} past events, ${name} showed a clear effect of ${pct(b.mean)}`,
        detail: `The range of plausible values, ${intervalText(b.ci_lo, b.ci_hi)}, does not include zero. That is a pattern in history, not proof it will repeat.`,
      }
    : {
        headline: `On ${b.n_effective} past events, any effect on ${name} was too small to tell apart from chance (${pct(b.mean)})`,
        detail: `The range of plausible values, ${intervalText(b.ci_lo, b.ci_hi)}, includes zero, so we cannot say there was a real effect.`,
      };
}

/** Claims worth showing first: ones with a result, then ones with a backtest, then the rest. */
export function trendingScore(item: SiteClaim): number {
  const graded = item.status === "Supported" || item.status === "Not supported" || item.status === "Inconclusive";
  return (graded ? 2_000_000 : 0) + (item.backtest ? 1_000_000 : 0) + (item.backtest?.n_effective ?? 0);
}

export function byTrending(claims: SiteClaim[]): SiteClaim[] {
  return [...claims].sort((a, b) => trendingScore(b) - trendingScore(a) || a.claim.id.localeCompare(b.claim.id));
}

const ACRONYMS: Record<string, string> = { fomc: "FOMC", fcf: "FCF", capex: "Capex", ceo: "CEO", cfo: "CFO" };

export function eventTitle(e: Pick<SiteEvent, "event_type">): string {
  const words = e.event_type.split("_").map((w) => w.toLowerCase());
  return capitalize(words.map((w) => ACRONYMS[w] ?? w).join(" "));
}

/** Who an event is about, as a reader would name them. */
export function entityName(e: Pick<SiteEvent, "entities" | "event_type">): string {
  const first = e.entities[0];
  if (!first || first === "NONE") return e.event_type === "RANDOM_DATE" ? "Placebo calendar" : "Unattributed";
  return NAME_BY_SYMBOL[first] ?? first;
}

/** A headline for an event card. */
export function eventHeadline(e: Pick<SiteEvent, "entities" | "event_type">): string {
  if (e.event_type === "FOMC_DECISION") return "Fed announces a rate decision";
  if (e.event_type === "RANDOM_DATE") return "Placebo day: nothing should happen";
  return `${entityName(e)}: ${eventTitle(e).toLowerCase()}`;
}

/** One plain sentence about an event, for the feed. */
export function eventSentence(e: Pick<SiteEvent, "entities" | "event_type" | "scheduled">): string {
  if (e.event_type === "FOMC_DECISION") return "The Federal Reserve announced its interest-rate decision. Scheduled in advance on the Fed's calendar.";
  if (e.event_type === "RANDOM_DATE") return "A randomly chosen control day. The engine should find no effect here; if it does, something is broken.";
  return `${capitalize(eventLabel(e.event_type))}${e.scheduled ? " (scheduled)" : ""}.`;
}
