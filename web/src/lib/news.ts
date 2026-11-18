import type { SiteClaim, SiteData, SiteEvent } from "../generated/site";
import { claimStat } from "./format";
import { eventHeadline, eventSentence } from "./plain";

export type Story = SiteData["news"][number];
export type Origin = Story["origin"];

/** A story for any event id: from the news list, or rebuilt from an older event a claim uses. */
export function findStory(site: SiteData, id: string | undefined): Story | undefined {
  const story = site.news.find((s) => s.event_id === id);
  if (story) return story;
  const ev = site.events.find((e) => e.event_id === id);
  if (!ev) return undefined;
  const origin = site.taxonomy.find((t) => t.name === ev.event_type)?.origin ?? "headlines";
  const isUrl = /^https?:\/\//.test(ev.source);
  return {
    event_id: ev.event_id,
    event_type: ev.event_type,
    origin,
    date: ev.date,
    entities: ev.entities.filter((e) => e !== "NONE"),
    scheduled: ev.scheduled,
    sources: [{ title: null, url: isUrl ? ev.source : null, source: isUrl ? new URL(ev.source).hostname : ev.source, published_at: null }],
    claim_ids: ev.claims.map((c) => c.claim_id),
  };
}

/** The real headline when there is one (headlines, filings); otherwise a plain one. */
export function storyTitle(s: Story): string {
  const title = s.sources.find((x) => x.title)?.title;
  return title ?? eventHeadline({ entities: s.entities, event_type: s.event_type });
}

export function storySentence(s: Story): string {
  return eventSentence({ entities: s.entities, event_type: s.event_type, scheduled: s.scheduled });
}

export const ORIGIN_TAG: Record<Origin, string> = {
  calendar: "Scheduled",
  filings: "SEC filing",
  headlines: "Headline",
  prices: "Price move",
  control: "Control",
};

/** How this event entered the record, and how far to trust its label. */
export function originNote(o: Origin): string {
  switch (o) {
    case "calendar":
      return "A scheduled release, known in advance from the official calendar. Nothing about it had to be inferred.";
    case "filings":
      return "From an SEC Form 8-K. The filing's item number sets the event type, so no one had to guess what happened. It is dated when SEC accepted the filing; the news may have broken a few days earlier.";
    case "headlines":
      return "Spotted in a headline by the free rule-based labeler. Labels can be wrong; people check a sample of them by hand, and the labeler's measured accuracy is published.";
    case "prices":
      return "Detected from prices: a daily move larger than 3 standard deviations of the previous 60 trading days.";
    case "control":
      return "A randomly chosen control day.";
  }
}

export function claimsFor(site: SiteData, s: Story): SiteClaim[] {
  return s.claim_ids
    .map((id) => site.claims.find((c) => c.claim.id === id))
    .filter((c): c is SiteClaim => !!c);
}

/** Registered claims about this kind of event, triggered or not (another company, say). */
export function claimsAboutType(site: SiteData, eventType: string): SiteClaim[] {
  return site.claims.filter((c) => c.claim.event_type === eventType);
}

export interface Measurement {
  claim: SiteClaim;
  /** The frozen forward prediction for this event, if one was made. */
  forward: SiteClaim["forward_log"][number] | undefined;
  /** This event's statistic in the claim's backtest, if it counted. */
  value: number | null;
  counted: boolean;
}

export function measurements(site: SiteData, s: Story): Measurement[] {
  const ev: SiteEvent | undefined = site.events.find((e) => e.event_id === s.event_id);
  return claimsFor(site, s).map((claim) => {
    const stat = ev?.claims.find((c) => c.claim_id === claim.claim.id);
    const forward = claim.forward_log.find((r) => r.event_id === s.event_id);
    return { claim, forward, value: forward?.value ?? stat?.value ?? null, counted: !!stat?.effective || forward?.status === "graded" };
  });
}

/** Earlier events of the same type that a claim measured, newest first, for the Data tab. */
export function pastEvents(site: SiteData, claim: SiteClaim, before: string, n = 8): { event: SiteEvent; value: number | null }[] {
  return site.events
    .filter((e) => e.event_type === claim.claim.event_type && e.date < before)
    .map((event) => ({ event, stat: event.claims.find((c) => c.claim_id === claim.claim.id) }))
    .filter((x) => x.stat?.effective)
    .sort((a, b) => b.event.date.localeCompare(a.event.date))
    .slice(0, n)
    .map(({ event, stat }) => ({ event, value: stat?.value ?? null }));
}

/**
 * A measured value as text, with its colour. Red and green mean the price went down or up, so a
 * "swings more than usual" value (bigger or smaller than a normal move, either direction) is
 * worded and shown in a neutral colour instead.
 */
export function measuredValue(claim: SiteClaim, v: number | null): { text: string; cls: string } {
  const s = claimStat(claim.claim.measure, v);
  return { text: s.text, cls: s.cls };
}
