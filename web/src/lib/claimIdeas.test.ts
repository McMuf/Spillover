import { fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { HeadlineActions } from "../components/HeadlineActions";
import { baselineFor, readiness, suggestedFalsifier, suggestedId, vagueHints } from "./claimGuide";
import { ideasFor } from "./claimIdeas";
import type { Headline } from "./liveNews";

const H = (over: Partial<Headline>): Headline => ({
  headline_id: "h", title: "x", url: "https://n.example/a", domain: "n.example", seen_at: "2026-11-20T00:00:00Z",
  image: null, event_type: "NONE", entities: [], confidence: "low", ...over,
});

describe("guardrails for vague ideas", () => {
  it("turns an open question into the parts a claim needs, without judging it", () => {
    const hints = vagueHints("Will the war in Iran lower oil prices?").map((h) => h.text);
    expect(hints.some((t) => t.includes("reads as a question"))).toBe(true);
  });

  it("asks for a direction when the idea only says 'affects'", () => {
    expect(vagueHints("Rate decisions affect bank stocks").map((h) => h.text).join(" ")).toContain("Say which way");
    expect(vagueHints("Rate decisions make bank stocks fall")).toEqual([]);
  });

  it("says a price target is not needed, and flags hedging and one-off stories", () => {
    const text = vagueHints("Oil might go to $100 on March 3").map((h) => h.text).join(" ");
    expect(text).toContain("No price target needed");
    expect(text).toContain("Drop the");
    expect(text).toContain("one specific event");
  });

  it("fills in what a beginner should not have to know", () => {
    expect(baselineFor("SPX")).toBe("constant_mean");
    expect(baselineFor("NVDA")).toBe("factor_only");
    expect(suggestedId("CYBER_INCIDENT", "UAL", "down")).toBe("clm_cyber_incident_ual_down_v1");
    expect(suggestedFalsifier("NVDA", "up", 8)).toContain("After 8 new events");
    expect(readiness({ statement: "", eventType: "X", symbol: "", falsifier: "", handle: "" }).filter((r) => r.done)).toHaveLength(1);
  });
});

describe("claim ideas from a headline", () => {
  it("suggests the company and where its news could spill over", () => {
    const ideas = ideasFor(H({ title: "Nvidia beats estimates", event_type: "EARNINGS_BEAT", entities: ["NVDA"] }));
    expect(ideas[0]!.title).toBe("When a company beats earnings expectations, Nvidia rises within a week.");
    expect(ideas[1]!.why).toContain("spillover");
    expect(ideas[0]!.href).toContain("eventType=EARNINGS_BEAT");
    expect(ideas[0]!.href).toContain("direction=up");
  });

  it("maps an unlisted company to its listed backers", () => {
    const ideas = ideasFor(H({ title: "Anthropic prices its IPO above the range" }));
    expect(ideas.map((i) => new URLSearchParams(i.href.split("?")[1]).get("symbol"))).toEqual(["GOOGL", "AMZN", "NVDA"]);
    // A listing is its own kind of event, backed by the reviewed list of past big tech listings.
    const q = new URLSearchParams(ideas[0]!.href.split("?")[1]);
    expect(q.get("eventType")).toBe("MEGA_TECH_IPO");
    expect(q.get("entities")).toBe("NEW_LISTING");
    expect(ideas[0]!.title).toBe("When a big tech company starts trading (an IPO or direct listing), Alphabet rises within a week.");
  });

  it("offers to read the article or make a claim, from a button as well as on hover", () => {
    const h = H({ title: "Nvidia beats estimates", event_type: "EARNINGS_BEAT", entities: ["NVDA"] });
    render(createElement(MemoryRouter, null, createElement(HeadlineActions, { h, children: h.title })));
    expect(screen.getByRole("link", { name: "Nvidia beats estimates" })).toHaveAttribute("href", h.url);
    fireEvent.click(screen.getByRole("button", { name: /Claim ideas/ }));
    expect(screen.getByRole("link", { name: /Read the article/ })).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(screen.getByRole("link", { name: /Start from this headline/ }).getAttribute("href")).toContain("/submit?");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("link", { name: /Read the article/ })).toBeNull();
  });
});

describe("company names in headline words", () => {
  it("finds listed companies by name when the labeler tagged none", async () => {
    const { companiesIn } = await import("./claimIdeas");
    expect(companiesIn("Fund Dumped Its AMD Stake and Bet $1 Billion That Microsoft Is the Safer AI Stock")).toEqual(["AMD", "MSFT"]);
    expect(companiesIn("Shoppers were panic-buying after ground stop")).toEqual([]);
  });
});
