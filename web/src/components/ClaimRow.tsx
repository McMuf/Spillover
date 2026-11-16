import { Link } from "react-router-dom";
import type { SiteClaim, SiteData } from "../generated/site";
import { pct, scoreboardRow } from "../lib/format";
import { NodeShape } from "./NodeShape";
import { Sparkline } from "./Sparkline";
import { StatusBadge } from "./StatusBadge";
import { Tag } from "./ui";

/** A watchlist-style row: what it claims, where it trades, a trend line, and a neutral backtest pill. */
export function ClaimRow({ item, site }: { item: SiteClaim; site: SiteData }) {
  const c = item.claim;
  const b = item.backtest;
  const forward = scoreboardRow(site.scoreboard.claims, c.id)?.effective_events ?? 0;
  const statement = c.statement.replace(/\s+/g, " ").trim();
  return (
    <article className="flex items-center gap-3 border-t border-line py-4 first:border-t-0">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-surface-alt text-accent" aria-hidden="true">
        <NodeShape type="instrument" size={24} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-mono text-[17px] font-bold">{c.instrument.symbol}</span>
          <Tag>{c.instrument.venue.replace(/_/g, " ")}</Tag>
        </div>
        <h3 className="mt-0.5 text-sm font-medium leading-snug">
          <Link to={`/claims/${c.id}`} className="line-clamp-2 hover:underline">
            {statement}
          </Link>
        </h3>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
          <StatusBadge status={item.status} />
          <span>
            {forward} of {c.success.min_forward_events} forward events
          </span>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <Sparkline values={item.chart?.mean ?? []} width={84} height={30} />
        {b ? (
          <span className="rounded-lg bg-surface-alt px-2 py-1 text-xs font-bold" title={`Backtest estimate, n=${b.n_effective}`}>
            <span className="sr-only">Backtest </span>
            {pct(b.mean)}
          </span>
        ) : (
          <span className="text-xs text-muted">no backtest</span>
        )}
      </div>
    </article>
  );
}
