import { describe, expect, it } from "vitest";
import { eventTypeCheck, groupedTypes, oneOffHint, plainSentence, symbolCheck, type TaxonomyEntry } from "./claimGuide";

const TAX: TaxonomyEntry[] = [
  { name: "FOMC_DECISION", definition: "Fed decision.", origin: "calendar", past_events: 40 },
  { name: "CYBER_INCIDENT", definition: "Cyber incident.", origin: "filings", past_events: 3 },
  { name: "EXEC_DEPARTURE", definition: "CEO leaves.", origin: "headlines", past_events: 0 },
  { name: "RANDOM_DATE", definition: "Random.", origin: "control", past_events: 50 },
];

describe("framing a claim", () => {
  it("flags statements about one specific day, not a kind of event", () => {
    for (const s of [
      "All flights were grounded today and airlines will fall.",
      "After the March 3 outage, airline stocks fall.",
      "The 2026 grounding hurt airlines.",
      "Yesterday's cyberattack sinks Delta.",
    ]) {
      expect(oneOffHint(s), s).not.toBeNull();
    }
    expect(oneOffHint("When a company reports a serious cyberattack, its stock falls within three days.")).toBeNull();
  });

  it("says how much history an event type has, and refuses unknown types", () => {
    expect(eventTypeCheck("", TAX)).toBeNull();
    expect(eventTypeCheck("FOMC_DECISION", TAX)?.level).toBe("ok");
    expect(eventTypeCheck("CYBER_INCIDENT", TAX)).toMatchObject({ level: "warn", text: expect.stringContaining("Only 3 past events") });
    expect(eventTypeCheck("EXEC_DEPARTURE", TAX)?.text).toContain("No past events");
    expect(eventTypeCheck("RANDOM_DATE", TAX)?.text).toContain("placebo");
    expect(eventTypeCheck("PLANES_GROUNDED", TAX)?.level).toBe("error");
  });

  it("warns when a symbol has no prices yet", () => {
    expect(symbolCheck("spx", ["SPX"])?.level).toBe("ok");
    expect(symbolCheck("DAL", ["SPX"])).toMatchObject({ level: "warn", text: expect.stringContaining("cannot be graded") });
    expect(symbolCheck(" ", ["SPX"])).toBeNull();
  });

  it("groups types by where their events come from, with every group non-empty", () => {
    const groups = groupedTypes(TAX);
    expect(groups.map(([o]) => o)).toEqual(["headlines", "filings", "calendar", "control"]);
  });

  it("reads the claim back in one plain sentence", () => {
    expect(plainSentence("FOMC_DECISION", "SPX", "negative", "+3_trading_days", "constant_mean")).toBe(
      "When the Federal Reserve announces an interest-rate decision, the S&P 500 falls more than usual, within three trading days.",
    );
    expect(plainSentence("CYBER_INCIDENT", "", "negative", "+1_trading_day", "factor_only")).toBeNull();
  });
});
