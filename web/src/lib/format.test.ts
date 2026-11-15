import { describe, expect, it } from "vitest";
import { citation, claimVersion, intervalText, pct, plainPct, shortHash, venueLabel, windowLabel } from "./format";

describe("format", () => {
  it("formats signed percents and never turns missing into zero", () => {
    expect(pct(0.0083)).toBe("+0.83%");
    expect(pct(-0.0005)).toBe("−0.05%");
    expect(pct(0)).toBe("+0.00%");
    expect(pct(null)).toBe("n/a");
    expect(pct(Number.NaN)).toBe("n/a");
    expect(plainPct(0.7)).toBe("70%");
    expect(plainPct(null)).toBe("n/a");
  });

  it("describes intervals, including the too-few-events case", () => {
    expect(intervalText(-0.0033, 0.0022)).toBe("[−0.33%, +0.22%]");
    expect(intervalText(null, null)).toMatch(/too few events/);
  });

  it("derives the version from the claim id", () => {
    expect(claimVersion("clm_a_b_v1")).toBe(1);
    expect(claimVersion("clm_a_v12")).toBe(12);
    expect(claimVersion("weird")).toBe(1);
  });

  it("builds a citation with id, version, commit and repo", () => {
    expect(citation("clm_x_v2", 2, "abc1234", "McMuf/Spillover")).toBe(
      "Spillover claim clm_x_v2 (v2), commit abc1234, https://github.com/McMuf/Spillover",
    );
  });

  it("small helpers", () => {
    expect(shortHash("abcdef0123456789", 6)).toBe("abcdef");
    expect(venueLabel("us_equity")).toBe("us equity");
    expect(windowLabel(2)).toBe("day 0 to +1");
  });
});
