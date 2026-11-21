import { PersonLink } from "../components/PersonLink";
import { Link } from "react-router-dom";
import { CalibrationPlot } from "../components/CalibrationPlot";
import { Identicon } from "../components/Identicon";
import { Logo } from "../components/Logo";
import { Ready } from "../components/Ready";
import { StatusBadge } from "../components/StatusBadge";
import { Card, StatRow } from "../components/ui";
import type { SiteData } from "../generated/site";
import { claimStat, dirText, intervalText, pct, plainPct } from "../lib/format";
import { shortHeadline } from "../lib/plain";

/** Market logo, symbol in the accent color and the claim in words, with its id underneath. */
function ClaimCell({ site, id, placebo }: { site: SiteData; id: string; placebo: boolean }) {
  const item = site.claims.find((c) => c.claim.id === id);
  if (!item) {
    return (
      <Link className="font-mono text-xs underline" to={`/claims/${id}`}>
        {id}
      </Link>
    );
  }
  const symbol = item.claim.instrument.symbol;
  return (
    <Link to={`/claims/${id}`} className="group flex items-center gap-3">
      <Logo symbol={symbol} size={28} />
      <span className="min-w-0">
        <span className="block text-sm font-semibold">
          <span className="font-bold">{symbol}</span>{" "}
          <span className="group-hover:underline">{shortHeadline(item)}</span>
        </span>
        <span className="block font-mono text-[11px] text-muted">
          {id}
          {placebo && ", placebo"}
        </span>
      </span>
    </Link>
  );
}

function Board({ site }: { site: SiteData }) {
  const sb = site.scoreboard;
  const stamp = `As of ${site.meta.data_as_of}`;
  const placeboClaim = site.claims.find((c) => c.claim.event_type === "RANDOM_DATE");
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight">Scoreboard</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Built automatically from the outcome records. Every number shows its sample size and interval. Small
          samples are flagged.
        </p>
        <div className="mt-4">
          <StatRow
            label="Scoreboard totals"
            items={[
              { value: String(sb.claims.length), label: sb.claims.length === 1 ? "claim" : "claims" },
              { value: String(sb.claims.filter((r) => r.status === "Supported" || r.status === "Not supported").length), label: "with a verdict" },
              { value: String(sb.claims.reduce((n, r) => n + r.effective_events, 0)), label: "forward events graded" },
            ]}
          />
        </div>
      </header>

      <Card title="By claim" stamp={stamp} id="claims-h" kicker={{ icon: "scoreboard", label: "Forward results only" }}>
        {sb.claims.length === 0 ? (
          <p className="border border-dashed border-line p-4 text-sm text-muted">
            No claims are registered yet, so there is no forward evidence to score. Draft claims are on the{" "}
            <Link className="underline" to="/">claims page</Link> with backtest-only results.
          </p>
        ) : (
          <div tabIndex={0} role="region" aria-label="Scoreboard by claim (scrollable)" className="overflow-x-auto bg-surface">
            <table className="w-full min-w-[44rem] text-left text-sm">
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
                    <td className="px-3 py-3"><ClaimCell site={site} id={r.claim_id} placebo={r.placebo} /></td>
                    <td className="px-3 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-3 py-3"><span className={`font-semibold ${claimStat(r.measure, r.mean).cls}`}>{claimStat(r.measure, r.mean).text}</span> <span className="text-muted">{intervalText(r.ci_lo, r.ci_hi, r.measure)}</span></td>
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

      <Card title="Contributors" stamp={stamp} id="who-h" kicker={{ icon: "people", label: "Track records" }}>
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
                    <div key={k} className="bg-surface-alt px-2 py-3">
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

      <Card title="Calibration" stamp={stamp} id="cal-h" kicker={{ icon: "scale", label: "Stated confidence against results" }}>
        <CalibrationPlot bins={sb.calibration} />
      </Card>

      <Card title="Placebo" stamp="Permanent" id="placebo-h" kicker={{ icon: "shield", label: "The engine checking itself" }}>
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
