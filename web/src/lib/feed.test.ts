import { describe, expect, it } from "vitest";
import { makeClaim, makeSite } from "../test-utils";
import { briefing, feedItems, ordered, topics } from "./feed";
import { gdeltUrl, parseGdelt, tidy, type Headline } from "./liveNews";

const H = (over: Partial<Headline> = {}): Headline => ({
  headline_id: "g1",
  title: "Stocks slide as tariffs bite",
  url: "https://a.example/1",
  domain: "a.example",
  seen_at: "2026-11-18T01:00:00Z",
  image: null,
  event_type: "NONE",
  entities: [],
  confidence: "low",
  ...over,
});

describe("the feed", () => {
  it("mixes claims, events on record and headlines, and Latest is newest first", () => {
    const site = makeSite([makeClaim()]);
    site.news = [{ event_id: "e1", event_type: "FOMC_DECISION", origin: "calendar", date: "2026-11-17", entities: ["FED"], scheduled: true, sources: [], claim_ids: ["clm_demo_v1"] }];
    const items = feedItems(site, [H()]);
    expect(items.map((i) => i.kind).sort()).toEqual(["claim", "event", "headline"]);
    const latest = ordered(items, "latest", site).map((i) => i.kind);
    expect(latest[0]).toBe("headline");
  });

  it("Trending weaves news and claims together so pictures reach the top", () => {
    const site = makeSite([makeClaim()]);
    const items = feedItems(site, [H(), H({ headline_id: "g2", url: "https://a.example/2", title: "SEC charges Acme", event_type: "REGULATORY_ACTION" })]);
    const kinds = ordered(items, "trending", site).map((i) => (i.kind === "headline" ? i.headline.event_type : i.kind));
    // Headline, claim, headline, event, and round again; testable headlines lead their kind.
    expect(kinds).toEqual(["REGULATORY_ACTION", "claim", "NONE"]);
    expect(topics(items)).toContain("Headlines");
  });

  it("writes the briefing from the data, never inventing anything", () => {
    const site = makeSite([makeClaim()]);
    site.upcoming = [{ event_id: "u1", event_type: "CPI_RELEASE", origin: "calendar", date: "2026-12-10", entities: ["BLS"], scheduled: true, sources: [], claim_ids: ["clm_demo_v1"] }];
    const b = briefing(site, [H({ event_type: "REGULATORY_ACTION", title: "SEC charges Acme" })], new Date("2026-11-18T12:00:00Z"));
    expect(b?.kind).toBe("briefing");
    if (b?.kind !== "briefing") return;
    expect(b.lead).toContain("Next up: the inflation report (CPI) on 2026-12-10, with 1 claim waiting");
    expect(b.lead).toContain("1 testable headline");
    expect(b.bullets[0]).toContain("SEC charges Acme");
    expect(b.symbols).toEqual(["ABC"]);
  });
});

describe("live headlines", () => {
  it("asks GDELT for recent English market news as JSON", () => {
    const url = gdeltUrl();
    expect(url).toMatch(/^https:\/\/api\.gdeltproject\.org\/api\/v2\/doc\/doc\?/);
    expect(url).toContain("format=json");
    expect(url).toContain("sourcelang%3Aenglish");
  });

  it("filters like the build: https only, no spam, about markets, no repeats; keeps the build's tags", () => {
    const a = (title: string, url: string, img = "") => ({ title, url, domain: "x.example", seendate: "20261118T011500Z", socialimage: img });
    const known = [H({ url: "https://x.example/tagged", headline_id: "gdelt-1", event_type: "EXEC_DEPARTURE", entities: ["NVDA"] })];
    const got = parseGdelt(
      {
        articles: [
          a("Nvidia CEO exits | Station WXYZ", "https://x.example/tagged", "https://x.example/og.jpg"),
          a("Nvidia CEO exits", "https://y.example/copy"),
          a("Shareholder Alert: lead plaintiff deadline", "https://x.example/spam"),
          a("A house for sale on Elm Street", "https://x.example/house"),
          a("Oil prices fall", "http://x.example/insecure"),
          a("Bank stocks rally", "https://x.example/bad-img", "javascript:alert(1)"),
        ],
      },
      known,
    );
    expect(got.map((h) => h.title)).toEqual(["Nvidia CEO exits", "Bank stocks rally"]);
    expect(got[0]).toMatchObject({ event_type: "EXEC_DEPARTURE", entities: ["NVDA"], image: "https://x.example/og.jpg", seen_at: "2026-11-18T01:15:00Z" });
    expect(got[1]?.image).toBeNull();
    expect(() => parseGdelt({ nope: 1 }, [])).toThrow(/no article list/);
  });

  it("tidies GDELT's spacing like the engine does", () => {
    expect(tidy("tech issues , experts say ( for now ) : 5 %")).toBe("tech issues, experts say (for now): 5%");
  });
});

describe("live news", () => {
  it("adds live headlines to the build's hour instead of replacing it, newest first, no repeats", async () => {
    const { mergeHeadlines } = await import("./liveNews");
    const build = [H({ headline_id: "b1", url: "https://a.example/old", title: "Fed holds rates", seen_at: "2026-11-18T13:00:00Z" })];
    const live = [
      H({ headline_id: "l1", url: "https://a.example/new", title: "Stocks jump on Nvidia", seen_at: "2026-11-18T14:45:00Z" }),
      H({ headline_id: "l2", url: "https://b.example/dup", title: "Fed holds rates", seen_at: "2026-11-18T14:45:00Z" }),
    ];
    const merged = mergeHeadlines(live, build);
    expect(merged.map((h) => h.headline_id)).toEqual(["l1", "l2"]);
    expect(mergeHeadlines([], build)).toEqual(build);
  });
});
