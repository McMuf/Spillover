import { describe, expect, it } from "vitest";
import type { LabelCandidate } from "../generated/site";
import { goldRows, parseTickers, toJsonl } from "./gold";

const cand = (id: string, title: string): LabelCandidate => ({
  headline_id: id,
  title,
  source: "sec-press",
  url: `https://example.gov/${id}`,
  published_at: "2026-11-16T12:00:00Z",
});

describe("gold labels", () => {
  it("cleans tickers and reports anything that is not one", () => {
    expect(parseTickers(" coin, AXP ;; axp ")).toEqual({ tickers: ["AXP", "COIN"], bad: [] });
    expect(parseTickers("COIN, <script>").bad).toEqual(["<SCRIPT>"]);
  });

  it("keeps existing labels, adds only labeled new ones, and never duplicates a headline", () => {
    const existing = [{ title: "Old", source: "sec-press", expected_type: "NONE", expected_entities: [] }];
    const rows = goldRows(existing, [cand("a", "SEC charges Coinbase"), cand("b", "Skipped one"), cand("c", "Old")], {
      a: { type: "REGULATORY_ACTION", entities: "coin" },
      b: { type: "", entities: "" },
      c: { type: "EARNINGS_BEAT", entities: "X" },
    });
    expect(rows.map((r) => r.title)).toEqual(["Old", "SEC charges Coinbase"]);
    expect(rows[1]?.expected_entities).toEqual(["COIN"]);
  });

  it("a NONE label never carries tickers", () => {
    const rows = goldRows([], [cand("a", "Fed announces schedule")], { a: { type: "NONE", entities: "XYZ" } });
    expect(rows[0]?.expected_entities).toEqual([]);
  });

  it("writes the exact line format the engine reads", () => {
    const text = toJsonl([{ title: "T", source: "s", expected_type: "NONE", expected_entities: [] }]);
    expect(text).toBe('{"title":"T","source":"s","expected_type":"NONE","expected_entities":[]}\n');
    expect(toJsonl([])).toBe("");
  });
});
