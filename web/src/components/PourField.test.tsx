import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DOWN, PourField, UP, WALL, charAt, createPour } from "./PourField";

const count = (cells: Uint8Array, kinds: number[]) => cells.reduce((n, k) => n + (kinds.includes(k) ? 1 : 0), 0);

describe("the ASCII pour", () => {
  it("fills the glass, then spills over the rim onto the table", () => {
    const p = createPour(60, 24);
    const walls = count(p.cells, [WALL]);
    const { left, right, top } = p.glass;
    let spilled = 0;
    for (let s = 0; s < 1200; s++) {
      p.step();
      expect(count(p.cells, [WALL])).toBe(walls); // ticks never break the glass
    }
    for (let r = 0; r < p.rows; r++) {
      for (let c = 0; c < p.cols; c++) {
        const k = p.cells[r * p.cols + c]!;
        if ((k === UP || k === DOWN) && (c < left || c > right) && r > top) spilled++;
      }
    }
    expect(spilled).toBeGreaterThan(0);
    // The glass is full to near the rim.
    const rimRow = top + 1;
    let full = 0;
    for (let c = left + 1; c < right; c++) if (p.cells[rimRow * p.cols + c] !== 0) full++;
    expect(full).toBeGreaterThan((right - left - 1) * 0.6);
  });

  it("keeps the stream over the glass and draws ups and downs with different strokes", () => {
    const p = createPour(60, 24, 3);
    for (let s = 0; s < 200; s++) {
      p.step();
      expect(p.spout()).toBeGreaterThan(p.glass.left);
      expect(p.spout()).toBeLessThan(p.glass.right);
    }
    const ups = new Set<string>();
    const downs = new Set<string>();
    for (let r = 0; r < p.rows; r++)
      for (let c = 0; c < p.cols; c++) {
        const k = p.cells[r * p.cols + c];
        if (k === UP) ups.add(charAt(p, c, r));
        if (k === DOWN) downs.add(charAt(p, c, r));
      }
    expect([...ups].every((ch) => ["/", "^", "+"].includes(ch))).toBe(true);
    expect([...downs].every((ch) => ["\\", "v", "-"].includes(ch))).toBe(true);
    expect(ups.size + downs.size).toBeGreaterThan(0);
  });

  it("is hidden from screen readers", () => {
    const { container } = render(<PourField />);
    expect(container.querySelector("canvas")?.getAttribute("aria-hidden")).toBe("true");
  });
});
