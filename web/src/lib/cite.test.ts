import { describe, expect, it } from "vitest";
import { citeBibtex, citeText } from "./cite";

const C = {
  id: "clm_fomc_abs_move_spx_v2",
  title: "Fed rate decisions make the S&P 500 swing more than usual.",
  author: "McMuf",
  registeredAt: "2026-11-20T18:00:00Z",
  url: "https://mcmuf.github.io/Spillover/#/claims/clm_fomc_abs_move_spx_v2",
  repo: "McMuf/Spillover",
  commit: "abc1234",
  rulesVersion: "0.2",
  engineVersion: "0.1.0a0",
};

describe("citations", () => {
  it("names the exact claim, when it was frozen, the rules and the commit", () => {
    const t = citeText(C);
    expect(t).toContain("McMuf (2026). Fed rate decisions make the S&P 500 swing more than usual. Spillover claim clm_fomc_abs_move_spx_v2");
    expect(t).toContain("registered and frozen 2026-11-20");
    expect(t).toContain("Scoring rules 0.2");
    expect(t).toContain("commit abc1234");
  });

  it("writes BibTeX that compiles: special characters escaped", () => {
    const b = citeBibtex(C);
    expect(b.startsWith("@misc{spillover_clm_fomc_abs_move_spx_v2,")).toBe(true);
    expect(b).toContain("title        = {{Fed rate decisions make the S\\&P 500 swing more than usual}}");
    expect(b).toContain("howpublished = {Spillover claim clm\\_fomc\\_abs\\_move\\_spx\\_v2}");
  });

  it("says plainly when a claim is only a draft", () => {
    expect(citeText({ ...C, registeredAt: null })).toContain("(draft, not yet registered)");
  });
});
