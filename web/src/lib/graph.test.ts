import { describe, expect, it } from "vitest";
import { buildGraph, edgeLabel, MAX_GRAPH_NODES } from "./graph";
import { makeBacktest, makeClaim, makeSite } from "../test-utils";

describe("graph model", () => {
  it("uses only the six node types and wires a claim end to end", () => {
    const c = makeClaim();
    const g = buildGraph([c], makeSite([c]));
    const types = new Set(g.nodes.map((n) => n.type));
    expect(types).toEqual(new Set(["entity", "event", "instrument", "factor", "condition"]));
    expect(g.tooLarge).toBe(false);
    const ids = new Set(g.nodes.map((n) => n.id));
    for (const e of g.edges) {
      expect(ids.has(e.source) && ids.has(e.target), `${e.id} points at real nodes`).toBe(true);
    }
  });

  it("puts all five facts on the numeric edge: estimate, interval, sample size, window, as-of", () => {
    const label = edgeLabel(makeClaim());
    expect(label).toContain("−1.23%");
    expect(label).toContain("[−2.00%, −0.40%]");
    expect(label).toContain("n=36");
    expect(label).toContain("day 0 to +1");
    expect(label).toContain("as of 2025-12-26");
  });

  it("draws low-sample edges dashed and well-sampled edges solid", () => {
    const thin = makeClaim("clm_thin_v1", { backtest: makeBacktest({ n_effective: 3 }) });
    const solid = makeClaim("clm_solid_v1");
    const num = (c: typeof thin) => buildGraph([c], makeSite([c])).edges.find((e) => e.kind === "spillover");
    expect(num(thin)?.dashed).toBe(true);
    expect(num(solid)?.dashed).toBe(false);
  });

  it("omits the factor node for index claims that have no factor", () => {
    const c = makeClaim();
    c.claim.baseline = "constant_mean";
    const g = buildGraph([c], makeSite([c]));
    expect(g.nodes.some((n) => n.type === "factor")).toBe(false);
  });

  it("marks graded predictions hit or miss, and only those", () => {
    const c = makeClaim("clm_x_v1", {
      forward_log: [
        { event_id: "a", event_date: "2026-02-01", created_at: "2026-02-01T12:00:00Z", sha256: "a".repeat(64), status: "graded", hit: true, value: -0.01, proof: "none" },
        { event_id: "b", event_date: "2026-02-02", created_at: "2026-02-02T12:00:00Z", sha256: "b".repeat(64), status: "graded", hit: false, value: 0.01, proof: "none" },
        { event_id: "c", event_date: "2026-02-03", created_at: "2026-02-03T12:00:00Z", sha256: "c".repeat(64), status: "open", hit: null, value: null, proof: "none" },
      ],
    });
    const out = Object.fromEntries(buildGraph([c], makeSite([c])).nodes.filter((n) => n.type === "prediction").map((n) => [n.label, n.outcome]));
    expect(out).toEqual({ "2026-02-01": "hit", "2026-02-02": "miss", "2026-02-03": "open" });
  });

  it("falls back to a table past 40 nodes", () => {
    const claims = Array.from({ length: 30 }, (_, i) => {
      const c = makeClaim(`clm_n${i}_v1`);
      c.claim.instrument = { venue: "us_equity", symbol: `S${i}` };
      c.claim.trigger_entities = [`E${i}`];
      return c;
    });
    const g = buildGraph(claims, makeSite(claims));
    expect(g.nodes.length).toBeGreaterThan(MAX_GRAPH_NODES);
    expect(g.tooLarge).toBe(true);
  });
});
