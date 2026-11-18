import type { SiteData } from "../generated/site";

/**
 * Discussion threads (community phase 1): giscus, backed by this repository's GitHub Discussions.
 *
 * Switched on: Discussions are enabled on the repository, the giscus GitHub app
 * (https://github.com/apps/giscus) is installed, and threads go in an Announcement-type category,
 * so only giscus and maintainers can start them. The ids come from https://giscus.app. With an
 * empty categoryId no discussion section is shown.
 *
 * Discussion never changes a claim's result: grades come only from the record.
 */
export interface GiscusConfig {
  repo: `${string}/${string}`;
  repoId: string;
  category: string;
  categoryId: string;
}

export const GISCUS: GiscusConfig = {
  repo: "McMuf/Spillover",
  repoId: "R_kgDOVu1PBw",
  // GitHub's default Announcements category: only maintainers and giscus can start threads there.
  category: "Announcements",
  categoryId: "DIC_kwDOVu1PB84DLZH7",
};

export function discussionsEnabled(config: GiscusConfig = GISCUS): boolean {
  return /^[A-Za-z0-9_=-]{8,}$/.test(config.repoId) && /^[A-Za-z0-9_=-]{8,}$/.test(config.categoryId);
}

/** One thread per claim and per event, found by an exact term (never by page title or URL). */
export function discussionTerm(kind: "claim" | "event", id: string): string {
  return `${kind}:${id}`;
}

type Community = SiteData["community"];
export type Question = Community["questions"][number];

const DISCUSSIONS = `https://github.com/${GISCUS.repo}/discussions`;

/** Only this repository's own discussion pages are ever linked (the engine checks this too). */
export function isOwnDiscussion(url: string): boolean {
  return new RegExp(`^${DISCUSSIONS.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}/\\d+$`).test(url);
}

/**
 * Where "Ask a question" goes: GitHub's new-discussion page in the Q&A category, with the title and
 * text filled in. Asking needs a GitHub account; nothing is posted until the person presses Start
 * discussion there. Without a Q&A category, the general new-discussion page.
 */
export function askUrl(community: Community, title = "", body = ""): string {
  const q = new URLSearchParams();
  if (community.ask_category && /^[a-z0-9-]{1,60}$/.test(community.ask_category)) q.set("category", community.ask_category);
  if (title.trim()) q.set("title", title.trim().slice(0, 200));
  if (body.trim()) q.set("body", body.trim().slice(0, 2000));
  const qs = q.toString();
  return `${DISCUSSIONS}/new${community.ask_category ? "" : "/choose"}${qs ? `?${qs}` : ""}`;
}

/** The comment count on a claim's or event's thread, when the build could read it. */
export function commentsOn(community: Community, term: string): number {
  return community.threads.find((t) => t.term === term)?.comments ?? 0;
}
