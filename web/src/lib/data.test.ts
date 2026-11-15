import { afterEach, describe, expect, it, vi } from "vitest";
import { findClaim, findEvent, loadSite } from "./data";
import { makeClaim, makeSite } from "../test-utils";

afterEach(() => vi.unstubAllGlobals());

describe("site data loading", () => {
  it("loads valid data", async () => {
    const site = makeSite();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(site) }));
    expect((await loadSite("x")).claims).toHaveLength(1);
  });

  it("explains how to fix a missing file", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(loadSite("./data/site.json")).rejects.toThrow(/export-site/);
  });

  it("refuses a data version it does not understand", async () => {
    const bad = { ...makeSite(), schema_version: 2 };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(bad) }));
    await expect(loadSite("x")).rejects.toThrow(/Unsupported/);
  });

  it("finds claims and events by id", () => {
    const site = makeSite([makeClaim("clm_a_v1")]);
    expect(findClaim(site, "clm_a_v1")?.claim.id).toBe("clm_a_v1");
    expect(findClaim(site, "nope")).toBeUndefined();
    expect(findEvent(site, "ev1")?.event_id).toBe("ev1");
  });
});
