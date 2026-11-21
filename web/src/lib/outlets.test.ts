import { describe, expect, it } from "vitest";
import { GDELT_QUERY } from "./liveNews";
import { outletTier, TIER_ONE } from "./outlets";

describe("news outlets", () => {
  it("keeps established outlets and leaves the rest out", () => {
    expect(outletTier("www.bloomberg.com")).toBe(2);
    expect(outletTier("wsj.com")).toBe(2);
    expect(outletTier("theguardian.com")).toBe(1);
    expect(outletTier("timesofindia.indiatimes.com")).toBe(0);
    expect(outletTier("notreuters.com")).toBe(0);
  });

  it("asks the live search only for first-tier outlets", () => {
    for (const d of TIER_ONE) expect(GDELT_QUERY).toContain(`domain:${d}`);
  });
});
