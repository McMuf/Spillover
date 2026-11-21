import type { SiteClaim, SiteData } from "../generated/site";
import type { Question } from "./community";
import { claimStat } from "./format";
import type { Headline } from "./liveNews";
import { storyTitle, type Story } from "./news";
import { byTrending, categoryOf, eventLabel, shortHeadline, liveClaims } from "./plain";

export type FeedItem =
  | { kind: "briefing"; id: string; at: string; lead: string; bullets: string[]; symbols: string[] }
  | { kind: "claim"; id: string; at: string; topic: string; claim: SiteClaim }
  | { kind: "event"; id: string; at: string; topic: string; story: Story }
  | { kind: "headline"; id: string; at: string; topic: string; headline: Headline }
  | { kind: "question"; id: string; at: string; topic: string; question: Question };

const SHORT: Record<string, string> = {
  FOMC_DECISION: "the Fed's rate decision",
  CPI_RELEASE: "the inflation report (CPI)",
  JOBS_REPORT: "the jobs report",
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The day's briefing, written from the data by fixed rules (no AI): what is due next, what the news
 * just produced, and what the record says so far.
 */
export function briefing(site: SiteData, headlines: Headline[], now: Date): FeedItem | null {
  const next = site.upcoming[0];
  const testable = headlines.filter((h) => h.event_type !== "NONE");
  const frozen = site.claims.reduce((n, c) => n + c.forward_log.length, 0);
  const clear = liveClaims(site).filter(
    (c) => c.claim.event_type !== "RANDOM_DATE" && c.backtest && c.backtest.ci_lo !== null && c.backtest.ci_hi !== null && (c.backtest.ci_lo > 0 || c.backtest.ci_hi < 0),
  );
  const parts: string[] = [];
  if (next) parts.push(`Next up: ${SHORT[next.event_type] ?? storyTitle(next)} on ${next.date}, with ${plural(next.claim_ids.length, "claim")} waiting to be tested.`);
  parts.push(`${plural(frozen, "prediction")} frozen so far${headlines.length ? `, and ${plural(testable.length, "testable headline")} in today's news` : ""}.`);
  const bullets: string[] = [];
  for (const h of testable.slice(0, 2)) bullets.push(`In the news: ${h.title} (${eventLabel(h.event_type)}).`);
  for (const c of clear.slice(0, 2)) {
    const b = c.backtest!;
    bullets.push(`${shortHeadline(c)}: ${claimStat(c.claim.measure, b.mean).text} across ${b.n_effective} past events, a pattern in history that new events now test.`);
  }
  const latest = site.news.find((s) => s.claim_ids.length > 0);
  if (latest) bullets.push(`Last on record: ${storyTitle(latest)} (${latest.date}), tested by ${plural(latest.claim_ids.length, "claim")}.`);
  if (parts.length === 0 && bullets.length === 0) return null;
  const symbols = next
    ? [...new Set(next.claim_ids.map((id) => site.claims.find((c) => c.claim.id === id)?.claim.instrument.symbol).filter((s): s is string => !!s))]
    : [];
  return { kind: "briefing", id: `briefing-${now.toISOString().slice(0, 10)}`, at: now.toISOString(), lead: parts.join(" "), bullets, symbols };
}

export function feedItems(site: SiteData, headlines: Headline[]): FeedItem[] {
  const claims: FeedItem[] = liveClaims(site)
    .filter((c) => c.claim.event_type !== "RANDOM_DATE")
    // A draft has no registration time yet ("set_by_ci_on_merge"), so it sorts after every dated item.
    .map((c) => ({
      kind: "claim",
      id: `claim-${c.claim.id}`,
      at: /^\d{4}-\d{2}-\d{2}/.test(c.claim.registered_at) ? c.claim.registered_at : "0000",
      topic: categoryOf(c.claim.event_type),
      claim: c,
    }));
  const events: FeedItem[] = site.news.map((s) => ({ kind: "event", id: `event-${s.event_id}`, at: `${s.date}T21:00:00Z`, topic: categoryOf(s.event_type), story: s }));
  const news: FeedItem[] = headlines.map((h) => ({
    kind: "headline",
    id: `headline-${h.headline_id}`,
    at: h.seen_at,
    topic: h.event_type === "NONE" ? "Headlines" : categoryOf(h.event_type),
    headline: h,
  }));
  const questions: FeedItem[] = site.community.questions.map((q) => ({
    kind: "question",
    id: `question-${q.number}`,
    at: q.created_at,
    topic: "Questions",
    question: q,
  }));
  return [...claims, ...events, ...news, ...questions];
}

const newest = (a: FeedItem, b: FeedItem) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id);

/**
 * Trending weaves the kinds together so the top of the feed always has news with pictures, claims,
 * people's questions and the record side by side: headline, claim, question, headline, event, and
 * round again. Within each kind:
 * headlines a claim could test first, then ones with a picture, then newest; claims by activity;
 * events that tested claims first, newest first. Latest is simply newest first.
 */
export function ordered(items: FeedItem[], mode: "trending" | "latest", site: SiteData): FeedItem[] {
  if (mode === "latest") return [...items].sort(newest);
  const rank = new Map(byTrending(liveClaims(site)).map((c, i) => [`claim-${c.claim.id}`, i]));
  const headlines = items
    .filter((it): it is Extract<FeedItem, { kind: "headline" }> => it.kind === "headline")
    .sort(
      (a, b) =>
        Number(b.headline.event_type !== "NONE") - Number(a.headline.event_type !== "NONE") ||
        Number(!!b.headline.image) - Number(!!a.headline.image) ||
        newest(a, b),
    );
  const claims = items.filter((it) => it.kind === "claim").sort((a, b) => (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99) || newest(a, b));
  const events = items
    .filter((it): it is Extract<FeedItem, { kind: "event" }> => it.kind === "event")
    .sort((a, b) => Number(b.story.claim_ids.length > 0) - Number(a.story.claim_ids.length > 0) || newest(a, b));
  // Open questions first (people are waiting for answers), then the most discussed, then newest.
  const questions = items
    .filter((it): it is Extract<FeedItem, { kind: "question" }> => it.kind === "question")
    .sort(
      (a, b) =>
        Number(a.question.answered) - Number(b.question.answered) ||
        b.question.upvotes + b.question.comments - (a.question.upvotes + a.question.comments) ||
        newest(a, b),
    );
  const queues: FeedItem[][] = [headlines, claims, questions, headlines, events];
  const out: FeedItem[] = [];
  const total = headlines.length + claims.length + events.length + questions.length;
  for (let i = 0; out.length < total; i++) {
    const next = queues[i % queues.length]!.shift();
    if (next) out.push(next);
    else if (queues.every((q) => q.length === 0)) break;
  }
  return out;
}

export function topics(items: FeedItem[]): string[] {
  const n = new Map<string, number>();
  for (const it of items) if (it.kind !== "briefing") n.set(it.topic, (n.get(it.topic) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
}
