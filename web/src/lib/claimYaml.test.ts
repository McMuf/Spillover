import { describe, expect, it } from "vitest";
import { EMPTY_FORM, pullRequestUrl, toYaml, validateYaml, type ClaimForm } from "./claimYaml";

const GOOD: ClaimForm = {
  id: "clm_demo_v1",
  statement: "After a headline, the stock falls by more than the market explains.",
  eventType: "DEMO_EVENT",
  entities: "ABC, DEF",
  venue: "us_equity",
  symbol: "ABC",
  windowEnd: "+1_trading_day",
  expectedSign: "negative",
  baseline: "factor_only",
  measure: "abnormal_return",
  respondsTo: null,
  minEvents: 8,
  falsifier: "The interval includes zero after eight forward events.",
  handle: "someone",
};

describe("claim YAML generator and validator", () => {
  it("writes a swing claim and a counter-claim the engine's schema accepts", () => {
    const text = toYaml({ ...GOOD, measure: "abs_excess_return", respondsTo: { claim: "clm_other_v2", stance: "counter" } });
    expect(text).toContain("measure: abs_excess_return");
    expect(text).toContain("responds_to: {claim: clm_other_v2, stance: counter}");
    expect(validateYaml(text)).toEqual([]);
  });

  it("produces a claim that passes the engine's own JSON Schema", () => {
    expect(validateYaml(toYaml(GOOD))).toEqual([]);
  });

  it("flags the unedited form: placeholders are never valid", () => {
    const problems = validateYaml(toYaml(EMPTY_FORM)).join(" ");
    expect(problems).toMatch(/REPLACE_ME/);
    expect(problems).toMatch(/YOUR_GITHUB_HANDLE/);
  });

  it.each([
    [{ id: "Clm_Bad" }, "id"],
    [{ id: "clm_no_version" }, "id"],
    [{ minEvents: 3 }, "min_forward_events"],
    [{ venue: "" }, "venue"],
    [{ falsifier: "short" }, "falsifier"],
    [{ entities: "" }, "trigger_entities"],
    [{ windowEnd: "tomorrow" }, "window"],
  ] as Array<[Partial<ClaimForm>, string]>)("rejects %j", (patch, needle) => {
    const problems = validateYaml(toYaml({ ...GOOD, ...patch }));
    expect(problems.join(" ")).toContain(needle);
  });

  it("accepts RFC 3339 timestamps and rejects near-misses (the compiled date-time check)", () => {
    const withStamp = (v: string) => toYaml(GOOD).replace("set_by_ci_on_merge", v);
    expect(validateYaml(withStamp("2026-01-05T12:00:00Z"))).toEqual([]);
    expect(validateYaml(withStamp('"2026-01-05T12:00:00+02:00"'))).toEqual([]);
    for (const bad of ["yesterday", '"2026-13-45T25:61:61Z"', '"2026-01-05"', '"2026-01-05T12:00:00"']) {
      expect(validateYaml(withStamp(bad)).join(" "), bad).toContain("registered_at");
    }
  });

  it("reports YAML that does not parse", () => {
    expect(validateYaml("id: [unclosed")[0]).toMatch(/does not parse/);
  });

  it("keeps multi-line text readable and registers via CI", () => {
    const yaml = toYaml({ ...GOOD, statement: "line one\nline two is here" });
    expect(yaml).toContain("statement: >\n  line one\n  line two is here");
    expect(yaml).toContain("registered_at: set_by_ci_on_merge");
  });

  it("builds a GitHub new-file URL that carries the file name and content", () => {
    const url = new URL(pullRequestUrl("McMuf/Spillover", "clm_demo_v1", "id: clm_demo_v1\n"));
    expect(url.pathname).toBe("/McMuf/Spillover/new/main/claims");
    expect(url.searchParams.get("filename")).toBe("clm_demo_v1.yaml");
    expect(url.searchParams.get("value")).toBe("id: clm_demo_v1\n");
  });
});
