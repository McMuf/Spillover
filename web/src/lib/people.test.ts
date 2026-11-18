import { describe, expect, it } from "vitest";
import { makeClaim, makeSite } from "../test-utils";
import { isHandle, people, profileOf } from "./people";

function site() {
  const mine = makeClaim("clm_a_v1");
  mine.claim.registered_by = "McMuf";
  const theirs = makeClaim("clm_b_v1");
  theirs.claim.registered_by = "someone";
  theirs.challenges = [{ id: "chl_1", aspect: "baseline", argument: "Use a sector factor.", evidence: [], submitted_by: "mcmuf", submitted_at: null }];
  return makeSite([mine, theirs]);
}

describe("profiles", () => {
  it("gathers a person's claims and challenges, matching names case-insensitively", () => {
    const p = profileOf(site(), "MCMUF");
    expect(p?.handle).toBe("McMuf");
    expect(p?.claims.map((c) => c.claim.id)).toEqual(["clm_a_v1"]);
    expect(p?.challenges.map((c) => c.challenge.id)).toEqual(["chl_1"]);
  });

  it("lists everyone, most active first", () => {
    expect(people(site())).toEqual([
      { handle: "McMuf", contributions: 2 },
      { handle: "someone", contributions: 1 },
    ]);
  });

  it("has no profile for someone with nothing on the record", () => {
    expect(profileOf(site(), "nobody")).toBeUndefined();
  });

  it("only treats GitHub-style usernames as linkable", () => {
    expect(isHandle("McMuf")).toBe(true);
    for (const bad of ["", "-lead", "a b", "../x", "x".repeat(40), "<script>"]) expect(isHandle(bad), bad).toBe(false);
  });
});
