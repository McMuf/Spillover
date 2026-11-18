import { describe, expect, it } from "vitest";
import { makeSite } from "../test-utils";
import { askUrl, commentsOn, isOwnDiscussion } from "./community";
import { feedItems, ordered, topics } from "./feed";

const BASE = "https://github.com/McMuf/Spillover/discussions";

describe("questions", () => {
  it("asks in the Q&A category with the question filled in, and nothing else", () => {
    const c = { ask_category: "q-a", questions: [], threads: [], fetched_at: null };
    const url = new URL(askUrl(c, "  Do recalls hurt car makers?  ", "Saw one today"));
    expect(`${url.origin}${url.pathname}`).toBe(`${BASE}/new`);
    expect(url.searchParams.get("category")).toBe("q-a");
    expect(url.searchParams.get("title")).toBe("Do recalls hurt car makers?");
    expect(url.searchParams.get("body")).toBe("Saw one today");
  });

  it("falls back to GitHub's category picker when there is no Q&A category, and ignores odd slugs", () => {
    expect(askUrl({ ask_category: null, questions: [], threads: [], fetched_at: null })).toBe(`${BASE}/new/choose`);
    const odd = new URL(askUrl({ ask_category: "x&y=z", questions: [], threads: [], fetched_at: null }));
    expect(odd.searchParams.get("category")).toBeNull();
  });

  it("only treats this repository's own discussion pages as links", () => {
    expect(isOwnDiscussion(`${BASE}/12`)).toBe(true);
    expect(isOwnDiscussion(`${BASE}/12/evil`)).toBe(false);
    expect(isOwnDiscussion("https://github.com/someone/else/discussions/12")).toBe(false);
    expect(isOwnDiscussion("javascript:alert(1)")).toBe(false);
  });

  it("counts comments by exact thread term", () => {
    const c = { ask_category: null, questions: [], threads: [{ term: "claim:a", url: `${BASE}/1`, comments: 3 }], fetched_at: null };
    expect(commentsOn(c, "claim:a")).toBe(3);
    expect(commentsOn(c, "claim:ab")).toBe(0);
  });

  it("puts open questions into the feed, in Trending after the first claim, with their own topic", () => {
    const site = makeSite();
    const q = (number: number, answered: boolean) => ({
      number,
      title: `Q${number}`,
      url: `${BASE}/${number}`,
      author: "asker",
      created_at: `2026-11-1${number}T00:00:00Z`,
      updated_at: `2026-11-1${number}T00:00:00Z`,
      excerpt: "",
      comments: 0,
      upvotes: 0,
      answered,
    });
    site.community.questions = [q(1, false), q(2, true)];
    const items = feedItems(site, []);
    expect(topics(items)).toContain("Questions");
    const trending = ordered(items, "trending", site).map((i) => (i.kind === "question" ? `q${i.question.number}` : i.kind));
    expect(trending).toEqual(["claim", "q1", "q2"]);
  });
});
