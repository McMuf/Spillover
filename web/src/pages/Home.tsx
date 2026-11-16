import { lazy, Suspense, useMemo, useState } from "react";
import { ClaimRow } from "../components/ClaimRow";
import { Hero } from "../components/Hero";
import { NodeLegend } from "../components/NodeLegend";
import { Ready } from "../components/Ready";
import { Card, PillButton, SectionTabs, Stamp } from "../components/ui";
import { STATUSES, type Status } from "../lib/format";
import { buildGraph } from "../lib/graph";
import type { SiteData } from "../generated/site";

const GraphView = lazy(() => import("../components/GraphView"));

function ClaimsMap({ site }: { site: SiteData }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status | "All">("All");
  const [view, setView] = useState<"list" | "graph">("list");

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

  return (
    <>
      <SectionTabs />
      <Hero />

      <Card title="Claims" stamp={`As of ${site.meta.data_as_of}`}>
        <label className="mb-3 block text-sm text-muted">
          <span className="sr-only">Search claims</span>
          <input
            type="search"
            aria-label="Search claims"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search id, statement, symbol…"
            className="w-full rounded-full border border-line bg-surface-alt px-5 py-3 text-[15px] text-fg placeholder:text-muted"
          />
        </label>

        <div role="group" aria-label="Status" className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1">
          {(["All", ...STATUSES] as const).map((s) => (
            <PillButton key={s} active={status === s} onClick={() => setStatus(s)}>
              {s}
            </PillButton>
          ))}
        </div>

        <div className="mb-1 flex items-center justify-between gap-3">
          <p className="text-sm text-muted" role="status">
            {shown.length} of {site.claims.length} claim{site.claims.length === 1 ? "" : "s"}
          </p>
          <div role="group" aria-label="View" className="flex gap-2">
            {(["list", "graph"] as const).map((v) => (
              <PillButton key={v} active={view === v} onClick={() => setView(v)}>
                {v === "list" ? "List" : "Graph"}
              </PillButton>
            ))}
          </div>
        </div>

        {view === "list" ? (
          <div>
            {shown.map((c) => (
              <ClaimRow key={c.claim.id} item={c} site={site} />
            ))}
            {shown.length === 0 && <p className="py-4 text-muted">No claims match. Clear the search or status filter.</p>}
          </div>
        ) : (
          <Suspense fallback={<p className="text-muted">Loading graph…</p>}>
            <GraphView model={model} label="Graph of the claims shown" />
          </Suspense>
        )}
        <div className="mt-2 flex justify-end">
          <Stamp>Backtest figures are neutral</Stamp>
        </div>
      </Card>

      <div className="mt-6">
        <NodeLegend />
      </div>
    </>
  );
}

export default function Home() {
  return <Ready>{(site) => <ClaimsMap site={site} />}</Ready>;
}
