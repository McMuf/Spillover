import { describe, expect, it } from "vitest";
import { NODE_TYPES } from "./nodes";
import { applyTheme } from "./theme";
import { color, contrast, luminance, textPairs, THEMES } from "./tokens";

describe("design tokens", () => {
  it("computes WCAG contrast correctly", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrast("#777777", "#777777")).toBeCloseTo(1, 5);
    expect(luminance("#ffffff")).toBeCloseTo(1, 5);
  });

  it("every text pair meets WCAG AA (4.5:1)", () => {
    for (const [fg, bg] of textPairs) {
      const ratio = contrast(color.light[fg], color.light[bg]);
      expect(ratio, `${fg} on ${bg} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("is light only, with a lime accent and no switcher", () => {
    expect(THEMES).toEqual(["light"]);
    expect(Object.keys(color)).toEqual(["light"]);
  });

  it("writes tokens onto the root element as CSS variables", () => {
    const el = document.createElement("html");
    applyTheme(el);
    expect(el.dataset.theme).toBe("light");
    expect(el.style.getPropertyValue("--c-bg")).toBe(color.light.bg);
    expect(el.style.getPropertyValue("--c-surface-alt")).toBe(color.light.surfaceAlt);
    expect(el.style.getPropertyValue("--c-on-accent")).toBe(color.light.onAccent);
  });
});

describe("node language", () => {
  it("has six types, each with a unique shape, tag and glyph", () => {
    expect(NODE_TYPES).toHaveLength(6);
    for (const key of ["tag", "glyph", "key"] as const) {
      expect(new Set(NODE_TYPES.map((t) => t[key])).size, `unique ${key}`).toBe(6);
    }
    expect(NODE_TYPES.map((t) => t.tag)).toEqual(["EVT", "ENT", "INS", "FAC", "CON", "PRD"]);
  });
});
