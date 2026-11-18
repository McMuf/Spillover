import type { SiteClaim, SiteData } from "../generated/site";
import { claimStat } from "./format";
import type { Headline } from "./liveNews";
import { storyTitle, type Story } from "./news";
import { byTrending, categoryOf, eventLabel, shortHeadline } from "./plain";

export type FeedItem =
  | { kind: "briefing"; id: string; at: string; lead: string; bullets: string[]; symbols: string[] }
  | { kind: "claim"; id: string; at: string; topic: string; claim: SiteClaim }
  | { kind: "event"; id: string; at: string; topic: string; story: Story }
  | { kind: "headline"; id: string; at: string; topic: string; headline: Headline };

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
  const clear = site.claims.filter(
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
  const claims: FeedItem[] = site.claims
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
  return [...claims, ...events, ...news];
}

const newest = (a: FeedItem, b: FeedItem) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id);

/**
 * Trending puts what the record can test first: the most active claims, events that just tested
 * claims, then headlines a claim could be about; everything else follows, newest first. Latest is
 * simply newest first.
 */
export function ordered(items: FeedItem[], mode: "trending" | "latest", site: SiteData): FeedItem[] {
  if (mode === "latest") return [...items].sort(newest);
  const rank = new Map(byTrending(site.claims).map((c, i) => [`claim-${c.claim.id}`, i]));
  const score = (it: FeedItem): number => {
    if (it.kind === "claim") return 300 - (rank.get(it.id) ?? 99);
    if (it.kind === "event" && it.story.claim_ids.length > 0) return 200;
    if (it.kind === "headline" && it.headline.event_type !== "NONE") return 150;
    return 0;
  };
  return [...items].sort((a, b) => score(b) - score(a) || newest(a, b));
}

export function topics(items: FeedItem[]): string[] {
  const n = new Map<string, number>();
  for (const it of items) if (it.kind !== "briefing") n.set(it.topic, (n.get(it.topic) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
}
