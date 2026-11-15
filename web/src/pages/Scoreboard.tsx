import { Link } from "react-router-dom";
import { CalibrationPlot } from "../components/CalibrationPlot";
import { Ready } from "../components/Ready";
import { StatusBadge } from "../components/StatusBadge";
import type { SiteData } from "../generated/site";
import { intervalText, pct, plainPct } from "../lib/format";

function Board({ site }: { site: SiteData }) {
  const sb = site.scoreboard;
  const placeboClaim = site.claims.find((c) => c.claim.event_type === "RANDOM_DATE");
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Scoreboard</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Generated from the outcome records, never hand-edited. Every number shows its sample size and interval. Small
          samples are flagged.
        </p>
      </header>

      <section aria-labelledby="claims-h">
        <h2 id="claims-h" className="mb-2 text-sm font-semibold">Registered claims</h2>
        {sb.claims.length === 0 ? (
          <p className="rounded-[10px] border border-dashed border-line p-4 text-sm text-muted">
            No claims are registered yet, so there is no forward evidence to score. Draft claims are on the{" "}
            <Link className="underline" to="/">claims page</Link> with backtest-only results.
          </p>
        ) : (
          <div tabIndex={0} role="region" aria-label="Scoreboard by claim (scrollable)" className="overflow-x-auto rounded-[10px] border border-line">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <caption className="sr-only">Scoreboard by claim</caption>
              <thead className="bg-surface-alt text-xs text-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Claim</th>
                  <th scope="col" className="px-3 py-2 font-medium">Status</th>
                  <th scope="col" className="px-3 py-2 font-medium">Effect (95% interval)</th>
                  <th scope="col" className="px-3 py-2 font-medium">Events</th>
                  <th scope="col" className="px-3 py-2 font-medium">Beat baseline</th>
                  <th scope="col" className="px-3 py-2 font-medium">Adj. p</th>
                </tr>
              </thead>
              <tbody>
                {sb.claims.map((r) => (
                  <tr key={r.claim_id} className="border-t border-line">
                    <td className="px-3 py-2"><Link className="font-mono text-xs underline" to={`/claims/${r.claim_id}`}>{r.claim_id}</Link>{r.placebo && <span className="ml-2 text-xs text-muted">placebo</span>}</td>
                    <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                    <td className="px-3 py-2">{pct(r.mean)} <span className="text-muted">{intervalText(r.ci_lo, r.ci_hi)}</span></td>
                    <td className="px-3 py-2">{r.effective_events} of {r.min_events}</td>
                    <td className="px-3 py-2">{r.beat_baseline ? "yes" : "no"}</td>
                    <td className="px-3 py-2">{r.q_value === null ? "n/a" : r.q_value.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="who-h">
        <h2 id="who-h" className="mb-2 text-sm font-semibold">Contributors</h2>
        {sb.contributors.length === 0 ? (
          <p className="text-sm text-muted">No contributors have a registered claim yet.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sb.contributors.map((c) => (
              <article key={c.registered_by} className="rounded-[10px] border border-line bg-surface p-4">
                <h3 className="font-semibold">{c.registered_by}</h3>
                <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
                  <div><dt className="text-xs text-muted">Claims</dt><dd className="text-lg font-semibold">{c.claims_registered}</dd></div>
                  <div><dt className="text-xs text-muted">Supported</dt><dd className="text-lg font-semibold">{plainPct(c.share_supported)}</dd></div>
                  <div><dt className="text-xs text-muted">Hit rate</dt><dd className="text-lg font-semibold">{plainPct(c.hit_rate)}</dd></div>
                </dl>
                <p className="mt-2 text-xs text-muted">{c.effective_events} effective events</p>
                {c.small_sample_note && <p className="mt-1 text-xs text-notice-fg" role="note">{c.small_sample_note}</p>}
              </article>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="cal-h">
        <h2 id="cal-h" className="mb-2 text-sm font-semibold">Calibration</h2>
        <CalibrationPlot bins={sb.calibration} />
      </section>

      <section aria-labelledby="placebo-h" className="rounded-[10px] border border-line bg-surface p-4">
        <h2 id="placebo-h" className="mb-1 text-sm font-semibold">Placebo (permanent)</h2>
        <p className="text-sm text-muted">
          A claim on random dates that should show nothing. If it ever works, the engine has a bug, and this page says so.
        </p>
        <p role={sb.placebo.alert ? "alert" : "status"} className={`mt-2 text-sm font-medium ${sb.placebo.alert ? "text-negative" : ""}`}>
          {sb.placebo.message}
        </p>
        {placeboClaim?.backtest && (
          <p className="mt-2 text-xs text-muted">
            Backtest of <Link className="font-mono underline" to={`/claims/${placeboClaim.claim.id}`}>{placeboClaim.claim.id}</Link>:{" "}
            {pct(placeboClaim.backtest.mean)} {intervalText(placeboClaim.backtest.ci_lo, placeboClaim.backtest.ci_hi)}, n={placeboClaim.backtest.n_effective}.
          </p>
        )}
      </section>

      <ul className="space-y-1 text-xs text-muted">
        {sb.notes.map((n) => <li key={n}>{n}</li>)}
      </ul>
    </div>
  );
}

export default function ScoreboardPage() {
  return <Ready>{(site) => <Board site={site} />}</Ready>;
}
