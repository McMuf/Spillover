/** Pull-request links that pre-fill a challenge or replication file from the repository templates. */

const SUBMITTED = "set_by_ci_on_merge";

export function challengeTemplate(claimId: string): string {
  return [
    "# Challenge: argue that this registered claim is wrong. Attack the claim, not the person.",
    "id: chl_REPLACE_ME_v1",
    `claim: ${claimId}`,
    "# definition | baseline | sample | data | timing | other",
    "aspect: other",
    "argument: >",
    "  REPLACE_ME",
    "evidence: []",
    "submitted_by: YOUR_GITHUB_HANDLE",
    `submitted_at: ${SUBMITTED}`,
    "",
  ].join("\n");
}

export function replicationTemplate(claimId: string): string {
  return [
    "# Replication: this claim with the changes below. The engine runs it; you never write a result.",
    "id: rep_REPLACE_ME_v1",
    `claim: ${claimId}`,
    "changes:",
    "  window_end: +3_trading_days",
    "  # instrument: {venue: us_equity, symbol: XLF}",
    "  # baseline: factor_only     # or constant_mean",
    "  # factor: MKT",
    "  # measure: abnormal_return  # or abs_excess_return",
    "rationale: >",
    "  REPLACE_ME",
    "submitted_by: YOUR_GITHUB_HANDLE",
    `submitted_at: ${SUBMITTED}`,
    "",
  ].join("\n");
}

/** GitHub's editor with a new file pre-filled; the author renames it and opens a pull request. */
export function newFileUrl(repo: string, dir: "challenges" | "replications", filename: string, value: string): string {
  const q = new URLSearchParams({ filename, value });
  return `https://github.com/${repo}/new/main/${dir}?${q.toString()}`;
}
