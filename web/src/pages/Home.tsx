import { lazy, Suspense, useMemo, useState } from "react";
import { ClaimCard } from "../components/ClaimCard";
import { useTheme } from "../components/ThemeContext";
import { NodeLegend } from "../components/NodeLegend";
import { Ready } from "../components/Ready";
import { STATUSES, type Status } from "../lib/format";
import { buildGraph } from "../lib/graph";
import type { SiteData } from "../generated/site";

const GraphView = lazy(() => import("../components/GraphView"));

function ClaimsMap({ site }: { site: SiteData }) {
  const { theme } = useTheme();
  const [query, setQuery] = useState("");
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
      <section className="mb-6">
        <h1 className="mb-2 text-2xl font-bold tracking-tight sm:text-3xl">Write the claim. Freeze the call. Let the market grade it.</h1>
        <p className="max-w-2xl text-muted">
          An open ledger that tests how news spills over into markets. Each claim is frozen before the outcome, then
          graded against what the broader market already explains. Inconclusive means “not enough data yet”.
        </p>
      </section>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex min-w-[12rem] flex-1 flex-col text-xs text-muted">
          Search claims
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="id, statement, symbol…"
            className="mt-1 rounded-[10px] border border-line bg-surface px-3 py-2 text-sm text-fg"
          />
        </label>
        <label className="flex flex-col text-xs text-muted">
          Status
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Status | "All")}
            className="mt-1 rounded-[10px] border border-line bg-surface px-3 py-2 text-sm text-fg"
          >
            <option>All</option>
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <div role="group" aria-label="View" className="flex rounded-full border border-line p-0.5 text-sm">
          {(["cards", "graph"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={`rounded-full px-4 py-1.5 capitalize ${view === v ? "bg-accent text-on-accent" : "text-muted hover:text-fg"}`}
            >
              {v === "cards" ? "Cards" : "Graph"}
            </button>
          ))}
        </div>
      </div>

      <p className="mb-3 text-sm text-muted" role="status">
        {shown.length} of {site.claims.length} claim{site.claims.length === 1 ? "" : "s"}
      </p>

      {view === "cards" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {shown.map((c) => (
            <ClaimCard key={c.claim.id} item={c} site={site} />
          ))}
          {shown.length === 0 && <p className="text-muted">No claims match. Clear the search or status filter.</p>}
        </div>
      ) : (
        <Suspense fallback={<p className="text-muted">Loading graph…</p>}>
          <GraphView model={model} theme={theme} label="Graph of the claims shown" />
        </Suspense>
      )}

      <div className="mt-8">
        <NodeLegend />
      </div>
    </>
  );
}

export default function Home() {
  return <Ready>{(site) => <ClaimsMap site={site} />}</Ready>;
}
