import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BrandMark, markSvg } from "./BrandMark";

describe("the brand mark", () => {
  it("is the same drawing in the page and in the browser tab", () => {
    expect(readFileSync(resolve(process.cwd(), "public/favicon.svg"), "utf8").trim()).toBe(markSvg());
    expect(readFileSync(resolve(process.cwd(), "index.html"), "utf8")).toContain('href="./favicon.svg"');
  });

  it("is decorative and draws two peaks and a river", () => {
    const { container } = render(<BrandMark />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.querySelectorAll("path")).toHaveLength(5);
  });
});
