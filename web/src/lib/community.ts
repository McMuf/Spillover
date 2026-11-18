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
