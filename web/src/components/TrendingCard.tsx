import { Link } from "react-router-dom";
import type { SiteClaim } from "../generated/site";
import { pct } from "../lib/format";
import { categoryOf, highlightTerms, shortHeadline, whatWeTest } from "../lib/plain";
import { AreaChart } from "./AreaChart";
import { Highlight } from "./Highlight";
import { StatusBadge } from "./StatusBadge";
import { Stamp, Tag, TickerChip } from "./ui";

/**
 * A news-style tile for a claim. Where a news site shows a photo, this shows the claim's own data:
 * the average market path around past events, with the event day marked.
 */
export function TrendingCard({ item }: { item: SiteClaim }) {
  const c = item.claim;
  const b = item.backtest;
  const chart = item.chart;
  return (
    <article className="relative flex h-full flex-col overflow-hidden rounded-2xl bg-surface transition-colors hover:bg-surface-alt">
      <div className="relative bg-surface-alt pt-12">
        <div className="absolute left-4 top-4 flex gap-2">
          <Tag>{categoryOf(c.event_type)}</Tag>
        </div>
        <AreaChart values={chart?.mean ?? []} markIndex={chart?.days.indexOf(0)} height={120} />
      </div>
      <div className="flex flex-1 flex-col p-5">
        <Stamp>
          {b ? `${b.n_effective} past events tested` : "Not tested yet"}
          {b && ` · as of ${b.as_of}`}
        </Stamp>
        <h3 className="mt-2 text-xl font-bold leading-snug">
          <Link to={`/claims/${c.id}`} className="after:absolute after:inset-0 after:content-['']">
            <Highlight text={shortHeadline(item)} terms={highlightTerms(item)} />
          </Link>
        </h3>
        <p className="mt-2 line-clamp-3 text-[15px] leading-relaxed text-muted">{whatWeTest(item)}</p>
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-5">
          <TickerChip symbol={c.instrument.symbol} value={b ? pct(b.mean) : undefined} />
          <StatusBadge status={item.status} />
        </div>
      </div>
    </article>
  );
}
