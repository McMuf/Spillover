import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AsciiField, charFor, waveStep } from "./AsciiField";

describe("the ASCII basin", () => {
  it("spreads a drop to its neighbours and keeps the edges still", () => {
    const cols = 9, rows = 9;
    let cur = new Float32Array(cols * rows);
    let prev = new Float32Array(cols * rows);
    cur[4 * cols + 4] = 8;
    for (let i = 0; i < 2; i++) {
      waveStep(cur, prev, cols, rows);
      [cur, prev] = [prev, cur];
    }
    expect(Math.abs(cur[4 * cols + 6]!)).toBeGreaterThan(0); // the ripple travelled two cells
    expect(cur[0]).toBe(0);
  });

  it("uses denser characters for taller water and blank for calm water", () => {
    expect(charFor(0)).toBe(" ");
    expect(charFor(3)).toBe("@");
    expect(" .·:-=+*#%@".indexOf(charFor(1.5))).toBeGreaterThan(" .·:-=+*#%@".indexOf(charFor(0.5)));
  });

  it("is hidden from screen readers", () => {
    const { container } = render(<AsciiField />);
    expect(container.querySelector("canvas")?.getAttribute("aria-hidden")).toBe("true");
  });
});
