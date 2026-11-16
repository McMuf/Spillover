import { Link } from "react-router-dom";
import type { SiteClaim, SiteData } from "../generated/site";
import { pct, scoreboardRow, venueLabel } from "../lib/format";
import { Logo } from "./Logo";
import { Sparkline } from "./Sparkline";
import { StatusBadge } from "./StatusBadge";
import { Tag } from "./ui";

/** A market-style card: logo and one-sentence claim, two key numbers, status. The whole card is a link. */
export function ClaimCard({ item, site }: { item: SiteClaim; site: SiteData }) {
  const c = item.claim;
  const b = item.backtest;
  const forward = scoreboardRow(site.scoreboard.claims, c.id)?.effective_events ?? 0;
  return (
    <article className="relative flex flex-col rounded-xl border border-line bg-surface p-4 transition-colors hover:border-muted">
      <div className="flex gap-3">
        <Logo symbol={c.instrument.symbol} />
        <h3 className="min-w-0 flex-1 text-base font-semibold leading-snug">
          <Link to={`/claims/${c.id}`} className="line-clamp-3 after:absolute after:inset-0 after:content-['']">
            {c.statement.replace(/\s+/g, " ").trim()}
          </Link>
        </h3>
      </div>

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted">Backtest estimate</dt>
          <dd className="flex items-center gap-3">
            <Sparkline values={item.chart?.mean ?? []} width={64} height={24} />
            {b ? (
              <span data-testid="backtest-pill" className="min-w-[76px] rounded-lg bg-surface-alt px-2.5 py-1.5 text-center font-bold">
                {pct(b.mean)}
              </span>
            ) : (
              <span className="text-muted">n/a</span>
            )}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted">Forward events</dt>
          <dd className="min-w-[76px] rounded-lg bg-surface-alt px-2.5 py-1.5 text-center font-bold">
            {forward} of {c.success.min_forward_events}
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <StatusBadge status={item.status} />
        <Tag>{c.instrument.symbol}</Tag>
        <span className="text-xs text-muted">{venueLabel(c.instrument.venue)}</span>
      </div>
    </article>
  );
}
