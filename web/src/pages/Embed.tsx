import { useParams } from "react-router-dom";
import { EvidenceMeter } from "../components/EvidenceMeter";
import { InstrumentChip } from "../components/InstrumentChip";
import { Ready } from "../components/Ready";
import { StatusBadge } from "../components/StatusBadge";
import { findClaim } from "../lib/data";
import { intervalText, pct, scoreboardRow } from "../lib/format";

/**
 * A compact claim card with no site chrome, meant to be framed on other pages. It is read-only,
 * keeps the status, the evidence meter, the backtest label and the disclaimer, and links back.
 */
export default function EmbedClaim() {
  const { id } = useParams();
  return (
    <main className="p-3">
      <Ready>
        {(site) => {
          const item = findClaim(site, id);
          if (!item) return <p className="text-sm text-muted">This claim was not found.</p>;
          const c = item.claim;
          const row = scoreboardRow(site.scoreboard.claims, c.id);
          const b = item.backtest;
          const full = `${window.location.origin}${window.location.pathname}#/claims/${c.id}`;
          return (
            <article className="rounded-xl border border-line bg-surface p-5" data-testid="embed-card">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <StatusBadge status={item.status} />
                <span className="font-mono text-xs text-muted">{c.id}</span>
              </div>
              <h1 className="mb-3 text-base font-semibold leading-snug">{c.statement.replace(/\s+/g, " ").trim()}</h1>
              <EvidenceMeter value={row?.effective_events ?? 0} max={c.success.min_forward_events} label="Forward events" />
              {b && (
                <p className="mt-3 text-xs text-muted">
                  <span className="font-semibold uppercase tracking-wide">Backtest</span> · n={b.n_effective} ·{" "}
                  {pct(b.mean)} {intervalText(b.ci_lo, b.ci_hi)} · as of {b.as_of}
                  {b.data_synthetic && " · SYNTHETIC data"}
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <InstrumentChip instrument={c.instrument} />
                <a className="text-xs underline" href={full} target="_blank" rel="noopener noreferrer">
                  View on Spillover
                </a>
              </div>
              <p className="mt-3 border-t border-line pt-2 text-[11px] text-muted">
                Research, not investment advice. A backtest is not forward evidence.
              </p>
            </article>
          );
        }}
      </Ready>
    </main>
  );
}
