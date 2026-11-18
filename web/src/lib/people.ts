import type { SiteClaim, SiteData } from "../generated/site";

type Challenge = SiteClaim["challenges"][number];
type Replication = SiteClaim["replications"][number];
type Contributor = SiteData["scoreboard"]["contributors"][number];

export interface Profile {
  handle: string;
  claims: SiteClaim[];
  challenges: { claim: SiteClaim; challenge: Challenge }[];
  replications: { claim: SiteClaim; replication: Replication }[];
  /** The scoreboard row: track record once claims have verdicts. */
  record: Contributor | undefined;
}

/** GitHub usernames; anything else is never turned into a link. */
const HANDLE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

export function isHandle(s: string): boolean {
  return HANDLE.test(s);
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function profileOf(site: SiteData, handle: string): Profile | undefined {
  const claims = site.claims.filter((c) => same(c.claim.registered_by, handle));
  const challenges = site.claims.flatMap((claim) =>
    claim.challenges.filter((ch) => same(ch.submitted_by, handle)).map((challenge) => ({ claim, challenge })),
  );
  const replications = site.claims.flatMap((claim) =>
    claim.replications.filter((r) => same(r.submitted_by, handle)).map((replication) => ({ claim, replication })),
  );
  const record = site.scoreboard.contributors.find((c) => same(c.registered_by, handle));
  if (!claims.length && !challenges.length && !replications.length && !record) return undefined;
  const name = claims[0]?.claim.registered_by ?? challenges[0]?.challenge.submitted_by ?? replications[0]?.replication.submitted_by ?? handle;
  return { handle: name, claims, challenges, replications, record };
}

/** Everyone with something on the record, most active first. */
export function people(site: SiteData): { handle: string; contributions: number }[] {
  const count = new Map<string, { handle: string; n: number }>();
  const add = (h: string) => {
    const k = h.toLowerCase();
    count.set(k, { handle: count.get(k)?.handle ?? h, n: (count.get(k)?.n ?? 0) + 1 });
  };
  for (const c of site.claims) {
    add(c.claim.registered_by);
    c.challenges.forEach((ch) => add(ch.submitted_by));
    c.replications.forEach((r) => add(r.submitted_by));
  }
  return [...count.values()]
    .filter((p) => isHandle(p.handle))
    .sort((a, b) => b.n - a.n || a.handle.localeCompare(b.handle))
    .map((p) => ({ handle: p.handle, contributions: p.n }));
}
