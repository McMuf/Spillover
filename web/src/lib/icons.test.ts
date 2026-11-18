import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { render } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { Logo } from "../components/Logo";
import { NewsImage } from "../components/NewsImage";
import { outletIcon, personIcon, symbolIcon } from "./icons";

const ICONS = {
  domains: { "news.example": "icons/news.example.png", "bad.example": "https://evil.example/x.png" },
  symbols: { LOW: "icons/lowes.com.png" },
  people: { McMuf: "icons/gh-mcmuf.png" },
};

describe("real icons", () => {
  it("finds an outlet's icon with or without www, and only from the site's own icon folder", () => {
    expect(outletIcon(ICONS, "www.News.example")).toBe("icons/news.example.png");
    expect(outletIcon(ICONS, "bad.example")).toBeUndefined();
    expect(outletIcon(ICONS, "unknown.example")).toBeUndefined();
    expect(symbolIcon(ICONS, "low")).toBe("icons/lowes.com.png");
    expect(personIcon(ICONS, "McMuf")).toBe("icons/gh-mcmuf.png");
  });

  it("draws nothing, never initials, for a company with no real mark", () => {
    const { container } = render(createElement(Logo, { symbol: "ZZZQ" }));
    expect(container.innerHTML).toBe("");
  });

  it("draws nothing, never a letter, for a story with no picture", () => {
    const { container } = render(createElement(NewsImage, { src: null, domain: "news.example" }));
    expect(container.innerHTML).toBe("");
  });

  it("no component draws a first letter or initials as a stand-in icon", () => {
    const root = resolve(process.cwd(), "src");
    const files = ["components", "pages"].flatMap((d) =>
      readdirSync(join(root, d))
        .filter((f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"))
        .map((f) => join(root, d, f)),
    );
    const offenders = files.filter((f) => /charAt\(0\)\}|slice\(0, ?[23]\)(\.toUpperCase\(\))?\}|<Initials\b/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
