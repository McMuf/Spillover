import { lazy, Suspense, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ClaimCard } from "../components/ClaimCard";
import { Intro } from "../components/Intro";
import { NodeLegend } from "../components/NodeLegend";
import { Ready } from "../components/Ready";
import { FilterTabs, PillButton, Stamp } from "../components/ui";
import { STATUSES, type Status } from "../lib/format";
import { buildGraph } from "../lib/graph";
import type { SiteData } from "../generated/site";

const GraphView = lazy(() => import("../components/GraphView"));

function ClaimsMap({ site }: { site: SiteData }) {
  const [params] = useSearchParams();
  const query = params.get("q") ?? "";
  const [status, setStatus] = useState<Status | "All">("All");
  const [view, setView] = useState<"cards" | "graph">("cards");

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
      <Intro />

      <section id="claims" aria-labelledby="claims-h" className="scroll-mt-28">
        <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
          <h2 id="claims-h" className="text-2xl font-bold">
            Claims
          </h2>
          <Stamp>As of {site.meta.data_as_of}</Stamp>
        </div>

        <FilterTabs label="Status" value={status} options={["All", ...STATUSES] as (Status | "All")[]} onChange={setStatus} />

        <div className="my-4 flex items-center justify-between gap-3">
          <p className="text-sm text-muted" role="status">
            {shown.length} of {site.claims.length} claim{site.claims.length === 1 ? "" : "s"}
            {query && <> matching “{query}”</>}
          </p>
          <div role="group" aria-label="View" className="flex gap-2">
            {(["cards", "graph"] as const).map((v) => (
              <PillButton key={v} active={view === v} onClick={() => setView(v)}>
                {v === "cards" ? "Cards" : "Graph"}
              </PillButton>
            ))}
          </div>
        </div>

        {view === "cards" ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {shown.map((c) => (
              <ClaimCard key={c.claim.id} item={c} site={site} />
            ))}
            {shown.length === 0 && <p className="text-muted">No claims match. Clear the search or status filter.</p>}
          </div>
        ) : (
          <Suspense fallback={<p className="text-muted">Loading graph…</p>}>
            <GraphView model={model} label="Graph of the claims shown" />
          </Suspense>
        )}
      </section>

      <div className="mt-10">
        <NodeLegend />
      </div>
    </>
  );
}

export default function Home() {
  return <Ready>{(site) => <ClaimsMap site={site} />}</Ready>;
}
