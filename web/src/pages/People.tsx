import { Link, useParams } from "react-router-dom";
import { Identicon } from "../components/Identicon";
import { Ready } from "../components/Ready";
import { StatusBadge } from "../components/StatusBadge";
import { Icon } from "../components/Icon";
import { BackButton, Card, StatRow, Tag, TickerChip } from "../components/ui";
import type { SiteData } from "../generated/site";
import { plainPct } from "../lib/format";
import { isHandle, people, profileOf, type Profile } from "../lib/people";
import { shortHeadline } from "../lib/plain";

const flat = (t: string) => t.replace(/\s+/g, " ").trim();

function TrackRecord({ p }: { p: Profile }) {
  const r = p.record;
  if (!r || r.claims_with_verdict === 0) {
    return (
      <p className="text-sm leading-relaxed text-muted">
        No verdicts yet. A track record builds as this person&apos;s claims collect enough new events to be graded; until
        then there is nothing to score, which is not the same as being wrong.
      </p>
    );
  }
  return (
    <dl className="grid gap-4 text-sm sm:grid-cols-3">
      <div>
        <dt className="text-xs text-muted">Claims with a verdict</dt>
        <dd className="text-xl font-bold">
          {r.claims_with_verdict} of {r.claims_registered}
        </dd>
      </div>
      <div>
        <dt className="text-xs text-muted">Supported</dt>
        <dd className="text-xl font-bold">{plainPct(r.share_supported)}</dd>
      </div>
      <div>
        <dt className="text-xs text-muted">Forward calls right</dt>
        <dd className="text-xl font-bold">{plainPct(r.hit_rate)}</dd>
      </div>
      {r.small_sample_note && <p className="text-xs text-muted sm:col-span-3">{r.small_sample_note}</p>}
    </dl>
  );
}

function Person({ p }: { p: Profile }) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <BackButton to="/people" label="Back to people" />
      <header className="overflow-hidden bg-surface">
        <div className="h-16 bg-surface-alt" aria-hidden="true" />
        <div className="px-5 pb-5">
          <div className="-mt-8 flex flex-wrap items-end justify-between gap-3">
            <span className="bg-surface p-1">
              <Identicon handle={p.handle} size={64} />
            </span>
            {isHandle(p.handle) && (
              <a
                href={`https://github.com/${p.handle}`}
                className="inline-flex items-center gap-1.5 border border-line px-4 py-1.5 text-sm font-semibold hover:bg-surface-alt"
                rel="noopener noreferrer"
              >
                GitHub profile
                <Icon name="external" size={14} />
              </a>
            )}
          </div>
          <h1 className="mt-3 truncate text-[26px] font-extrabold leading-tight">{p.handle}</h1>
          <p className="text-sm text-muted">@{p.handle}, contributor</p>
          <div className="mt-4">
            <StatRow
              label={`${p.handle} on the record`}
              items={[
                { value: String(p.claims.length), label: p.claims.length === 1 ? "claim" : "claims" },
                { value: String(p.challenges.length), label: p.challenges.length === 1 ? "challenge" : "challenges" },
                { value: String(p.replications.length), label: p.replications.length === 1 ? "replication" : "replications" },
              ]}
            />
          </div>
        </div>
      </header>

      <Card title="Track record" id="record" kicker={{ icon: "scale", label: "Graded by the market" }}>
        <TrackRecord p={p} />
      </Card>

      <Card title="Claims" id="person-claims">
        {p.claims.length === 0 ? (
          <p className="text-sm text-muted">No claims registered yet.</p>
        ) : (
          <ul className="space-y-4">
            {p.claims.map((c) => (
              <li key={c.claim.id} className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link to={`/claims/${c.claim.id}`} className="font-semibold hover:underline">
                    {shortHeadline(c)}
                  </Link>
                  <p className="font-mono text-xs text-muted">{c.claim.id}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <TickerChip symbol={c.claim.instrument.symbol} />
                  <StatusBadge status={c.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {p.challenges.length > 0 && (
        <Card title="Challenges" id="person-challenges">
          <ul className="space-y-4">
            {p.challenges.map(({ claim, challenge }) => (
              <li key={challenge.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <Tag>{challenge.aspect}</Tag>
                  <Link to={`/claims/${claim.claim.id}`} className="text-sm font-semibold hover:underline">
                    {shortHeadline(claim)}
                  </Link>
                </div>
                <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-muted">{flat(challenge.argument)}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {p.replications.length > 0 && (
        <Card title="Replications" id="person-replications">
          <ul className="space-y-4">
            {p.replications.map(({ claim, replication }) => (
              <li key={replication.id}>
                <Link to={`/claims/${claim.claim.id}`} className="text-sm font-semibold hover:underline">
                  {shortHeadline(claim)}
                </Link>
                <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-muted">{flat(replication.rationale)}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Everyone({ site }: { site: SiteData }) {
  const list = people(site);
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-3xl font-extrabold tracking-tight">People</h1>
      <p className="mb-6 text-[15px] leading-relaxed text-muted">
        Everyone with a claim, challenge or replication on the record. Each profile shows what they registered, what they
        challenged, and their track record once their claims are graded.
      </p>
      <ul>
        {list.map((p) => (
          <li key={p.handle} className="border-t border-line py-3 first:border-t-0">
            <Link to={`/people/${p.handle}`} className="flex items-center gap-3 hover:underline">
              <Identicon handle={p.handle} size={36} />
              <span className="font-semibold">{p.handle}</span>
              <span className="text-sm text-muted">
                {p.contributions} contribution{p.contributions === 1 ? "" : "s"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function PeoplePage() {
  const { handle } = useParams();
  return (
    <Ready>
      {(site) => {
        if (!handle) return <Everyone site={site} />;
        const p = isHandle(handle) ? profileOf(site, handle) : undefined;
        if (!p) {
          return (
            <p>
              Nobody named <code className="font-mono">{handle}</code> has anything on the record.{" "}
              <Link className="underline" to="/people">
                See everyone
              </Link>
              .
            </p>
          );
        }
        return <Person p={p} />;
      }}
    </Ready>
  );
}
