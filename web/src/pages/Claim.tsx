import * as Tabs from "@radix-ui/react-tabs";
import { lazy, Suspense, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { EvidenceMeter } from "../components/EvidenceMeter";
import { ForwardLogTable } from "../components/ForwardLogTable";
import { Histogram } from "../components/Histogram";
import { InstrumentChip } from "../components/InstrumentChip";
import { NodeLegend } from "../components/NodeLegend";
import { Ready, Row } from "../components/Ready";
import { ChallengeList, ReplicationList } from "../components/Submissions";
import { StatusBadge } from "../components/StatusBadge";
import { useTheme } from "../components/ThemeContext";
import type { SiteClaim, SiteData } from "../generated/site";
import { findClaim } from "../lib/data";
import { citation, claimVersion, intervalText, pct, scoreboardRow, venueLabel, windowLabel } from "../lib/format";
import { embedSnippet } from "../lib/embed";
import { buildGraph } from "../lib/graph";
import { challengeTemplate, newFileUrl, replicationTemplate } from "../lib/lanes";

const GraphView = lazy(() => import("../components/GraphView"));
// The charting library is large, so it loads only when the Evidence tab shows a chart.
const EventWindowChart = lazy(() =>
  import("../components/EventWindowChart").then((m) => ({ default: m.EventWindowChart })),
);

const TAB = "whitespace-nowrap rounded-full px-3 py-2 text-sm sm:px-4 text-muted data-[state=active]:bg-surface-alt data-[state=active]:font-semibold data-[state=active]:text-fg";

function EmbedBox({ claimId }: { claimId: string }) {
  const [copied, setCopied] = useState(false);
  const snippet = embedSnippet(`${window.location.origin}${window.location.pathname}`, claimId);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this snippet:", snippet);
    }
  };
  return (
    <details className="rounded-[10px] border border-line bg-surface p-4">
      <summary className="cursor-pointer text-sm font-semibold">Embed this claim</summary>
      <p className="mt-3 text-xs text-muted">
        Paste this into a blog post or web page to show a live, read-only card for this claim. It always shows the
        current status and keeps the &ldquo;not investment advice&rdquo; line.
      </p>
      <label className="mt-3 block text-xs text-muted">
        Embed code
        <textarea
          readOnly
          rows={3}
          value={snippet}
          onFocus={(e) => e.currentTarget.select()}
          className="mt-1 w-full rounded-[10px] border border-line bg-surface-alt p-2 font-mono text-xs text-fg"
        />
      </label>
      <button type="button" onClick={copy} className="mt-2 rounded-full border border-line px-4 py-1.5 text-sm hover:bg-surface-alt">
        {copied ? "Copied" : "Copy embed code"}
      </button>
    </details>
  );
}

function Overview({ item, site }: { item: SiteClaim; site: SiteData }) {
  const { theme } = useTheme();
  const c = item.claim;
  const b = item.backtest;
  const row = scoreboardRow(site.scoreboard.claims, c.id);
  const model = useMemo(() => buildGraph([item], site), [item, site]);
  return (
    <div className="space-y-6">
      <section aria-labelledby="summary" className="rounded-[10px] border border-line bg-surface p-4">
        <h2 id="summary" className="mb-2 text-sm font-semibold">Summary</h2>
        <dl>
          <Row label="Expected direction">{c.expected_sign}</Row>
          <Row label="Window">{b ? windowLabel(b.window_days) : c.window.end}</Row>
          <Row label="Baseline">{c.baseline.replace("_", " ")}{c.baseline === "factor_only" ? ` (${c.factor})` : ""}</Row>
          <Row label="Measure">{c.measure.replace(/_/g, " ")}</Row>
          {b ? (
            <>
              <Row label="Backtest estimate">
                {pct(b.mean)} <span className="text-muted">{intervalText(b.ci_lo, b.ci_hi)}</span>
              </Row>
              <Row label="Backtest sample">
                n={b.n_effective} effective of {b.n_matched} matched
              </Row>
              <Row label="As of">{b.as_of}{b.data_synthetic ? " (synthetic data)" : ""}</Row>
            </>
          ) : (
            <Row label="Backtest">{item.backtest_error ?? "not available"}</Row>
          )}
          <Row label="Forward evidence">
            {row ? `${row.effective_events} of ${row.min_events} events` : "none: claim is not registered"}
          </Row>
        </dl>
        {b && <p className="mt-3 text-sm text-muted">Backtest result: {b.verdict}.</p>}
        <div className="mt-4">
          <EvidenceMeter value={row?.effective_events ?? 0} max={c.success.min_forward_events} label="Forward events" />
        </div>
      </section>

      <section aria-labelledby="graph-h">
        <h2 id="graph-h" className="mb-2 text-sm font-semibold">How the claim is wired</h2>
        <Suspense fallback={<p className="text-muted">Loading graph…</p>}>
          <GraphView model={model} theme={theme} label={`Graph of ${c.id}`} />
        </Suspense>
      </section>

      <NodeLegend compact />

      <EmbedBox claimId={c.id} />

      <details className="rounded-[10px] border border-line bg-surface p-4">
        <summary className="cursor-pointer text-sm font-semibold">Claim file (YAML)</summary>
        <pre tabIndex={0} aria-label="Claim file (scrollable)" className="mt-3 overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs">{item.yaml}</pre>
      </details>
    </div>
  );
}

function Evidence({ item, site }: { item: SiteClaim; site: SiteData }) {
  const { theme } = useTheme();
  const [mode, setMode] = useState<"chart" | "table">("chart");
  const b = item.backtest;
  const chart = item.chart;
  const placebo = site.claims.find((p) => p.claim.event_type === "RANDOM_DATE" && p.backtest);
  const isPlacebo = item.claim.event_type === "RANDOM_DATE";
  if (!b) return <p className="text-muted">No backtest could be run: {item.backtest_error}</p>;

  return (
    <div className="space-y-6">
      <p className="rounded-[10px] bg-surface-alt p-3 text-xs text-muted">
        These are <strong className="text-fg">backtest</strong> results, not forward evidence. Only events after
        registration count as forward evidence.
        {b.data_synthetic && " The data here is simulated."}
      </p>

      {chart && (
        <section aria-labelledby="chart-h">
          <div className="mb-2 flex items-center justify-between">
            <h2 id="chart-h" className="text-sm font-semibold">Event window</h2>
            <div role="group" aria-label="Chart or table" className="flex rounded-full border border-line p-0.5 text-xs">
              {(["chart", "table"] as const).map((m) => (
                <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}
                  className={`rounded-full px-3 py-1 capitalize ${mode === m ? "bg-accent text-on-accent" : "text-muted"}`}>
                  {m}
                </button>
              ))}
            </div>
          </div>
          {mode === "chart" ? (
            <Suspense fallback={<p className="text-muted">Loading chart…</p>}>
              <EventWindowChart chart={chart} theme={theme} />
            </Suspense>
          ) : (
            <div tabIndex={0} role="region" aria-label="Mean path by day (scrollable)" className="max-h-80 overflow-auto rounded-[10px] border border-line">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Mean abnormal path by trading day relative to the event</caption>
                <thead className="sticky top-0 bg-surface-alt text-xs text-muted">
                  <tr><th scope="col" className="px-3 py-2 font-medium">Day</th><th scope="col" className="px-3 py-2 font-medium">Mean level</th><th scope="col" className="px-3 py-2 font-medium">Low</th><th scope="col" className="px-3 py-2 font-medium">High</th></tr>
                </thead>
                <tbody>
                  {chart.days.map((d, i) => (
                    <tr key={d} className="border-t border-line">
                      <td className="px-3 py-1.5">{d}</td>
                      <td className="px-3 py-1.5">{chart.mean[i]?.toFixed(2)}</td>
                      <td className="px-3 py-1.5">{chart.lo[i]?.toFixed(2)}</td>
                      <td className="px-3 py-1.5">{chart.hi[i]?.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <section aria-labelledby="dist-h">
        <h2 id="dist-h" className="mb-2 text-sm font-semibold">Distribution across events</h2>
        <Histogram values={b.events.map((e) => e.value)} title="Per-event statistic" />
      </section>

      <section aria-labelledby="placebo-h">
        <h2 id="placebo-h" className="mb-2 text-sm font-semibold">Placebo comparison</h2>
        {isPlacebo ? (
          <p className="text-sm text-muted">This is the placebo: random dates should show nothing.</p>
        ) : placebo?.backtest ? (
          <div tabIndex={0} role="region" aria-label="Placebo comparison (scrollable)" className="overflow-x-auto rounded-[10px] border border-line">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <caption className="sr-only">This claim compared with the placebo</caption>
              <thead className="bg-surface-alt text-xs text-muted">
                <tr><th scope="col" className="px-3 py-2 font-medium">Claim</th><th scope="col" className="px-3 py-2 font-medium">Estimate</th><th scope="col" className="px-3 py-2 font-medium">95% interval</th><th scope="col" className="px-3 py-2 font-medium">n</th></tr>
              </thead>
              <tbody>
                {[item, placebo].map((s) => (
                  <tr key={s.claim.id} className="border-t border-line">
                    <td className="px-3 py-2 font-mono text-xs">{s.claim.id}</td>
                    <td className="px-3 py-2">{pct(s.backtest?.mean)}</td>
                    <td className="px-3 py-2">{intervalText(s.backtest?.ci_lo ?? null, s.backtest?.ci_hi ?? null)}</td>
                    <td className="px-3 py-2">{s.backtest?.n_effective}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted">No placebo claim is available to compare against.</p>
        )}
      </section>

      <section aria-labelledby="events-h">
        <h2 id="events-h" className="mb-2 text-sm font-semibold">Every historical event used ({b.events.length})</h2>
        <p className="mb-2 text-xs text-muted">
          {b.n_matched} matched; {b.n_no_history} dropped for too little history, {b.n_scheduled_overlap} for a scheduled-event
          overlap, {b.n_overlap_collapsed} collapsed as overlapping.
        </p>
        <div tabIndex={0} role="region" aria-label="Historical events (scrollable)" className="max-h-80 overflow-auto rounded-[10px] border border-line">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Historical events</caption>
            <thead className="sticky top-0 bg-surface-alt text-xs text-muted">
              <tr><th scope="col" className="px-3 py-2 font-medium">Date</th><th scope="col" className="px-3 py-2 font-medium">Event</th><th scope="col" className="px-3 py-2 font-medium">Window CAR</th><th scope="col" className="px-3 py-2 font-medium">Statistic</th></tr>
            </thead>
            <tbody>
              {b.events.map((e) => (
                <tr key={e.event_id} className="border-t border-line">
                  <td className="px-3 py-1.5">{e.event_date}</td>
                  <td className="px-3 py-1.5"><Link className="font-mono text-xs underline" to={`/events/${e.event_id}`}>{e.event_id}</Link></td>
                  <td className="px-3 py-1.5">{pct(e.car)}</td>
                  <td className="px-3 py-1.5">{pct(e.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Challenge({ item, site }: { item: SiteClaim; site: SiteData }) {
  const repo = site.meta.repo;
  const id = item.claim.id;
  // Opens the "Challenge a claim" issue form with the claim id filled in (a quick, informal start).
  const q = new URLSearchParams({ template: "challenge.yml", title: `Challenge: ${id}`, claim: id });
  const registered = item.status !== "Draft";
  const link = "inline-block rounded-full border border-line px-4 py-2 text-sm font-semibold hover:bg-surface-alt";
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        Disagreement is a structured activity here. A <strong className="text-fg">challenge</strong> argues the claim is
        wrong, with evidence. A <strong className="text-fg">replication</strong> reruns it with named changes; the engine
        runs it and writes the result, so nobody can hand-write a favorable one. Both are reviewed, append-only pull
        requests.
      </p>

      {!registered && (
        <p role="note" className="rounded-[10px] border border-dashed border-line p-3 text-sm text-muted">
          This claim is a draft. Challenges and replications apply after it is registered; before that, comment on its pull
          request.
        </p>
      )}

      <section aria-labelledby="chl-h">
        <h2 id="chl-h" className="mb-2 text-sm font-semibold">Challenges ({item.challenges.length})</h2>
        {item.challenges.length > 0 ? (
          <ChallengeList items={item.challenges} />
        ) : (
          <p className="rounded-[10px] border border-dashed border-line p-4 text-sm text-muted">None yet.</p>
        )}
      </section>

      <section aria-labelledby="rep-h">
        <h2 id="rep-h" className="mb-2 text-sm font-semibold">Replications ({item.replications.length})</h2>
        {item.replications.length > 0 ? (
          <ReplicationList items={item.replications} />
        ) : (
          <p className="rounded-[10px] border border-dashed border-line p-4 text-sm text-muted">None yet.</p>
        )}
      </section>

      <section aria-labelledby="start-h" className="space-y-3">
        <h2 id="start-h" className="text-sm font-semibold">Contribute</h2>
        <div className="flex flex-wrap gap-2">
          <a className={link} href={newFileUrl(repo, "challenges", "chl_REPLACE_ME_v1.yaml", challengeTemplate(id))}>
            Write a challenge (pull request)
          </a>
          <a className={link} href={newFileUrl(repo, "replications", "rep_REPLACE_ME_v1.yaml", replicationTemplate(id))}>
            Propose a replication (pull request)
          </a>
          <a className={link} href={`https://github.com/${repo}/issues/new?${q.toString()}`}>
            Raise it as an issue first
          </a>
        </div>
        <p className="text-xs text-muted">
          The links open GitHub&apos;s editor with the file pre-filled. Rename it to match the id you choose, fill in the
          placeholders, and choose &ldquo;Create a new branch and start a pull request&rdquo;. Leave{" "}
          <code className="font-mono">submitted_at</code> as it is; CI stamps it.
        </p>
      </section>
    </div>
  );
}

function ClaimBody({ item, site }: { item: SiteClaim; site: SiteData }) {
  const c = item.claim;
  const [tab, setTab] = useState("overview");
  const [copied, setCopied] = useState(false);
  const text = citation(c.id, claimVersion(c.id), __COMMIT__, site.meta.repo);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this citation:", text);
    }
  };

  return (
    <div className="pb-24 sm:pb-0">
      <Link to="/" className="text-sm text-muted hover:text-fg">← All claims</Link>
      <header className="mb-5 mt-3">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <StatusBadge status={item.status} />
          <span className="font-mono text-xs text-muted">{c.id}</span>
          <InstrumentChip instrument={c.instrument} />
          <span className="text-xs text-muted">{venueLabel(c.instrument.venue)}</span>
        </div>
        <h1 className="text-xl font-bold leading-snug sm:text-2xl">{c.statement.replace(/\s+/g, " ").trim()}</h1>
        <p className="mt-2 text-sm text-muted"><strong className="text-fg">What would prove it wrong:</strong> {c.falsifier.replace(/\s+/g, " ").trim()}</p>
      </header>

      <Tabs.Root value={tab} onValueChange={setTab}>
        <Tabs.List aria-label="Claim sections" className="mb-5 flex gap-1 overflow-x-auto border-b border-line pb-2">
          <Tabs.Trigger value="overview" className={TAB}>Overview</Tabs.Trigger>
          <Tabs.Trigger value="evidence" className={TAB}>Evidence</Tabs.Trigger>
          <Tabs.Trigger value="forward" className={TAB}>Forward log ({item.forward_log.length})</Tabs.Trigger>
          <Tabs.Trigger value="challenge" className={TAB}>Challenge ({item.challenges.length + item.replications.length})</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="overview"><Overview item={item} site={site} /></Tabs.Content>
        <Tabs.Content value="evidence"><Evidence item={item} site={site} /></Tabs.Content>
        <Tabs.Content value="forward"><ForwardLogTable rows={item.forward_log} /></Tabs.Content>
        <Tabs.Content value="challenge"><Challenge item={item} site={site} /></Tabs.Content>
      </Tabs.Root>

      {/* Sticky on phones: the two most useful actions. There are no trade buttons anywhere. */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-line bg-surface p-3 sm:static sm:mt-8 sm:border-0 sm:bg-transparent sm:p-0">
        <button type="button" onClick={() => setTab("challenge")} className="flex-1 rounded-full border border-line px-4 py-2 text-sm font-semibold sm:flex-none">
          Challenge
        </button>
        <button type="button" onClick={copy} className="flex-1 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-on-accent sm:flex-none">
          {copied ? "Copied" : "Copy citation"}
        </button>
      </div>
    </div>
  );
}

export default function ClaimPage() {
  const { id } = useParams();
  return (
    <Ready>
      {(site) => {
        const item = findClaim(site, id);
        return item ? <ClaimBody item={item} site={site} /> : (
          <p>No claim named <code className="font-mono">{id}</code>. <Link className="underline" to="/">Back to all claims</Link>.</p>
        );
      }}
    </Ready>
  );
}
