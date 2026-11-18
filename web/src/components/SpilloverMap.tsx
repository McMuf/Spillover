import { Link } from "react-router-dom";
import type { SiteClaim } from "../generated/site";
import { claimStat } from "../lib/format";
import { spilloverMatrix } from "../lib/paths";
import { Logo } from "./Logo";

const MARK: Record<SiteClaim["status"], string> = {
  Draft: "draft",
  Proposed: "proposed",
  Supported: "✓ supported",
  "Not supported": "✕ not supported",
  Inconclusive: "≈ inconclusive",
};

/** What moves what: kinds of news down the side, markets across the top, one claim per filled cell. */
export function SpilloverMap({ claims }: { claims: SiteClaim[] }) {
  const m = spilloverMatrix(claims);
  if (m.rows.length === 0) return <p className="text-muted">No claims match.</p>;
  return (
    <div>
      <div tabIndex={0} role="region" aria-label="Map of news against markets (scrollable)" className="overflow-x-auto rounded-2xl bg-surface">
        <table className="w-full min-w-[36rem] border-collapse text-left">
          <caption className="sr-only">Claims by kind of news (rows) and market (columns). Each filled cell is a claim with its backtest estimate.</caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted">
                News ↓ · Market →
              </th>
              {m.cols.map((c) => (
                <th key={c.symbol} scope="col" className="px-4 py-3">
                  <span className="flex items-center gap-2">
                    <Logo symbol={c.symbol} size={28} />
                    <span>
                      <span className="block text-sm font-bold">{c.symbol}</span>
                      <span className="block text-xs font-normal text-muted">{c.name}</span>
                    </span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {m.rows.map((r) => (
              <tr key={r.type} className="border-b border-line last:border-b-0">
                <th scope="row" className="px-4 py-4 align-top">
                  <span className="block text-[15px] font-bold">{r.title}</span>
                  <span className="block text-xs font-normal text-muted">{r.topic}</span>
                </th>
                {m.cols.map((c) => {
                  const hits = m.cell(r.type, c.symbol);
                  return (
                    <td key={c.symbol} className="px-4 py-4 align-top">
                      {hits.length === 0 ? (
                        <span className="text-sm text-muted" aria-label="Not tested">
                          —
                        </span>
                      ) : (
                        <div className="space-y-2">
                          {hits.map((h) => (
                            <Link
                              key={h.claim.id}
                              to={`/claims/${h.claim.id}`}
                              className="block rounded-xl bg-surface-alt px-3 py-2 hover:bg-line"
                            >
                              <span className={`block text-[15px] font-bold tabular-nums ${claimStat(h.claim.measure, h.backtest?.mean).cls}`}>
                                {claimStat(h.claim.measure, h.backtest?.mean).text}
                              </span>
                              <span className="block text-xs text-muted">
                                {MARK[h.status]}
                                {h.backtest ? ` · n=${h.backtest.n_effective}` : ""}
                              </span>
                            </Link>
                          ))}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm text-muted">
        Each filled cell is a claim that this kind of news moves that market, with its backtest estimate. A dash means
        nobody has tested that pair yet, which makes it a good candidate for a new claim.
      </p>
    </div>
  );
}
