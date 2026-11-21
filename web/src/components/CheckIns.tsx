import type { SiteClaim } from "../generated/site";
import { claimStat, intervalText } from "../lib/format";

/**
 * Check-ins: how the claim's effect looks after 1 week, 1 month, 6 months, 1 year and 5 years. The
 * claim is graded only on the window it chose up front; check-ins are descriptions of longer-term
 * trends, never grades, because over months many other things move a market.
 */
export function CheckIns({ item }: { item: SiteClaim }) {
  const horizons = item.backtest?.horizons ?? [];
  const m = item.claim.measure;
  if (horizons.length === 0) return null;
  return (
    <section aria-labelledby="checkins-h" className="space-y-3">
      <div>
        <h2 id="checkins-h" className="text-lg font-bold">
          Check-ins over time
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          The claim is graded only on its own window. These show the same effect over longer spans, from past events, so
          you can see whether it fades, holds or grows. They are descriptions, never grades.
        </p>
      </div>
      <ol className="grid gap-2 sm:grid-cols-5" aria-label="Check-ins from past events">
        {horizons.map((h) => {
          const stat = claimStat(m, h.mean);
          return (
            <li key={h.label} className="rounded-xl border border-line bg-bg p-3">
              <p className="text-[13px] font-medium text-muted">{h.label}</p>
              {h.note ? (
                <p className="mt-1 text-xs leading-snug text-muted">{h.note}</p>
              ) : (
                <>
                  <p className={`mt-1 text-lg font-bold tabular-nums ${stat.cls}`}>{stat.value}</p>
                  <p className="text-[11px] leading-snug text-muted">
                    {h.n_events} event{h.n_events === 1 ? "" : "s"}, range {intervalText(h.ci_lo, h.ci_hi, m)}
                  </p>
                </>
              )}
            </li>
          );
        })}
      </ol>
      <p className="text-xs leading-relaxed text-muted">
        Longer spans have fewer independent past events, because windows that overlap count once, and they keep other news
        inside the window. Each frozen prediction gets the same check-ins as its dates pass (see the forward log).
      </p>
    </section>
  );
}
