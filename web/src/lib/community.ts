/**
 * Discussion threads (community phase 1): giscus, backed by this repository's GitHub Discussions.
 *
 * To switch it on, a maintainer enables Discussions on the repository, creates the category below
 * (type "Announcement", so only giscus and maintainers can start threads), installs the giscus
 * GitHub app (https://github.com/apps/giscus) on the repository, and pastes the category id that
 * https://giscus.app shows into `categoryId`. Until then no discussion section is shown.
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
  category: "Claim discussions",
  categoryId: "",
};

export function discussionsEnabled(config: GiscusConfig = GISCUS): boolean {
  return /^[A-Za-z0-9_=-]{8,}$/.test(config.repoId) && /^[A-Za-z0-9_=-]{8,}$/.test(config.categoryId);
}

/** One thread per claim and per event, found by an exact term (never by page title or URL). */
export function discussionTerm(kind: "claim" | "event", id: string): string {
  return `${kind}:${id}`;
}
