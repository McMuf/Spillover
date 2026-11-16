import { describe, expect, it } from "vitest";
import { makeBacktest, makeClaim, makeSite } from "../test-utils";
import { claimPath, edgeLabel, spilloverMatrix } from "./paths";

describe("claim path", () => {
  it("reads as trigger → event → market, with the control and rules alongside", () => {
    const c = makeClaim();
    const p = claimPath(c, makeSite([c]));
    expect(p.triggers.map((t) => t.id)).toEqual(["ABC"]);
    expect(p.market.symbol).toBe("ABC");
    expect(p.controls.map((f) => f.symbol)).toEqual(["MKT"]);
    expect(p.rules.length).toBeGreaterThanOrEqual(3);
  });

  it("puts all five facts on the effect: estimate, interval, sample size, window, as-of", () => {
    const label = edgeLabel(makeClaim());
    expect(label).toContain("−1.23%");
    expect(label).toContain("[−2.00%, −0.40%]");
    expect(label).toContain("n=36");
    expect(label).toContain("day 0 to +1");
    expect(label).toContain("as of 2025-12-26");
  });

  it("flags a small sample so the link is drawn dashed", () => {
    const thin = makeClaim("clm_thin_v1", { backtest: makeBacktest({ n_effective: 3 }) });
    const solid = makeClaim("clm_solid_v1");
    expect(claimPath(thin, makeSite([thin])).effect?.lowSample).toBe(true);
    expect(claimPath(solid, makeSite([solid])).effect?.lowSample).toBe(false);
  });

  it("has no control step for claims measured against their own normal movement", () => {
    const c = makeClaim();
    c.claim.baseline = "constant_mean";
    expect(claimPath(c, makeSite([c])).controls).toEqual([]);
  });

  it("marks graded predictions hit or miss, and only those", () => {
    const c = makeClaim("clm_x_v1", {
      forward_log: [
        { event_id: "a", event_date: "2026-02-01", created_at: "2026-02-01T12:00:00Z", sha256: "a".repeat(64), status: "graded", hit: true, value: -0.01, proof: "none" },
        { event_id: "b", event_date: "2026-02-02", created_at: "2026-02-02T12:00:00Z", sha256: "b".repeat(64), status: "graded", hit: false, value: 0.01, proof: "none" },
        { event_id: "c", event_date: "2026-02-03", created_at: "2026-02-03T12:00:00Z", sha256: "c".repeat(64), status: "open", hit: null, value: null, proof: "none" },
      ],
    });
    expect(claimPath(c, makeSite([c])).predictions.recent.map((r) => r.outcome)).toEqual(["hit", "miss", "open"]);
  });
});

describe("baskets and several factors", () => {
  it("lists every factor that is subtracted and every basket member", () => {
    const c = makeClaim();
    c.claim.factors = ["BTC", "ETH"];
    c.claim.instrument = { venue: "crypto", symbol: "UNLOCKS", basket: ["ARB", "OP", "SUI"] };
    const p = claimPath(c, makeSite([c]));
    expect(p.controls.map((f) => f.symbol)).toEqual(["BTC", "ETH"]);
    expect(p.market.basket).toEqual(["ARB", "OP", "SUI"]);
  });
});

describe("spillover matrix", () => {
  it("puts each claim in its event-type × market cell and leaves untested pairs empty", () => {
    const a = makeClaim("clm_a_v1");
    const b = makeClaim("clm_b_v1");
    b.claim.instrument = { venue: "us_equity", symbol: "XYZ", basket: null };
    b.claim.event_type = "OTHER_EVENT";
    const m = spilloverMatrix([a, b]);
    expect(m.cols.map((c) => c.symbol)).toEqual(["ABC", "XYZ"]);
    expect(m.cell("DEMO_EVENT", "ABC").map((c) => c.claim.id)).toEqual(["clm_a_v1"]);
    expect(m.cell("DEMO_EVENT", "XYZ")).toEqual([]);
  });

  it("lists control tests last", () => {
    const a = makeClaim("clm_a_v1");
    const p = makeClaim("clm_p_v1");
    p.claim.event_type = "RANDOM_DATE";
    expect(spilloverMatrix([p, a]).rows.map((r) => r.type)).toEqual(["DEMO_EVENT", "RANDOM_DATE"]);
  });
});
