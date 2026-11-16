import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { identiconCells, Identicon } from "./Identicon";
import { sparkPath, Sparkline } from "./Sparkline";

describe("sparkline", () => {
  it("draws nothing for fewer than two points and stays inside its box", () => {
    expect(sparkPath([1], 100, 30)).toBe("");
    const d = sparkPath([1, 5, 3, 9], 100, 30);
    const nums = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    expect(nums.every((n) => n >= 0 && n <= 100)).toBe(true);
  });

  it("is decoration: hidden from assistive tech, neutral by default", () => {
    const { container } = render(<Sparkline values={[1, 2, 3]} />);
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector("path")?.getAttribute("stroke")).toBe("var(--c-accent)");
  });
});

describe("identicon", () => {
  it("is deterministic, mirrored and different per handle", () => {
    const a = identiconCells("McMuf");
    expect(identiconCells("McMuf")).toEqual(a);
    for (const row of a) expect(row[0]).toBe(row[4]);
    expect(identiconCells("someone-else")).not.toEqual(a);
  });

  it("renders no text, so it never leaks a handle twice", () => {
    const { container } = render(<Identicon handle="McMuf" />);
    expect(container.textContent).toBe("");
  });
});
