import { describe, expect, it } from "vitest";
import type { ForwardRow, SiteClaim } from "../generated/site";
import { makeClaim, makeSite } from "../test-utils";
import { entryNumbers, latestFreeze, ledger, stampTime } from "./ledger";

const registered = (id: string, at: string, over: Partial<SiteClaim> = {}): SiteClaim => {
  const c = makeClaim(id, over);
  return { ...c, status: "Proposed", claim: { ...c.claim, registered_at: at } };
};

const row = (created_at: string, sha256 = "ab".repeat(32)): ForwardRow => ({
  checkins: [],
  created_at,
  event_date: created_at.slice(0, 10),
  event_id: "ev",
  hit: null,
  proof: "present",
  sha256,
  status: "open",
  value: null,
});

describe("ledger", () => {
  it("numbers entries in the order they were frozen, keeps superseded numbers, skips drafts", () => {
    const site = makeSite([
      registered("clm_b_v1", "2026-11-16T00:00:00Z", { superseded_by: "clm_b_v2" }),
      registered("clm_a_v1", "2026-11-15T00:00:00Z"),
      makeClaim("clm_draft_v1"),
      registered("clm_b_v2", "2026-11-20T00:00:00Z"),
    ]);
    expect([...entryNumbers(site)]).toEqual([
      ["clm_a_v1", 1],
      ["clm_b_v1", 2],
      ["clm_b_v2", 3],
    ]);
    expect(ledger(site).map((e) => [e.no, e.item.claim.id])).toEqual([
      [1, "clm_a_v1"],
      [3, "clm_b_v2"],
    ]);
  });

  it("picks the newest frozen prediction, and falls back to the newest registration", () => {
    const withPredictions = makeSite([
      registered("clm_a_v1", "2026-11-15T00:00:00Z", { forward_log: [row("2026-11-17T10:00:00Z", "11".repeat(32))] }),
      registered("clm_b_v1", "2026-11-16T00:00:00Z", { forward_log: [row("2026-11-18T09:00:00Z", "22".repeat(32))] }),
    ]);
    const latest = latestFreeze(withPredictions)!;
    expect(latest.item.claim.id).toBe("clm_b_v1");
    expect(latest.prediction?.sha256).toBe("22".repeat(32));
    expect(latest.no).toBe(2);

    const none = makeSite([registered("clm_a_v1", "2026-11-15T00:00:00Z"), registered("clm_b_v1", "2026-11-19T00:00:00Z")]);
    expect(latestFreeze(none)).toMatchObject({ prediction: undefined, at: "2026-11-19T00:00:00Z" });
    expect(latestFreeze(makeSite([makeClaim()]))).toBeUndefined();

    const replaced = makeSite([
      registered("clm_a_v1", "2026-11-15T00:00:00Z", { superseded_by: "clm_a_v2", forward_log: [row("2026-11-17T10:00:00Z")] }),
      registered("clm_a_v2", "2026-11-20T00:00:00Z"),
    ]);
    expect(latestFreeze(replaced)).toMatchObject({ no: 1, at: "2026-11-17T10:00:00Z" });
  });

  it("writes a stamp time in UTC", () => {
    expect(stampTime("2026-11-21T04:17:13Z")).toBe("21 Nov 2026, 04:17 UTC");
  });
});
