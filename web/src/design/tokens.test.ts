import { describe, expect, it } from "vitest";
import { NODE_TYPES } from "./nodes";
import { applyTheme } from "./theme";
import { color, contrast, luminance, textPairs, type ThemeName } from "./tokens";

describe("design tokens", () => {
  it("computes WCAG contrast correctly", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrast("#777777", "#777777")).toBeCloseTo(1, 5);
    expect(luminance("#ffffff")).toBeCloseTo(1, 5);
  });

  for (const theme of ["light", "dark"] as ThemeName[]) {
    it(`every text pair meets WCAG AA (4.5:1) in the ${theme} theme`, () => {
      for (const [fg, bg] of textPairs) {
        const ratio = contrast(color[theme][fg], color[theme][bg]);
        expect(ratio, `${fg} on ${bg} (${theme}) is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }

  it("defines the same tokens for both themes", () => {
    expect(Object.keys(color.light).sort()).toEqual(Object.keys(color.dark).sort());
  });

  it("writes tokens onto the root element as CSS variables", () => {
    const el = document.createElement("html");
    applyTheme("dark", el);
    expect(el.dataset.theme).toBe("dark");
    expect(el.style.getPropertyValue("--c-bg")).toBe(color.dark.bg);
    expect(el.style.getPropertyValue("--c-surface-alt")).toBe(color.dark.surfaceAlt);
    expect(el.style.getPropertyValue("--c-on-accent")).toBe(color.dark.onAccent);
  });
});

describe("node language", () => {
  it("has six types, each with a unique shape, tag and glyph", () => {
    expect(NODE_TYPES).toHaveLength(6);
    for (const key of ["tag", "glyph", "cytoscapeShape", "key"] as const) {
      expect(new Set(NODE_TYPES.map((t) => t[key])).size, `unique ${key}`).toBe(6);
    }
    expect(NODE_TYPES.map((t) => t.tag)).toEqual(["EVT", "ENT", "INS", "FAC", "CON", "PRD"]);
  });
});
