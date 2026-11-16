import { lazy, Suspense, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Logo } from "../components/Logo";
import { Ready } from "../components/Ready";
import { StatusBadge } from "../components/StatusBadge";
import { PillButton, Tag } from "../components/ui";
import type { SiteData } from "../generated/site";
import { instrumentName } from "../lib/brands";
import { pct, scoreboardRow, STATUSES, venueLabel, type Status } from "../lib/format";
import { buildGraph } from "../lib/graph";
import { categoryOf, eventLabel } from "../lib/plain";

const GraphView = lazy(() => import("../components/GraphView"));

function ExploreBody({ site }: { site: SiteData }) {
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";
  const [status, setStatus] = useState<Status | "All">("All");
  const [view, setView] = useState<"table" | "graph">("table");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return site.claims.filter(
      (c) =>
        (status === "All" || c.status === status) &&
        (q === "" ||
          `${c.claim.id} ${c.claim.statement} ${c.claim.instrument.symbol} ${c.claim.event_type}`.toLowerCase().includes(q)),
    );
  }, [site, query, status]);
  const model = useMemo(() => buildGraph(shown, site), [shown, site]);
  const eventsTested = site.claims.reduce((n, c) => n + (c.backtest?.n_effective ?? 0), 0);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-8">
          <h1 className="text-3xl font-extrabold">Explore</h1>
          <dl className="flex gap-8 text-xs uppercase tracking-wide text-muted">
            <div><dt>Claims</dt><dd className="text-base font-bold normal-case text-fg">{site.claims.length}</dd></div>
            <div><dt>Past events tested</dt><dd className="text-base font-bold normal-case text-fg">{eventsTested}</dd></div>
          </dl>
        </div>
        <div role="group" aria-label="View" className="flex gap-2">
          <PillButton active={view === "table"} onClick={() => setView("table")} icon="explore">Table</PillButton>
          <PillButton active={view === "graph"} onClick={() => setView("graph")} icon="layers">Graph</PillButton>
        </div>
      </div>

      <div role="group" aria-label="Status" className="mb-5 flex gap-2 overflow-x-auto pb-1">
        {(["All", ...STATUSES] as (Status | "All")[]).map((s) => (
          <PillButton key={s} active={status === s} onClick={() => setStatus(s)}>
            {s}
          </PillButton>
        ))}
        {query && (
          <PillButton active={false} onClick={() => setParams({})} icon="close">
            “{query}”
          </PillButton>
        )}
      </div>

      <p className="mb-3 text-sm text-muted" role="status">
        {shown.length} of {site.claims.length} claim{site.claims.length === 1 ? "" : "s"}
      </p>

      {view === "table" ? (
        <div tabIndex={0} role="region" aria-label="Claims (scrollable)" className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[46rem] text-left text-sm">
            <caption className="sr-only">All claims</caption>
            <thead className="text-xs uppercase tracking-wide text-muted">
              <tr className="border-b border-line">
                <th scope="col" className="px-4 py-3 font-medium">Market</th>
                <th scope="col" className="px-4 py-3 font-medium">Event</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Backtest</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Events tested</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Forward</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((it) => {
                const c = it.claim;
                const cat = categoryOf(c.event_type);
                const fwd = scoreboardRow(site.scoreboard.claims, c.id)?.effective_events ?? 0;
                return (
                  <tr key={c.id} className="relative border-t border-line hover:bg-surface-alt">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Logo symbol={c.instrument.symbol} size={36} />
                        <div className="min-w-0">
                          <Link to={`/claims/${c.id}`} className="block font-bold after:absolute after:inset-0 after:content-['']">
                            {c.instrument.symbol}
                            <span className="sr-only">: {c.statement.replace(/\s+/g, " ").trim()}</span>
                          </Link>
                          <span className="block text-xs text-muted">{instrumentName(c.instrument.symbol)} · {venueLabel(c.instrument.venue)}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Tag hue={cat.hue}>{cat.name}</Tag>
                      <span className="mt-1 block max-w-[18rem] truncate text-xs text-muted" title={eventLabel(c.event_type)}>{eventLabel(c.event_type)}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">{it.backtest ? pct(it.backtest.mean) : "n/a"}</td>
                    <td className="px-4 py-3 text-right">{it.backtest?.n_effective ?? 0}</td>
                    <td className="px-4 py-3 text-right">{fwd} of {c.success.min_forward_events}</td>
                    <td className="px-4 py-3"><StatusBadge status={it.status} /></td>
                  </tr>
                );
              })}
              {shown.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-muted">No claims match. Clear the search or status filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <Suspense fallback={<p className="text-muted">Loading graph…</p>}>
          <GraphView model={model} label="Graph of the claims shown" />
        </Suspense>
      )}
    </>
  );
}

export default function ExplorePage() {
  return <Ready>{(site) => <ExploreBody site={site} />}</Ready>;
}
