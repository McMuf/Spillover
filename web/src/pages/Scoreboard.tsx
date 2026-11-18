import { PersonLink } from "../components/PersonLink";
import { Link } from "react-router-dom";
import { CalibrationPlot } from "../components/CalibrationPlot";
import { Identicon } from "../components/Identicon";
import { Ready } from "../components/Ready";
import { StatusBadge } from "../components/StatusBadge";
import { Card } from "../components/ui";
import type { SiteData } from "../generated/site";
import { dirText, intervalText, pct, plainPct } from "../lib/format";

function Board({ site }: { site: SiteData }) {
  const sb = site.scoreboard;
  const stamp = `As of ${site.meta.data_as_of}`;
  const placeboClaim = site.claims.find((c) => c.claim.event_type === "RANDOM_DATE");
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">
        Generated from the outcome records, never hand-edited. Every number shows its sample size and interval. Small
        samples are flagged.
      </p>

      <Card title="Scoreboard" stamp={stamp} id="claims-h">
        <h2 className="sr-only">Registered claims</h2>
        {sb.claims.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">
            No claims are registered yet, so there is no forward evidence to score. Draft claims are on the{" "}
            <Link className="underline" to="/">claims page</Link> with backtest-only results.
          </p>
        ) : (
          <div tabIndex={0} role="region" aria-label="Scoreboard by claim (scrollable)" className="overflow-x-auto rounded-2xl bg-surface">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <caption className="sr-only">Scoreboard by claim</caption>
              <thead className="bg-surface-alt text-xs text-muted">
                <tr>
                  <th scope="col" className="px-3 py-2.5 font-medium">Claim</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Effect (95% interval)</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Events</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Beat baseline</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Adj. p</th>
                </tr>
              </thead>
              <tbody>
                {sb.claims.map((r) => (
                  <tr key={r.claim_id} className="border-t border-line">
                    <td className="px-3 py-3"><Link className="font-mono text-xs underline" to={`/claims/${r.claim_id}`}>{r.claim_id}</Link>{r.placebo && <span className="ml-2 text-xs text-muted">placebo</span>}</td>
                    <td className="px-3 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-3 py-3"><span className={`font-semibold ${dirText(r.mean)}`}>{pct(r.mean)}</span> <span className="text-muted">{intervalText(r.ci_lo, r.ci_hi)}</span></td>
                    <td className="px-3 py-3">{r.effective_events} of {r.min_events}</td>
                    <td className="px-3 py-3">{r.beat_baseline ? "yes" : "no"}</td>
                    <td className="px-3 py-3">{r.q_value === null ? "n/a" : r.q_value.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Contributors" stamp={stamp} id="who-h">
        {sb.contributors.length === 0 ? (
          <p className="text-sm text-muted">No contributors have a registered claim yet.</p>
        ) : (
          <ul>
            {sb.contributors.map((c) => (
              <li key={c.registered_by} className="border-t border-line py-4 first:border-t-0">
                <div className="flex items-center gap-3">
                  <Identicon handle={c.registered_by} />
                  <h3 className="text-lg font-bold">
                    <PersonLink handle={c.registered_by} className="hover:underline" />
                  </h3>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                  {[
                    ["Claims", String(c.claims_registered)],
                    ["Supported", plainPct(c.share_supported)],
                    ["Hit rate", plainPct(c.hit_rate)],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-xl bg-surface-alt px-2 py-3">
                      <dt className="text-xs text-muted">{k}</dt>
                      <dd className="text-xl font-extrabold">{v}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-2 text-xs text-muted">{c.effective_events} effective events</p>
                {c.small_sample_note && <p className="mt-1 text-xs text-notice-fg" role="note">{c.small_sample_note}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Calibration" stamp={stamp} id="cal-h">
        <CalibrationPlot bins={sb.calibration} />
      </Card>

      <Card title="Placebo" stamp="Permanent" id="placebo-h">
        <p className="text-sm text-muted">
          A claim on random dates that should show nothing. If it ever works, the engine has a bug, and this page says so.
        </p>
        <p role={sb.placebo.alert ? "alert" : "status"} className={`mt-3 text-sm font-medium ${sb.placebo.alert ? "text-negative" : ""}`}>
          {sb.placebo.message}
        </p>
        {placeboClaim?.backtest && (
          <p className="mt-2 text-xs text-muted">
            Backtest of <Link className="font-mono underline" to={`/claims/${placeboClaim.claim.id}`}>{placeboClaim.claim.id}</Link>:{" "}
            <span className={dirText(placeboClaim.backtest.mean)}>{pct(placeboClaim.backtest.mean)}</span> {intervalText(placeboClaim.backtest.ci_lo, placeboClaim.backtest.ci_hi)}, n={placeboClaim.backtest.n_effective}.
          </p>
        )}
      </Card>

      <ul className="space-y-1 text-xs text-muted">
        {sb.notes.map((n) => <li key={n}>{n}</li>)}
      </ul>
    </div>
  );
}

export default function ScoreboardPage() {
  return <Ready>{(site) => <Board site={site} />}</Ready>;
}
