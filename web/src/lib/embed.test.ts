import { describe, expect, it } from "vitest";
import { embedSnippet, embedUrl } from "./embed";

describe("embed snippet", () => {
  it("points the frame at the chrome-free route, ignoring any hash on the base", () => {
    expect(embedUrl("https://owner.github.io/Spillover/", "clm_a_v1")).toBe(
      "https://owner.github.io/Spillover/#/embed/claims/clm_a_v1",
    );
    expect(embedUrl("https://owner.github.io/Spillover/#/claims/x", "clm_a_v1")).toBe(
      "https://owner.github.io/Spillover/#/embed/claims/clm_a_v1",
    );
  });

  it("is a single accessible, lazy iframe", () => {
    const html = embedSnippet("https://owner.github.io/Spillover/", "clm_a_v1");
    expect(html.startsWith("<iframe ")).toBe(true);
    expect(html).toContain('title="Spillover claim clm_a_v1"');
    expect(html).toContain('loading="lazy"');
    expect(html.match(/<iframe/g)).toHaveLength(1);
  });

  it("cannot be broken out of by a hostile id or address", () => {
    const html = embedSnippet('https://x.example/"><script>alert(1)</script>', 'a"><script>alert(2)</script>');
    expect(html).not.toContain("<script>");
    expect(html.match(/"/g)!.length % 2).toBe(0); // attribute quotes stay balanced
  });
});
