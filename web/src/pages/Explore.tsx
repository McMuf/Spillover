import { sortClaims, SORTS, type SortKey } from "../lib/ranking";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Highlight } from "../components/Highlight";
import { Logo } from "../components/Logo";
import { SpilloverMap } from "../components/SpilloverMap";
import { Ready } from "../components/Ready";
import { StatusBadge } from "../components/StatusBadge";
import { AreaChart } from "../components/AreaChart";
import { PillButton, Segmented, StatRow } from "../components/ui";
import type { SiteData } from "../generated/site";
import { instrumentName } from "../lib/brands";
import { claimStat, scoreboardRow } from "../lib/format";
import { categoryOf, highlightTerms, liveClaims, shortHeadline } from "../lib/plain";


const TH = "px-3 py-3 text-[13px] font-medium text-muted";
const TONE = { up: "up", down: "down", flat: "accent" } as const;

function ExploreBody({ site }: { site: SiteData }) {
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";
  // The topic lives in the address, so the sidebar's topic links open Explore already filtered.
  const topic = params.get("topic") ?? "All";
  const setTopic = (t: string) => {
    const next = new URLSearchParams(params);
    if (t === "All") next.delete("topic");
    else next.set("topic", t);
    setParams(next);
  };
  const [view, setView] = useState<"table" | "map">("table");
  const sort = (SORTS.find((s) => s.key === params.get("sort"))?.key ?? "kind") as SortKey;
  const setSort = (k: SortKey) => {
    const next = new URLSearchParams(params);
    if (k === "kind") next.delete("sort");
    else next.set("sort", k);
    setParams(next);
  };
  const topics = useMemo(() => ["All", ...new Set(liveClaims(site).map((c) => categoryOf(c.claim.event_type)))], [site]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matching = liveClaims(site).filter(
      (c) =>
        (topic === "All" || categoryOf(c.claim.event_type) === topic) &&
        (q === "" || `${c.claim.id} ${c.claim.statement} ${c.claim.instrument.symbol} ${shortHeadline(c)}`.toLowerCase().includes(q)),
    );
    return sortClaims(matching, sort, site);
  }, [site, query, topic, sort]);
  const eventsTested = liveClaims(site).reduce((n, c) => n + (c.backtest?.n_effective ?? 0), 0);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
          <h1 className="text-3xl font-extrabold tracking-tight">Explore</h1>
          <StatRow
            label="Explore totals"
            items={[
              { value: String(liveClaims(site).length), label: liveClaims(site).length === 1 ? "claim" : "claims" },
              { value: String(eventsTested), label: "past events tested" },
            ]}
          />
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

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm font-semibold">
          Sort
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-full border border-line bg-bg px-3 py-1.5 text-sm"
            aria-describedby="sort-rule"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <p id="sort-rule" className="text-xs text-muted">
          {SORTS.find((s) => s.key === sort)?.rule} No votes or popularity are used.
        </p>
      </div>

      <p className="sr-only" role="status">
        {shown.length} of {liveClaims(site).length} claims
      </p>

      {view === "table" ? (
        <div tabIndex={0} role="region" aria-label="Claims (scrollable)" className="relative overflow-x-auto rounded-[20px] bg-surface px-2">
          <table className="w-full min-w-[54rem] text-left text-[15px]">
            <caption className="sr-only">All claims</caption>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className={TH}>Market</th>
                <th scope="col" className={TH}>Claim</th>
                <th scope="col" className={`${TH} text-right`}>Events tested</th>
                <th scope="col" className={`${TH} text-right`}>Backtest</th>
                <th scope="col" className={TH}>
                  <span className="sr-only">Average path around past events</span>
                </th>
                <th scope="col" className={`${TH} text-right`}>Forward</th>
                <th scope="col" className={TH}>Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((it) => {
                const c = it.claim;
                const fwd = scoreboardRow(site.scoreboard.claims, c.id)?.effective_events ?? 0;
                return (
                  <tr key={c.id} className="relative border-b border-line last:border-b-0 hover:bg-surface-alt">
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
                    <td className={`px-3 py-4 text-right font-semibold tabular-nums ${claimStat(it.claim.measure, it.backtest?.mean).cls}`}>{claimStat(it.claim.measure, it.backtest?.mean).text}</td>
                    <td className="w-28 px-3 py-4" aria-hidden="true">
                      <AreaChart values={it.chart?.mean ?? []} height={30} tone={TONE[claimStat(c.measure, it.backtest?.mean).dir]} />
                    </td>
                    <td className="px-3 py-4 text-right tabular-nums">{fwd} of {c.success.min_forward_events}</td>
                    <td className="px-3 py-4"><StatusBadge status={it.status} /></td>
                  </tr>
                );
              })}
              {shown.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-8 text-muted">No claims match. Clear the search or topic filter.</td></tr>
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
