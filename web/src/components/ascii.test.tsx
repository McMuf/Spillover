import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { fbm, gradient, Grid, noise2 } from "../lib/ascii";
import { ArchitectureMap, COLS, EDGES, NODES, ROWS, makeArchitectureMap } from "./ArchitectureMap";
import { Waterfall, makeWaterfall } from "./Waterfall";

describe("the ASCII kit", () => {
  it("makes smooth noise in [0, 1] that is the same for the same input", () => {
    for (let i = 0; i < 50; i++) {
      const v = fbm(i * 0.37, i * 0.11, 3, 2);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(noise2(1.5, 2.5, 3)).toBe(noise2(1.5, 2.5, 3));
    expect(Math.abs(noise2(1.5, 2.5) - noise2(1.51, 2.5))).toBeLessThan(0.05);
  });

  it("blends colours and draws boxes", () => {
    expect(gradient(["#000000", "#ffffff"], 3)).toEqual(["#000000", "#808080", "#ffffff"]);
    const g = new Grid(6, 3);
    g.box(0, 0, 6, 3, "round", "#fff");
    expect(g.get(0, 0)).toBe("╭");
    expect(g.get(5, 2)).toBe("╯");
    g.set(99, 99, "x", "#fff"); // off the grid is ignored
  });
});

describe("the waterfall", () => {
  it("fills the grid with rock, falling water and a pool, and moves over time", () => {
    const frame = makeWaterfall(60, 30);
    const a = frame(1).ch.join("");
    expect(a).not.toContain(" ");
    expect(a).toMatch(/[│|▒▓█]/);
    expect(a).toMatch(/[~≈]/);
    expect(frame(2).ch.join("")).not.toBe(a);
  });

  it("is hidden from screen readers", () => {
    const { container } = render(<Waterfall />);
    expect(container.querySelector("canvas")?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("the architecture map", () => {
  it("keeps every box and link inside the grid, and every link ends at a box", () => {
    for (const n of Object.values(NODES)) {
      expect(n.x + n.w).toBeLessThanOrEqual(COLS);
      expect(n.x + 1 + n.sub.length).toBeLessThanOrEqual(COLS);
      expect(n.y + 3).toBeLessThan(ROWS - 3);
    }
    for (const { path } of EDGES) {
      const [ex, ey] = path[path.length - 1]!;
      expect(Object.values(NODES).some((n) => ex === n.x - 1 && ey === n.y + 1)).toBe(true);
    }
  });

  it("draws the parts by name", () => {
    const text = makeArchitectureMap()(1).ch.join("");
    for (const label of ["Calendars", "Claims", "Event study", "Ledger", "Outcomes", "Website"]) expect(text).toContain(label);
  });

  it("is hidden from screen readers", () => {
    const { container } = render(<ArchitectureMap />);
    expect(container.querySelector("canvas")?.getAttribute("aria-hidden")).toBe("true");
  });
});
