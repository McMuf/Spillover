import { describe, expect, it } from "vitest";
import type { SiteData } from "../generated/site";
import { makeClaim, makeSite } from "../test-utils";
import { claimsAboutType, findStory, measuredValue, measurements, pastEvents, storyTitle, type Story } from "./news";

const filing: Story = {
  event_id: "cyber_incident_2026-11-17_ab12cd34",
  event_type: "CYBER_INCIDENT",
  origin: "filings",
  date: "2026-11-17",
  entities: ["ACAIR"],
  scheduled: false,
  sources: [
    {
      title: "Acme Air Inc (ACAIR) 8-K Item 1.05: Material Cybersecurity Incidents",
      url: "https://www.sec.gov/Archives/x-index.htm",
      source: "sec-8k",
      published_at: "2026-11-17T21:30:00Z",
    },
  ],
  claim_ids: [],
};

function site(): SiteData {
  const claim = makeClaim("clm_demo_v1", {
    forward_log: [
      { event_id: "ev2", event_date: "2025-03-03", created_at: "2025-03-01T00:00:00Z", sha256: "x", status: "graded", hit: true, value: -0.012, proof: "present" },
    ],
  });
  const s = makeSite([claim]);
  s.events = [
    { event_id: "ev1", event_type: "DEMO_EVENT", entities: ["ABC"], date: "2025-01-02", scheduled: false, source: "https://example.com/a", claims: [{ claim_id: "clm_demo_v1", effective: true, value: -0.02 }] },
    { event_id: "ev2", event_type: "DEMO_EVENT", entities: ["ABC"], date: "2025-03-03", scheduled: false, source: "test", claims: [{ claim_id: "clm_demo_v1", effective: false, value: null }] },
  ];
  s.news = [filing];
  return s;
}

describe("news stories", () => {
  it("uses the real headline when there is one", () => {
    expect(storyTitle(filing)).toBe("Acme Air Inc (ACAIR) 8-K Item 1.05: Material Cybersecurity Incidents");
  });

  it("opens older events a claim uses even when they are not in the recent news", () => {
    const s = findStory(site(), "ev1");
    expect(s).toMatchObject({ event_type: "DEMO_EVENT", claim_ids: ["clm_demo_v1"] });
    expect(s?.sources[0]).toMatchObject({ url: "https://example.com/a", source: "example.com" });
    expect(findStory(site(), "nope")).toBeUndefined();
  });

  it("prefers the graded forward value over the backtest statistic", () => {
    const st = site();
    const [m] = measurements(st, findStory(st, "ev2")!);
    expect(m).toMatchObject({ value: -0.012, counted: true });
    expect(m?.forward?.status).toBe("graded");
  });

  it("lists only earlier events that counted, newest first", () => {
    const st = site();
    const past = pastEvents(st, st.claims[0]!, "2025-12-31");
    expect(past.map((p) => p.event.event_id)).toEqual(["ev1"]);
  });

  it("finds claims about a kind of event even when this event did not trigger them", () => {
    expect(claimsAboutType(site(), "DEMO_EVENT")).toHaveLength(1);
    expect(claimsAboutType(site(), "CYBER_INCIDENT")).toHaveLength(0);
  });

  it("words swing sizes instead of colouring them as up or down", () => {
    const swing = makeClaim("clm_s_v1");
    swing.claim.measure = "abs_excess_return";
    expect(measuredValue(swing, -0.0004)).toEqual({ text: "0.04% smaller swing than usual", cls: "text-fg" });
    expect(measuredValue(makeClaim(), -0.02)).toEqual({ text: "−2.00%", cls: "text-negative" });
  });
});
