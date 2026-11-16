import type { SiteClaim, SiteEvent } from "../generated/site";
import type { CategoryHue } from "../design/tokens";
import { instrumentName } from "./brands";
import { intervalText, pct } from "./format";

export interface Category {
  name: string;
  hue: CategoryHue;
}

const CATEGORY: Record<string, Category> = {
  EARNINGS_BEAT: { name: "Earnings", hue: "catBlue" },
  EARNINGS_MISS: { name: "Earnings", hue: "catBlue" },
  GUIDANCE_RAISE: { name: "Earnings", hue: "catBlue" },
  GUIDANCE_CUT: { name: "Earnings", hue: "catBlue" },
  CAPEX_RAISE: { name: "AI & Tech", hue: "catCyan" },
  FCF_TURNS_NEGATIVE: { name: "AI & Tech", hue: "catCyan" },
  TOKEN_UNLOCK: { name: "Crypto", hue: "catOrange" },
  ACQUISITION_ANNOUNCED: { name: "Deals", hue: "catPink" },
  REGULATORY_ACTION: { name: "Regulation", hue: "catYellow" },
  EXEC_DEPARTURE: { name: "Leadership", hue: "catPink" },
  FOMC_DECISION: { name: "Fed & Macro", hue: "catPurple" },
  RANDOM_DATE: { name: "Control test", hue: "catCyan" },
};

export function categoryOf(eventType: string): Category {
  return CATEGORY[eventType] ?? { name: "Markets", hue: "catBlue" };
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

/** "+1_trading_day" -> "the event day and the next trading day". */
export function windowWords(end: string): string {
  const m = /^\+(\d+)_trading_days?$/.exec(end);
  const n = m ? Number(m[1]) : 1;
  return n === 1 ? "the event day and the next trading day" : `the event day and the next ${n} trading days`;
}

/** What the claim measures, in words a non-specialist can follow. */
export function whatWeTest(item: SiteClaim): string {
  const c = item.claim;
  const name = instrumentName(c.instrument.symbol);
  const what =
    c.measure === "abs_excess_return"
      ? `${name} moves by more than it usually does, in either direction`
      : c.expected_sign === "positive"
        ? `${name} rises by more than the rest of the market explains`
        : `${name} falls by more than the rest of the market explains`;
  const against =
    c.baseline === "factor_only"
      ? "what the overall market already explains"
      : "its own normal day-to-day movement";
  return `Each time ${eventLabel(c.event_type)}, we check whether ${what} over ${windowWords(c.window.end)}, compared with ${against}.`;
}

export interface Verdict {
  headline: string;
  detail: string;
  /** True only when real forward evidence supports a verdict; backtests are never graded. */
  graded: boolean;
}

/** What the past data says, plainly. A backtest is practice, so it never reads as a result. */
export function whatPastDataSays(item: SiteClaim): Verdict {
  const b = item.backtest;
  if (!b) {
    return { headline: "No backtest yet", detail: item.backtest_error ?? "There is not enough history to test this claim yet.", graded: false };
  }
  const clear = b.ci_lo !== null && b.ci_hi !== null && (b.ci_lo > 0 || b.ci_hi < 0);
  const name = instrumentName(item.claim.instrument.symbol);
  const size = pct(b.mean);
  const headline = clear
    ? `On ${b.n_effective} past events, ${name} showed a clear effect (${size})`
    : `On ${b.n_effective} past events, any effect on ${name} was too small to tell apart from chance (${size})`;
  const detail = clear
    ? `The range of plausible values, ${intervalText(b.ci_lo, b.ci_hi)}, does not include zero. That is a pattern in history, not proof it will repeat.`
    : `The range of plausible values, ${intervalText(b.ci_lo, b.ci_hi)}, includes zero, so we cannot say there was a real effect.`;
  return { headline, detail, graded: false };
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

export function eventTitle(e: SiteEvent): string {
  const words = e.event_type.split("_").map((w) => w.toLowerCase());
  const title = words.map((w) => ACRONYMS[w] ?? w).join(" ");
  return title.charAt(0).toUpperCase() + title.slice(1);
}
