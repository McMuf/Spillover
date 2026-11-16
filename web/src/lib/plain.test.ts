import { describe, expect, it } from "vitest";
import { CATEGORY_HUES, color, contrast } from "../design/tokens";
import { brandFor, instrumentName } from "./brands";
import { categoryOf, eventLabel, windowWords } from "./plain";

describe("plain-English helpers", () => {
  it("describes the window in words", () => {
    expect(windowWords("+1_trading_day")).toBe("the event day and the next trading day");
    expect(windowWords("+5_trading_days")).toBe("the event day and the next 5 trading days");
  });

  it("gives every taxonomy event a category and a sentence", () => {
    for (const t of ["FOMC_DECISION", "RANDOM_DATE", "EARNINGS_BEAT", "TOKEN_UNLOCK", "FCF_TURNS_NEGATIVE"]) {
      expect(categoryOf(t).name).not.toBe("Markets");
      expect(eventLabel(t)).not.toContain("_");
    }
    expect(categoryOf("SOMETHING_NEW").name).toBe("Markets");
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

  it("keeps category hues readable on the card surfaces", () => {
    for (const h of CATEGORY_HUES) expect(contrast(color.dark[h], color.dark.surface)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("event titles", () => {
  it("keeps acronyms upper-case", async () => {
    const { eventTitle } = await import("./plain");
    const e = { event_type: "FOMC_DECISION" } as Parameters<typeof eventTitle>[0];
    expect(eventTitle(e)).toBe("FOMC decision");
  });
});
