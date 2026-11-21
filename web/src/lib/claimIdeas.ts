import { NAME_BY_SYMBOL } from "./brands";
import type { Direction } from "./claimGuide";
import type { Headline } from "./liveNews";
import { eventLabel, shortName } from "./plain";

/**
 * Claim ideas from a headline, by fixed rules anyone can read (no AI model): the company the news is
 * about, the companies it might spill over to, and the listed backers of an unlisted company. Each
 * idea is only a starting point that opens the claim form partly filled in; the person decides.
 */
export interface ClaimIdea {
  title: string;
  why: string;
  /** Query string for #/submit. */
  href: string;
}

/** The direction people usually expect for each kind of event. "swing" when it could go either way. */
const TYPICAL: Record<string, Direction> = {
  EARNINGS_BEAT: "up",
  EARNINGS_MISS: "down",
  GUIDANCE_RAISE: "up",
  GUIDANCE_CUT: "down",
  CAPEX_RAISE: "up",
  FCF_TURNS_NEGATIVE: "down",
  ACQUISITION_ANNOUNCED: "up",
  REGULATORY_ACTION: "down",
  EXEC_DEPARTURE: "swing",
  CYBER_INCIDENT: "down",
  BANKRUPTCY: "down",
  RESTATEMENT: "down",
  LARGE_MOVE_UP: "up",
  LARGE_MOVE_DOWN: "down",
  FOMC_DECISION: "swing",
  CPI_RELEASE: "swing",
  JOBS_REPORT: "swing",
  MEGA_TECH_IPO: "up",
};

const IPO = /\b(ipo|initial public offering|goes public|going public|direct listing|market debut|starts trading)\b/i;

/** Suppliers, customers and close peers: where news about one company is most likely to spill over. */
export const RELATED: Record<string, string[]> = {
  NVDA: ["TSM", "MU", "AMD", "AVGO"],
  AMD: ["NVDA", "TSM"],
  TSM: ["NVDA", "AAPL", "AMD"],
  MU: ["NVDA", "WDC"],
  AVGO: ["NVDA", "AAPL"],
  AAPL: ["QCOM", "AVGO", "TSM"],
  MSFT: ["NVDA", "ORCL"],
  GOOGL: ["NVDA", "AVGO"],
  AMZN: ["NVDA", "UPS"],
  META: ["NVDA", "SNAP"],
  TSLA: ["F", "GM"],
  F: ["GM", "TSLA"],
  GM: ["F", "TSLA"],
  BA: ["SPR", "GE"],
  JPM: ["BAC", "WFC", "GS"],
  BAC: ["JPM", "WFC"],
  NFLX: ["DIS", "ROKU"],
  COIN: ["HOOD", "MSTR"],
};

/** Unlisted companies (and themes) named in headlines, mapped to the listed names most tied to them. */
const NAMED: { pattern: RegExp; tickers: string[]; why: string }[] = [
  { pattern: /\banthropic\b/i, tickers: ["GOOGL", "AMZN", "NVDA"], why: "large investors in, or suppliers to, Anthropic" },
  { pattern: /\bopenai\b/i, tickers: ["MSFT", "NVDA", "ORCL"], why: "OpenAI's largest backer and suppliers" },
  { pattern: /\bspacex\b/i, tickers: ["GOOGL"], why: "an early SpaceX investor" },
  { pattern: /\b(oil|crude|opec|brent)\b/i, tickers: ["WTI"], why: "oil prices themselves" },
  { pattern: /\b(fed|federal reserve|rate (hike|cut)|interest rates?)\b/i, tickers: ["SPX", "USD"], why: "the broad market and the dollar" },
  { pattern: /\b(inflation|cpi)\b/i, tickers: ["SPX", "USD"], why: "the broad market and the dollar" },
  { pattern: /\b(tariffs?|trade war)\b/i, tickers: ["SPX", "USD"], why: "the broad market and the dollar" },
  { pattern: IPO, tickers: ["NASDAQ"], why: "the tech-heavy Nasdaq, as a whole" },
];

const NOT_COMPANIES = new Set(["SPX", "NASDAQ", "XLK", "MKT", "FED", "BLS", "USD", "USDJPY", "WTI", "BTC", "ETH", "SPACEX", "SPCX", "GOOG"]);

/** Listed companies named in the headline's words ("Nvidia", "Microsoft"), when the labeler tagged none. */
export function companiesIn(title: string): string[] {
  const found: { at: number; ticker: string }[] = [];
  for (const [ticker, name] of Object.entries(NAME_BY_SYMBOL)) {
    if (NOT_COMPANIES.has(ticker)) continue;
    const words = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = new RegExp(`\\b(${words}|${ticker.length >= 3 ? ticker : "(?!)"})\\b`).exec(title);
    if (m) found.push({ at: m.index, ticker });
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.ticker);
}

const WEEK = "+4_trading_days";

function verb(d: Direction): string {
  return d === "up" ? "rises" : d === "down" ? "falls" : "moves more than usual";
}

function href(p: { statement: string; eventType?: string; symbol: string; entities?: string[]; direction: Direction }): string {
  const q = new URLSearchParams({ statement: p.statement, symbol: p.symbol, direction: p.direction, window: WEEK });
  if (p.eventType && p.eventType !== "NONE") q.set("eventType", p.eventType);
  if (p.entities?.length) q.set("entities", p.entities.join(", "));
  return `/submit?${q.toString()}`;
}

export function ideasFor(h: Headline, limit = 3): ClaimIdea[] {
  // A big listing in the news is its own kind of event, with a reviewed list of past ones to test on.
  const type = h.event_type === "NONE" && IPO.test(h.title) ? "MEGA_TECH_IPO" : h.event_type;
  const kind = type !== "NONE" ? eventLabel(type) : "news like this comes out";
  const dir: Direction = TYPICAL[type] ?? "swing";
  const out: ClaimIdea[] = [];
  const seen = new Set<string>();
  const add = (symbol: string, why: string, entities: string[]) => {
    if (seen.has(symbol) || out.length >= limit) return;
    seen.add(symbol);
    const statement = `When ${kind}, ${shortName(symbol)} ${verb(dir)} within a week.`;
    const ents = type === "MEGA_TECH_IPO" ? ["NEW_LISTING"] : entities;
    out.push({ title: statement, why, href: href({ statement, eventType: type, symbol, entities: ents, direction: dir }) });
  };
  const named = h.entities.length ? h.entities : companiesIn(h.title);
  for (const e of named) add(e, h.entities.length ? "the company the news is about" : "a company named in the headline", named);
  for (const e of named) for (const r of RELATED[e] ?? []) add(r, `${shortName(r)} is closely tied to ${shortName(e)}: a possible spillover`, named);
  for (const n of NAMED) if (n.pattern.test(h.title)) for (const t of n.tickers) add(t, n.why, h.entities);
  return out;
}
