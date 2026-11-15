import { describe, expect, it } from "vitest";
import { challengeTemplate, newFileUrl, replicationTemplate } from "./lanes";

describe("pull-request templates", () => {
  it("pre-fill the claim id and leave the stamping to CI", () => {
    for (const t of [challengeTemplate("clm_a_v1"), replicationTemplate("clm_a_v1")]) {
      expect(t).toContain("claim: clm_a_v1");
      expect(t).toContain("submitted_at: set_by_ci_on_merge");
      expect(t).toContain("REPLACE_ME"); // unedited templates must fail validation
    }
    expect(replicationTemplate("clm_a_v1")).toContain("window_end: +3_trading_days");
  });

  it("builds a GitHub new-file link into the right folder", () => {
    const url = new URL(newFileUrl("McMuf/Spillover", "replications", "rep_x_v1.yaml", "id: rep_x_v1\n"));
    expect(url.pathname).toBe("/McMuf/Spillover/new/main/replications");
    expect(url.searchParams.get("filename")).toBe("rep_x_v1.yaml");
    expect(url.searchParams.get("value")).toBe("id: rep_x_v1\n");
  });
});
