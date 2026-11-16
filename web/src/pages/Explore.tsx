import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Highlight } from "../components/Highlight";
import { Logo } from "../components/Logo";
import { SpilloverMap } from "../components/SpilloverMap";
import { Ready } from "../components/Ready";
import { StatusBadge } from "../components/StatusBadge";
import { PillButton, Segmented } from "../components/ui";
import type { SiteData } from "../generated/site";
import { instrumentName } from "../lib/brands";
import { dirText, pct, scoreboardRow } from "../lib/format";
import { categoryOf, highlightTerms, shortHeadline } from "../lib/plain";


const TH = "px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted";

function ExploreBody({ site }: { site: SiteData }) {
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";
  const [topic, setTopic] = useState("All");
  const [view, setView] = useState<"table" | "map">("table");
  const topics = useMemo(() => ["All", ...new Set(site.claims.map((c) => categoryOf(c.claim.event_type)))], [site]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return site.claims.filter(
      (c) =>
        (topic === "All" || categoryOf(c.claim.event_type) === topic) &&
        (q === "" || `${c.claim.id} ${c.claim.statement} ${c.claim.instrument.symbol} ${shortHeadline(c)}`.toLowerCase().includes(q)),
    );
  }, [site, query, topic]);
  const eventsTested = site.claims.reduce((n, c) => n + (c.backtest?.n_effective ?? 0), 0);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
          <h1 className="text-3xl font-extrabold tracking-tight">Explore</h1>
          <dl className="flex gap-8">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">Claims</dt>
              <dd className="text-[15px] font-bold">{site.claims.length}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">Past events tested</dt>
              <dd className="text-[15px] font-bold">{eventsTested}</dd>
            </div>
          </dl>
        </div>
        <Segmented
          label="View"
          value={view}
          onChange={setView}
          options={[
            { value: "table", label: "Table" },
            { value: "map", label: "Map" },
          ]}
        />
      </div>

      <div role="group" aria-label="Topic" className="no-scrollbar mb-4 flex gap-2 overflow-x-auto">
        {topics.map((t) => (
          <PillButton key={t} active={topic === t} onClick={() => setTopic(t)}>
            {t}
          </PillButton>
        ))}
        {query && (
          <PillButton active={false} onClick={() => setParams({})} icon="close" label={`Clear search for ${query}`}>
            “{query}”
          </PillButton>
        )}
      </div>

      <p className="sr-only" role="status">
        {shown.length} of {site.claims.length} claims
      </p>

      {view === "table" ? (
        <div tabIndex={0} role="region" aria-label="Claims (scrollable)" className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-left text-[15px]">
            <caption className="sr-only">All claims</caption>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className={TH}>Market</th>
                <th scope="col" className={TH}>Claim</th>
                <th scope="col" className={`${TH} text-right`}>Events tested</th>
                <th scope="col" className={`${TH} text-right`}>Backtest</th>
                <th scope="col" className={`${TH} text-right`}>Forward</th>
                <th scope="col" className={TH}>Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((it) => {
                const c = it.claim;
                const fwd = scoreboardRow(site.scoreboard.claims, c.id)?.effective_events ?? 0;
                return (
                  <tr key={c.id} className="relative border-b border-line hover:bg-surface">
                    <td className="px-3 py-4">
                      <div className="flex items-center gap-3">
                        <Logo symbol={c.instrument.symbol} size={36} />
                        <div>
                          <p className="font-bold">{c.instrument.symbol}</p>
                          <p className="text-sm text-muted">{instrumentName(c.instrument.symbol)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="max-w-[24rem] px-3 py-4">
                      <Link to={`/claims/${c.id}`} className="line-clamp-2 font-medium after:absolute after:inset-0 after:content-['']">
                        <Highlight text={shortHeadline(it)} terms={highlightTerms(it)} />
                      </Link>
                      <p className="text-xs text-muted">{categoryOf(c.event_type)}</p>
                    </td>
                    <td className="px-3 py-4 text-right tabular-nums">{it.backtest?.n_effective ?? 0}</td>
                    <td className={`px-3 py-4 text-right font-semibold tabular-nums ${dirText(it.backtest?.mean)}`}>{it.backtest ? pct(it.backtest.mean) : "n/a"}</td>
                    <td className="px-3 py-4 text-right tabular-nums">{fwd} of {c.success.min_forward_events}</td>
                    <td className="px-3 py-4"><StatusBadge status={it.status} /></td>
                  </tr>
                );
              })}
              {shown.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-8 text-muted">No claims match. Clear the search or topic filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <SpilloverMap claims={shown} />
      )}
    </>
  );
}

export default function ExplorePage() {
  return <Ready>{(site) => <ExploreBody site={site} />}</Ready>;
}
