import { Link } from "react-router-dom";
import type { SiteData } from "../generated/site";
import { claimStat, scoreboardRow } from "../lib/format";
import { ledger } from "../lib/ledger";
import { shortHeadline } from "../lib/plain";
import { Logo } from "./Logo";
import { StatusBadge } from "./StatusBadge";

/**
 * Every live claim as a numbered ledger entry. The number is the order it was frozen, which is a
 * real sequence; rules separate the entries because each row is one record.
 */
export function LedgerList({ site }: { site: SiteData }) {
  const entries = ledger(site);
  if (entries.length === 0) return null;
  return (
    <section aria-labelledby="ledger-h" className="mb-10">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="ledger-h" className="text-[22px] font-bold tracking-tight">
          The ledger
        </h2>
        <p className="text-sm text-muted">Every live claim, numbered in the order it was frozen.</p>
      </div>
      <ol className="border-t border-fg/80">
        {entries.map(({ no, item }) => {
          const c = item.claim;
          const b = item.backtest;
          const stat = claimStat(c.measure, b?.mean);
          const done = scoreboardRow(site.scoreboard.claims, c.id)?.effective_events ?? 0;
          return (
            <li key={c.id} className="border-b border-line">
              <Link
                to={`/claims/${c.id}`}
                className="group grid grid-cols-[2.25rem_minmax(0,1fr)] items-start gap-x-3 gap-y-2 py-4 md:grid-cols-[2.75rem_minmax(0,1fr)_9rem_7rem_8rem] md:items-center"
              >
                <span className="pt-1 text-sm font-semibold tabular-nums text-muted md:pt-0">{no}</span>
                <span className="min-w-0">
                  <span className="block font-serif text-[19px] leading-snug group-hover:underline">{shortHeadline(item)}</span>
                  <span className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                    <Logo symbol={c.instrument.symbol} size={16} />
                    {c.instrument.symbol}, registered by {c.registered_by}
                  </span>
                </span>
                <span className="col-start-2 text-sm md:col-start-auto">
                  {b ? (
                    <>
                      <span className={`font-bold tabular-nums ${stat.cls}`}>{stat.value}</span>{" "}
                      <span className="text-muted">backtest</span>
                    </>
                  ) : (
                    <span className="text-muted">Not tested yet</span>
                  )}
                </span>
                <span className="col-start-2 text-sm tabular-nums text-muted md:col-start-auto">
                  {done} of {c.success.min_forward_events} new events
                </span>
                <span className="col-start-2 md:col-start-auto md:justify-self-end">
                  <StatusBadge status={item.status} />
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
