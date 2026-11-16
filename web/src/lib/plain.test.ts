import { describe, expect, it } from "vitest";
import type { SiteClaim } from "../generated/site";
import { makeClaim } from "../test-utils";
import { brandFor, instrumentName } from "./brands";
import { categoryOf, eventHeadline, eventLabel, eventTitle, highlightTerms, shortHeadline, windowWords } from "./plain";

const withClaim = (c: Partial<SiteClaim["claim"]>): SiteClaim => {
  const base = makeClaim();
  return { ...base, claim: { ...base.claim, ...c } };
};

describe("plain-English helpers", () => {
  it("describes the window in words", () => {
    expect(windowWords("+1_trading_day")).toBe("the event day and the next trading day");
    expect(windowWords("+5_trading_days")).toBe("the event day and the next 5 trading days");
  });

  it("gives every taxonomy event a topic and a sentence", () => {
    for (const t of ["FOMC_DECISION", "RANDOM_DATE", "EARNINGS_BEAT", "TOKEN_UNLOCK", "FCF_TURNS_NEGATIVE"]) {
      expect(categoryOf(t)).not.toBe("Markets");
      expect(eventLabel(t)).not.toContain("_");
    }
    expect(categoryOf("SOMETHING_NEW")).toBe("Markets");
  });

  it("writes short headlines a non-specialist can read", () => {
    const fomc = withClaim({ event_type: "FOMC_DECISION", measure: "abs_excess_return", instrument: { venue: "us_index", symbol: "SPX" } });
    expect(shortHeadline(fomc)).toBe("Fed rate decisions make the S&P 500 swing more than usual");
    expect(highlightTerms(fomc)).toEqual(expect.arrayContaining(["S&P 500", "Fed"]));
    const placebo = withClaim({ event_type: "RANDOM_DATE", instrument: { venue: "us_index", symbol: "NASDAQ" } });
    expect(shortHeadline(placebo)).toBe("Placebo: does the Nasdaq move on random days?");
    const down = withClaim({ event_type: "EARNINGS_MISS", expected_sign: "negative", instrument: { venue: "us_equity", symbol: "NVDA" } });
    expect(shortHeadline(down)).toBe("Nvidia lags the market after earnings misses");
  });

  it("keeps acronyms upper-case in event titles", () => {
    expect(eventTitle({ event_type: "FOMC_DECISION" })).toBe("FOMC decision");
    expect(eventHeadline({ event_type: "RANDOM_DATE", entities: ["NONE"] })).toMatch(/Placebo/);
  });

  it("names known instruments and falls back to the symbol", () => {
    expect(instrumentName("SPX")).toBe("S&P 500");
    expect(instrumentName("ZZZZ")).toBe("ZZZZ");
  });

  it("has a bundled company mark for common tickers and none for unknown ones", () => {
    expect(brandFor("AAPL")?.path.length).toBeGreaterThan(20);
    expect(brandFor("googl")?.title).toBe("Google");
    expect(brandFor("ZZZZ")).toBeUndefined();
  });
});
