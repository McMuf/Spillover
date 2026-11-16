import * as Tabs from "@radix-ui/react-tabs";
import { lazy, Suspense, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Logo } from "../components/Logo";
import { BackButton, PillButton, Tag, TickerChip } from "../components/ui";
import { Sparkline } from "../components/Sparkline";
import { NodeShape } from "../components/NodeShape";
import { instrumentName } from "../lib/brands";
import { categoryOf, whatPastDataSays, whatWeTest } from "../lib/plain";
import { EvidenceMeter } from "../components/EvidenceMeter";
import { ForwardLogTable } from "../components/ForwardLogTable";
import { Histogram } from "../components/Histogram";
import { InstrumentChip } from "../components/InstrumentChip";
import { NodeLegend } from "../components/NodeLegend";
import { Ready, Row } from "../components/Ready";
import { ChallengeList, ReplicationList } from "../components/Submissions";
import { StatusBadge } from "../components/StatusBadge";
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

const TAB = "-mb-px shrink-0 whitespace-nowrap border-b-2 border-transparent py-3 text-[15px] font-semibold text-muted hover:text-fg data-[state=active]:border-fg data-[state=active]:text-fg";

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
    <details className="rounded-xl border border-line bg-surface p-4">
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
          className="mt-1 w-full rounded-xl border border-line bg-surface-alt p-2 font-mono text-xs text-fg"
        />
      </label>
      <button type="button" onClick={copy} className="mt-2 rounded-full border border-line px-4 py-1.5 text-sm hover:bg-surface-alt">
        {copied ? "Copied" : "Copy embed code"}
      </button>
    </details>
  );
}

function PlainBlocks({ item }: { item: SiteClaim }) {
  const verdict = whatPastDataSays(item);
  const c = item.claim;
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <h2 className="mb-3 text-lg font-bold">News overview</h2>
      <ul className="list-disc space-y-2 pl-5 text-[15px]">
        <li><strong>What we test.</strong> {whatWeTest(item)}</li>
        <li><strong>What the past data says.</strong> {verdict.headline}. {verdict.detail}</li>
        <li><strong>What would prove it wrong.</strong> {c.falsifier.replace(/\s+/g, " ").trim()}</li>
      </ul>
      <h2 className="mb-2 mt-5 text-lg font-bold">Market context</h2>
      <p className="text-[15px] text-muted">
        A past pattern is not a prediction. The real test starts when the claim is registered: only events{" "}
        <em>after</em> that date count as forward evidence, and a claim needs at least {c.success.min_forward_events} of them
        before it can be called Supported or Not supported. Until then it is listed as Proposed.
      </p>
    </div>
  );
}

function Markets({ item, setTab }: { item: SiteClaim; setTab: (t: string) => void }) {
  const c = item.claim;
  const b = item.backtest;
  const cat = categoryOf(c.event_type);
  const series = item.chart?.mean ?? [];
  const cards = [
    { symbol: c.instrument.symbol, venue: venueLabel(c.instrument.venue), idea: `${instrumentName(c.instrument.symbol)} is the market this claim is about.`, main: true },
    ...(c.baseline === "factor_only" && c.factor
      ? [{ symbol: c.factor, venue: "market factor", idea: `${instrumentName(c.factor)} is what we subtract, so the result shows only what the overall market does not explain.`, main: false }]
      : []),
  ];
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Markets this claim touches. Numbers are backtests on past events, not forecasts.</p>
      {cards.map((m) => (
        <section key={m.symbol} aria-label={m.symbol} className="rounded-xl border border-line bg-surface p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <Logo symbol={m.symbol} size={44} />
              <div>
                <p className="flex items-center gap-2"><span className="font-mono text-lg font-bold">{m.symbol}</span><Tag hue={cat.hue}>{m.venue}</Tag></p>
                <p className="text-sm text-muted">{instrumentName(m.symbol)}</p>
              </div>
            </div>
            {m.main && b && (
              <div className="text-right">
                <p className="text-xl font-extrabold">{pct(b.mean)}</p>
                <p className="text-xs uppercase tracking-wide text-muted">backtest · n={b.n_effective}</p>
              </div>
            )}
          </div>
          <p className="my-4 flex items-start gap-2 border-t border-line pt-4 text-[15px]">
            <span className="mt-0.5 text-cat-yellow"><Icon name="bulb" size={16} /></span>
            {m.idea}
          </p>
          {m.main && series.length > 1 && (
            <div className="rounded-lg bg-surface-alt p-3">
              <Sparkline values={series} width={560} height={110} />
              <p className="mt-1 text-xs text-muted">Average path around each past event (event at day 0).</p>
            </div>
          )}
          {m.main && (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setTab("evidence")} className="rounded-full bg-primary px-5 py-3 font-bold text-on-primary hover:brightness-110">View evidence</button>
              <button type="button" onClick={() => setTab("challenge")} className="rounded-full border border-line px-5 py-3 font-bold hover:bg-surface-alt">Challenge</button>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

function Overview({ item, site }: { item: SiteClaim; site: SiteData }) {
  const c = item.claim;
  const b = item.backtest;
  const row = scoreboardRow(site.scoreboard.claims, c.id);
  const model = useMemo(() => buildGraph([item], site), [item, site]);
  return (
    <div className="space-y-6">
      <PlainBlocks item={item} />

      <section aria-labelledby="summary" className="rounded-xl border border-line bg-surface p-4">
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
          <GraphView model={model} label={`Graph of ${c.id}`} />
        </Suspense>
      </section>

      <NodeLegend compact />

      <EmbedBox claimId={c.id} />

      <details className="rounded-xl border border-line bg-surface p-4">
        <summary className="cursor-pointer text-sm font-semibold">Claim file (YAML)</summary>
        <pre tabIndex={0} aria-label="Claim file (scrollable)" className="mt-3 overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs">{item.yaml}</pre>
      </details>
    </div>
  );
}

function Evidence({ item, site }: { item: SiteClaim; site: SiteData }) {
  const b = item.backtest;
  const placebo = site.claims.find((p) => p.claim.event_type === "RANDOM_DATE" && p.backtest);
  const isPlacebo = item.claim.event_type === "RANDOM_DATE";
  if (!b) return <p className="text-muted">No backtest could be run: {item.backtest_error}</p>;

  return (
    <div className="space-y-6">
      <p className="rounded-xl bg-surface-alt p-3 text-xs text-muted">
        These are <strong className="text-fg">backtest</strong> results, not forward evidence. Only events after
        registration count as forward evidence.
        {b.data_synthetic && " The data here is simulated."}
      </p>

      <section aria-labelledby="dist-h">
        <h2 id="dist-h" className="mb-2 text-sm font-semibold">Distribution across events</h2>
        <Histogram values={b.events.map((e) => e.value)} title="Per-event statistic" />
      </section>

      <section aria-labelledby="placebo-h">
        <h2 id="placebo-h" className="mb-2 text-sm font-semibold">Placebo comparison</h2>
        {isPlacebo ? (
          <p className="text-sm text-muted">This is the placebo: random dates should show nothing.</p>
        ) : placebo?.backtest ? (
          <div tabIndex={0} role="region" aria-label="Placebo comparison (scrollable)" className="overflow-x-auto rounded-xl border border-line">
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
        <div tabIndex={0} role="region" aria-label="Historical events (scrollable)" className="max-h-80 overflow-auto rounded-xl border border-line">
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
  const verdict = whatPastDataSays(item);
  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-2">
        <section aria-label="The case for" className="rounded-xl border-l-4 bg-surface p-4" style={{ borderColor: "var(--c-cat-blue)" }}>
          <h2 className="mb-1 flex items-center gap-2 text-base font-bold text-cat-blue">Supporters say</h2>
          <p className="text-[15px]">{item.claim.statement.replace(/\s+/g, " ").trim()}</p>
          <p className="mt-2 text-sm text-muted">{verdict.headline}.</p>
        </section>
        <section aria-label="The case against" className="rounded-xl border-l-4 bg-surface p-4" style={{ borderColor: "var(--c-cat-orange)" }}>
          <h2 className="mb-1 flex items-center gap-2 text-base font-bold text-cat-orange">Skeptics say</h2>
          <p className="text-[15px]">{item.claim.falsifier.replace(/\s+/g, " ").trim()}</p>
          <p className="mt-2 text-sm text-muted">{item.challenges.length} challenge{item.challenges.length === 1 ? "" : "s"} and {item.replications.length} replication{item.replications.length === 1 ? "" : "s"} so far.</p>
        </section>
      </div>
      <p className="text-sm text-muted">
        Disagreement is a structured activity here. A <strong className="text-fg">challenge</strong> argues the claim is
        wrong, with evidence. A <strong className="text-fg">replication</strong> reruns it with named changes; the engine
        runs it and writes the result, so nobody can hand-write a favorable one. Both are reviewed, append-only pull
        requests.
      </p>

      {!registered && (
        <p role="note" className="rounded-xl border border-dashed border-line p-3 text-sm text-muted">
          This claim is a draft. Challenges and replications apply after it is registered; before that, comment on its pull
          request.
        </p>
      )}

      <section aria-labelledby="chl-h">
        <h2 id="chl-h" className="mb-2 text-sm font-semibold">Challenges ({item.challenges.length})</h2>
        {item.challenges.length > 0 ? (
          <ChallengeList items={item.challenges} />
        ) : (
          <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">None yet.</p>
        )}
      </section>

      <section aria-labelledby="rep-h">
        <h2 id="rep-h" className="mb-2 text-sm font-semibold">Replications ({item.replications.length})</h2>
        {item.replications.length > 0 ? (
          <ReplicationList items={item.replications} />
        ) : (
          <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">None yet.</p>
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

/** The big chart at the top of the page: the mean abnormal path, with the event as a dashed line. */
function HeadChart({ item }: { item: SiteClaim }) {
  const [mode, setMode] = useState<"chart" | "table">("chart");
  const chart = item.chart;
  if (!chart) return null;
  return (
    <section aria-labelledby="chart-h" className="mb-5">
      <h2 id="chart-h" className="sr-only">Event window</h2>
      {mode === "chart" ? (
        <Suspense fallback={<p className="text-muted">Loading chart…</p>}>
          <EventWindowChart chart={chart} />
        </Suspense>
      ) : (
        <div tabIndex={0} role="region" aria-label="Mean path by day (scrollable)" className="max-h-80 overflow-auto rounded-xl border border-line">
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
      <div role="group" aria-label="Chart or table" className="mt-3 flex gap-2">
        {(["chart", "table"] as const).map((m) => (
          <PillButton key={m} active={mode === m} onClick={() => setMode(m)}>
            {m}
          </PillButton>
        ))}
      </div>
    </section>
  );
}

function ClaimBody({ item, site }: { item: SiteClaim; site: SiteData }) {
  const c = item.claim;
  const [tab, setTab] = useState("overview");
  const [copied, setCopied] = useState(false);
  const cat = categoryOf(c.event_type);
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

  const row = scoreboardRow(site.scoreboard.claims, c.id);
  const forward = row?.effective_events ?? 0;
  return (
    <div>
      <div className="mb-5">
        <BackButton to="/" label="Back to all claims" />
      </div>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <header className="relative mb-5 overflow-hidden rounded-xl border border-line bg-surface p-5 md:p-6">
            <div aria-hidden="true" className="absolute inset-0" style={{ background: `radial-gradient(110% 120% at 100% 0%, color-mix(in srgb, var(--c-${cat.hue.replace(/[A-Z]/g, (m: string) => "-" + m.toLowerCase())}) 45%, transparent), transparent 65%)` }} />
            <div aria-hidden="true" className="absolute -right-2 -top-2 opacity-25" style={{ color: `var(--c-${cat.hue.replace(/[A-Z]/g, (m: string) => "-" + m.toLowerCase())})` }}>
              <NodeShape type="event" size={130} />
            </div>
            <div className="relative">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Tag hue={cat.hue}>{cat.name}</Tag>
                <StatusBadge status={item.status} />
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {item.backtest ? `${item.backtest.n_effective} past events tested · as of ${item.backtest.as_of}` : "not tested yet"}
                </span>
              </div>
              <h1 className="text-2xl font-extrabold leading-snug md:text-4xl">{c.statement.replace(/\s+/g, " ").trim()}</h1>
              <p className="mt-3 max-w-2xl text-[15px] text-fg/80">{whatWeTest(item)}</p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <TickerChip symbol={c.instrument.symbol} value={item.backtest ? pct(item.backtest.mean) : undefined} hue={cat.hue} />
                <span className="font-mono text-xs text-muted">{c.id}</span>
              </div>
            </div>
          </header>

          <HeadChart item={item} />

          <Tabs.Root value={tab} onValueChange={setTab}>
            <Tabs.List aria-label="Claim sections" className="mb-5 flex gap-6 overflow-x-auto border-b border-line">
              <Tabs.Trigger value="overview" className={TAB}>Situation overview</Tabs.Trigger>
              <Tabs.Trigger value="markets" className={TAB}>Affected markets</Tabs.Trigger>
              <Tabs.Trigger value="evidence" className={TAB}>Evidence</Tabs.Trigger>
              <Tabs.Trigger value="forward" className={TAB}>Forward log ({item.forward_log.length})</Tabs.Trigger>
              <Tabs.Trigger value="challenge" className={TAB}>Both sides ({item.challenges.length + item.replications.length})</Tabs.Trigger>
            </Tabs.List>
            <Tabs.Content value="overview"><Overview item={item} site={site} /></Tabs.Content>
            <Tabs.Content value="markets"><Markets item={item} setTab={setTab} /></Tabs.Content>
            <Tabs.Content value="evidence"><Evidence item={item} site={site} /></Tabs.Content>
            <Tabs.Content value="forward"><ForwardLogTable rows={item.forward_log} /></Tabs.Content>
            <Tabs.Content value="challenge"><Challenge item={item} site={site} /></Tabs.Content>
          </Tabs.Root>
        </div>

        {/* The side card, like a market's trade ticket, but it holds evidence and citations. There is nothing to buy. */}
        <aside aria-label="Claim summary" className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-xl border border-line bg-surface p-5">
            {item.backtest ? (
              <p>
                <span className="block text-sm text-muted">Backtest estimate</span>
                <span className="text-4xl font-extrabold">{pct(item.backtest.mean)}</span>
                <span className="mt-1 block text-xs text-muted">
                  n={item.backtest.n_effective} · {intervalText(item.backtest.ci_lo, item.backtest.ci_hi)}
                  {item.backtest.data_synthetic && " · synthetic data"}
                </span>
              </p>
            ) : (
              <p className="text-sm text-muted">No backtest available.</p>
            )}
            <div className="my-5">
              <EvidenceMeter value={forward} max={c.success.min_forward_events} label="Forward events" />
              <p className="mt-2 text-xs text-muted">Only events after registration count as forward evidence.</p>
            </div>
            <div className="flex flex-col gap-2">
              <button type="button" onClick={() => setTab("challenge")} className="flex items-center justify-center gap-2 rounded-full border border-line px-5 py-3 font-bold hover:bg-surface-alt">
                <Icon name="flag" size={18} />
                Challenge this claim
              </button>
              <button type="button" onClick={copy} className="flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 font-bold text-on-primary hover:brightness-110">
                <Icon name="copy" size={18} />
                {copied ? "Copied" : "Copy citation"}
              </button>
            </div>
          </div>
        </aside>
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
