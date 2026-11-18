import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AreaChart, areaPaths } from "./AreaChart";
import { Highlight } from "./Highlight";
import { identiconCells, Identicon } from "./Identicon";

describe("area chart", () => {
  it("draws nothing for fewer than two points and stays inside its box", () => {
    expect(areaPaths([1], 100, 30).line).toBe("");
    const { line } = areaPaths([1, 5, 3, 9], 100, 30);
    const nums = (line.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    expect(nums.every((n) => n >= 0 && n <= 100)).toBe(true);
  });

  it("is decoration with no gradient, drawn as a line with a live dot", () => {
    const { container } = render(<AreaChart values={[1, 2, 3]} markIndex={1} />);
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector("linearGradient, radialGradient")).toBeNull();
    expect(container.querySelector("line")).not.toBeNull();
  });
});

describe("highlight", () => {
  it("picks out whole names only", () => {
    render(<p data-testid="h"><Highlight text="Fed rate decisions make the S&P 500 swing" terms={["S&P 500", "Fed"]} /></p>);
    const spans = screen.getByTestId("h").querySelectorAll("span");
    expect([...spans].map((s) => s.textContent)).toEqual(["Fed", "S&P 500"]);
  });

  it("does not match inside other words", () => {
    render(<p data-testid="h"><Highlight text="Federal fed Fedex" terms={["Fed"]} /></p>);
    expect(screen.getByTestId("h").querySelectorAll("span")).toHaveLength(0);
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
