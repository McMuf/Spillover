import { Link } from "react-router-dom";
import type { SiteClaim, SiteData } from "../generated/site";
import { intervalText, pct, scoreboardRow } from "../lib/format";
import { EvidenceMeter } from "./EvidenceMeter";
import { InstrumentChip } from "./InstrumentChip";
import { StatusBadge } from "./StatusBadge";

/** Two seconds to the verdict: status badge, one-line statement, evidence meter, chips. */
export function ClaimCard({ item, site }: { item: SiteClaim; site: SiteData }) {
  const c = item.claim;
  const row = scoreboardRow(site.scoreboard.claims, c.id);
  const forward = row?.effective_events ?? 0;
  const b = item.backtest;
  return (
    <article className="rounded-[10px] border border-line bg-surface p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <StatusBadge status={item.status} />
        <Link
          to={`/claims/${c.id}`}
          className="font-mono text-xs text-muted underline-offset-2 hover:underline"
        >
          {c.id}
        </Link>
      </div>
      <h3 className="mb-3 text-base font-semibold leading-snug">
        <Link to={`/claims/${c.id}`} className="hover:underline">
          {c.statement.replace(/\s+/g, " ").trim()}
        </Link>
      </h3>
      <EvidenceMeter value={forward} max={c.success.min_forward_events} label="Forward events" />
      {b && (
        <p className="mt-3 text-xs text-muted">
          <span className="font-semibold uppercase tracking-wide">Backtest</span> · n={b.n_effective} · {pct(b.mean)}{" "}
          {intervalText(b.ci_lo, b.ci_hi)} · as of {b.as_of}
          {b.data_synthetic && " · synthetic data"}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <InstrumentChip instrument={c.instrument} />
      </div>
    </article>
  );
}
