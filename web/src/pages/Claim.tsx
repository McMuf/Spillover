import * as Tabs from "@radix-ui/react-tabs";
import { lazy, Suspense, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AreaChart } from "../components/AreaChart";
import { EvidenceMeter } from "../components/EvidenceMeter";
import { ForwardLogTable } from "../components/ForwardLogTable";
import { Highlight } from "../components/Highlight";
import { Histogram } from "../components/Histogram";
import { Icon } from "../components/Icon";
import { Logo } from "../components/Logo";
import { SpilloverPath } from "../components/SpilloverPath";
import { Ready, Row } from "../components/Ready";
import { StatusBadge } from "../components/StatusBadge";
import { ChallengeList, ReplicationList } from "../components/Submissions";
import { BackButton, OutlineTag, PillButton, Stamp, TAB_CLASS, Tag } from "../components/ui";
import type { SiteClaim, SiteData } from "../generated/site";
import { instrumentName } from "../lib/brands";
import { findClaim } from "../lib/data";
import { embedSnippet } from "../lib/embed";
import { citation, claimVersion, intervalText, pct, scoreboardRow, venueLabel, windowLabel } from "../lib/format";
import { challengeTemplate, newFileUrl, replicationTemplate } from "../lib/lanes";
import { categoryOf, eventHeadline, highlightTerms, shortHeadline, whatPastDataSays, whatWeTest } from "../lib/plain";

// The charting library is large, so it loads only when the Evidence tab is opened.
const EventWindowChart = lazy(() =>
  import("../components/EventWindowChart").then((m) => ({ default: m.EventWindowChart })),
);

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const H3 = "mb-3 text-lg font-bold";
const PANEL = "rounded-2xl bg-surface p-5 md:p-6";

/* ---------- Situation overview ---------- */

function Situation({ item, site }: { item: SiteClaim; site: SiteData }) {
  const c = item.claim;
  const b = item.backtest;
  const verdict = whatPastDataSays(item);
  const row = scoreboardRow(site.scoreboard.claims, c.id);
  const recent = [...(b?.events ?? [])].sort((x, y) => y.event_date.localeCompare(x.event_date)).slice(0, 4);
  const findEvent = (id: string) => site.events.find((e) => e.event_id === id);

  return (
    <div className="space-y-6">
      <section aria-labelledby="graph-h">
        <h2 id="graph-h" className={H3}>How the claim is wired</h2>
        <SpilloverPath item={item} site={site} />
      </section>

      <section className={PANEL} aria-label="Situation overview">
        <h2 className={H3}>Overview</h2>
        <ul className="list-disc space-y-3 pl-5 text-[15px] leading-relaxed marker:text-muted">
          <li>
            <strong>What we test.</strong> {whatWeTest(item)}
          </li>
          <li>
            <strong>What the past data says.</strong> {verdict.headline}. {verdict.detail}
          </li>
          <li>
            <strong>What would prove it wrong.</strong> {clean(c.falsifier)}
          </li>
        </ul>

        <h2 className={`${H3} mt-7`}>The claim, as registered</h2>
        <blockquote className="border-l-2 border-line pl-4 text-[15px] leading-relaxed">{clean(c.statement)}</blockquote>
        <p className="mt-2 text-xs text-muted">
          <span className="font-mono">{c.id}</span>
          {" · "}by {c.registered_by}
          {c.registered_at !== "set_by_ci_on_merge" ? ` · frozen ${c.registered_at.slice(0, 10)}` : " · not registered yet"}
        </p>

        <h2 className={`${H3} mt-7`}>Market context</h2>
        <p className="text-[15px] leading-relaxed text-muted">
          A past pattern is not a prediction. The real test starts at registration: only events after that date count as
          forward evidence, and the claim needs at least {c.success.min_forward_events} of them before it can be called
          Supported or Not supported.
        </p>

        {recent.length > 0 && (
          <>
            <h2 className={`${H3} mt-7`}>Recent events</h2>
            <ul className="space-y-2.5">
              {recent.map((e) => {
                const ev = findEvent(e.event_id);
                return (
                  <li key={e.event_id} className="flex gap-6 text-[15px]">
                    <span className="w-24 shrink-0 text-sm font-semibold text-accent">{e.event_date}</span>
                    <Link to={`/events/${e.event_id}`} className="hover:underline">
                      {ev ? eventHeadline(ev) : e.event_id}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      <section className={PANEL} aria-labelledby="summary">
        <h2 id="summary" className={H3}>Technical summary</h2>
        <dl>
          <Row label="Expected direction">{c.expected_sign}</Row>
          <Row label="Window">{b ? windowLabel(b.window_days) : c.window.end}</Row>
          <Row label="Baseline">
            {c.baseline.replace("_", " ")}
            {c.baseline === "factor_only" ? ` (${c.factor})` : ""}
          </Row>
          <Row label="Measure">{c.measure.replace(/_/g, " ")}</Row>
          {b ? (
            <>
              <Row label="Backtest estimate">
                {pct(b.mean)} <span className="text-muted">{intervalText(b.ci_lo, b.ci_hi)}</span>
              </Row>
              <Row label="Backtest sample">
                n={b.n_effective} effective of {b.n_matched} matched
              </Row>
              <Row label="As of">
                {b.as_of}
                {b.data_synthetic ? " (synthetic data)" : ""}
              </Row>
            </>
          ) : (
            <Row label="Backtest">{item.backtest_error ?? "not available"}</Row>
          )}
          <Row label="Forward evidence">{row ? `${row.effective_events} of ${row.min_events} events` : "none: claim is not registered"}</Row>
        </dl>
      </section>

      <EmbedBox claimId={c.id} />

      <details className={PANEL}>
        <summary className="cursor-pointer text-[15px] font-semibold">Claim file (YAML)</summary>
        <pre tabIndex={0} aria-label="Claim file (scrollable)" className="mt-3 overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs text-muted">
          {item.yaml}
        </pre>
      </details>
    </div>
  );
}

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
    <details className={PANEL}>
      <summary className="cursor-pointer text-[15px] font-semibold">Embed this claim</summary>
      <p className="mt-3 text-sm text-muted">
        Paste this into a blog post or web page to show a live, read-only card for this claim. It always shows the current
        status and keeps the &ldquo;not investment advice&rdquo; line.
      </p>
      <label className="mt-3 block text-sm text-muted">
        Embed code
        <textarea
          readOnly
          rows={3}
          value={snippet}
          onFocus={(e) => e.currentTarget.select()}
          className="mt-1 w-full rounded-xl bg-surface-alt p-3 font-mono text-xs text-fg"
        />
      </label>
      <button type="button" onClick={copy} className="mt-2 rounded-full bg-surface-alt px-4 py-2 text-sm font-semibold hover:bg-line">
        {copied ? "Copied" : "Copy embed code"}
      </button>
    </details>
  );
}

/* ---------- Markets ---------- */

function Markets({ item, setTab }: { item: SiteClaim; setTab: (t: string) => void }) {
  const c = item.claim;
  const b = item.backtest;
  const chart = item.chart;
  const cards = [
    {
      symbol: c.instrument.symbol,
      tag: venueLabel(c.instrument.venue),
      idea: `${instrumentName(c.instrument.symbol)} is the market this claim is about. The line shows its average path around past events; the dashed line is the event day.`,
      main: true,
    },
    ...(c.baseline === "factor_only" && c.factor
      ? [
          {
            symbol: c.factor,
            tag: "control",
            idea: `${instrumentName(c.factor)} is subtracted out, so the result shows only what the overall market does not explain.`,
            main: false,
          },
        ]
      : []),
  ];
  return (
    <div className="space-y-4">
      {cards.map((m) => (
        <section key={m.symbol} aria-label={`${m.symbol} market`} className={PANEL}>
          <div className="flex items-start justify-between gap-3 border-b border-line pb-4">
            <div className="flex items-center gap-3">
              <Logo symbol={m.symbol} size={40} />
              <div>
                <p className="flex items-center gap-2">
                  <span className="text-[17px] font-bold">{m.symbol}</span>
                  <OutlineTag>{m.tag}</OutlineTag>
                </p>
                <p className="text-sm text-muted">{instrumentName(m.symbol)}</p>
              </div>
            </div>
            {m.main && b && (
              <div className="text-right">
                <p className="text-[17px] font-bold tabular-nums">{pct(b.mean)}</p>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">Backtest · n={b.n_effective}</p>
              </div>
            )}
          </div>
          <p className="flex items-start gap-2 py-4 text-[15px] leading-relaxed">
            <span className="mt-0.5 shrink-0 text-muted">
              <Icon name="bulb" size={16} />
            </span>
            {m.idea}
          </p>
          {m.main && chart && <AreaChart values={chart.mean} markIndex={chart.days.indexOf(0)} height={170} />}
          {m.main && (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setTab("evidence")} className="rounded-full bg-primary py-2.5 font-bold text-on-primary hover:opacity-90">
                View evidence
              </button>
              <button type="button" onClick={() => setTab("sides")} className="rounded-full bg-surface-alt py-2.5 font-bold hover:bg-line">
                Challenge
              </button>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

/* ---------- Opposite sides ---------- */

function Sides({ item, site }: { item: SiteClaim; site: SiteData }) {
  const repo = site.meta.repo;
  const id = item.claim.id;
  const q = new URLSearchParams({ template: "challenge.yml", title: `Challenge: ${id}`, claim: id });
  const registered = item.status !== "Draft";
  const verdict = whatPastDataSays(item);
  const link = "inline-flex rounded-full bg-surface-alt px-4 py-2 text-sm font-semibold hover:bg-line";
  return (
    <div className="space-y-6">
      <section className={PANEL} aria-label="Opposite sides">
        <div className="grid grid-cols-2 gap-1 overflow-hidden rounded-full text-center text-sm font-bold">
          <span className="bg-surface-alt py-2">Supporters</span>
          <span className="bg-surface-alt py-2 text-muted">Skeptics</span>
        </div>
        <h2 className="mt-5 text-lg font-bold">Does the effect hold up?</h2>
        <div className="mt-3 space-y-4 text-[15px] leading-relaxed">
          <blockquote className="border-l-2 border-fg pl-4">
            {clean(item.claim.statement)} <span className="text-muted">{verdict.headline}.</span>
          </blockquote>
          <blockquote className="border-r-2 border-muted pr-4 text-right md:pl-12">
            {clean(item.claim.falsifier)}{" "}
            <span className="text-muted">
              {item.challenges.length} challenge{item.challenges.length === 1 ? "" : "s"} and {item.replications.length} replication
              {item.replications.length === 1 ? "" : "s"} filed so far.
            </span>
          </blockquote>
        </div>
      </section>

      <p className="text-[15px] leading-relaxed text-muted">
        Disagreement is structured here. A <strong className="text-fg">challenge</strong> argues the claim is wrong, with
        evidence. A <strong className="text-fg">replication</strong> reruns it with named changes; the engine runs it and writes
        the result, so nobody can hand-write a favorable one. Both are reviewed, append-only pull requests.
      </p>

      {!registered && (
        <p role="note" className="rounded-2xl bg-surface p-4 text-sm text-muted">
          This claim is a draft. Challenges and replications apply after it is registered; before that, comment on its pull
          request.
        </p>
      )}

      <section aria-labelledby="chl-h">
        <h2 id="chl-h" className={H3}>Challenges ({item.challenges.length})</h2>
        {item.challenges.length > 0 ? <ChallengeList items={item.challenges} /> : <p className="rounded-2xl bg-surface p-4 text-sm text-muted">None yet.</p>}
      </section>

      <section aria-labelledby="rep-h">
        <h2 id="rep-h" className={H3}>Replications ({item.replications.length})</h2>
        {item.replications.length > 0 ? <ReplicationList items={item.replications} /> : <p className="rounded-2xl bg-surface p-4 text-sm text-muted">None yet.</p>}
      </section>

      <section aria-labelledby="start-h" className="space-y-3">
        <h2 id="start-h" className={H3}>Contribute</h2>
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
        <p className="text-xs leading-relaxed text-muted">
          The links open GitHub&apos;s editor with the file pre-filled. Rename it to match the id you choose, fill in the
          placeholders, and choose &ldquo;Create a new branch and start a pull request&rdquo;. Leave{" "}
          <code className="font-mono">submitted_at</code> as it is; CI stamps it.
        </p>
      </section>
    </div>
  );
}

/* ---------- Evidence ---------- */

function Evidence({ item, site }: { item: SiteClaim; site: SiteData }) {
  const [mode, setMode] = useState<"chart" | "table">("chart");
  const b = item.backtest;
  const chart = item.chart;
  const placebo = site.claims.find((p) => p.claim.event_type === "RANDOM_DATE" && p.backtest && p.claim.id !== item.claim.id);
  const isPlacebo = item.claim.event_type === "RANDOM_DATE";
  if (!b) return <p className="text-muted">No backtest could be run: {item.backtest_error}</p>;
  const tableWrap = "overflow-auto rounded-2xl bg-surface";
  const th = "px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted";

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted">
        These are <strong className="text-fg">backtest</strong> results on past events, not forward evidence. Only events after
        registration count as forward evidence.{b.data_synthetic && " The data here is simulated."}
      </p>

      {chart && (
        <section aria-labelledby="chart-h">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="chart-h" className="text-lg font-bold">Event window</h2>
            <div role="group" aria-label="Chart or table" className="flex gap-2">
              {(["chart", "table"] as const).map((m) => (
                <PillButton key={m} active={mode === m} onClick={() => setMode(m)}>
                  {m}
                </PillButton>
              ))}
            </div>
          </div>
          {mode === "chart" ? (
            <Suspense fallback={<p className="text-muted">Loading chart…</p>}>
              <EventWindowChart chart={chart} />
            </Suspense>
          ) : (
            <div tabIndex={0} role="region" aria-label="Mean path by day (scrollable)" className={`${tableWrap} max-h-80`}>
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Mean abnormal path by trading day relative to the event</caption>
                <thead className="sticky top-0 bg-surface">
                  <tr><th scope="col" className={th}>Day</th><th scope="col" className={th}>Mean level</th><th scope="col" className={th}>Low</th><th scope="col" className={th}>High</th></tr>
                </thead>
                <tbody>
                  {chart.days.map((d, i) => (
                    <tr key={d} className="border-t border-line">
                      <td className="px-4 py-2">{d}</td>
                      <td className="px-4 py-2">{chart.mean[i]?.toFixed(2)}</td>
                      <td className="px-4 py-2">{chart.lo[i]?.toFixed(2)}</td>
                      <td className="px-4 py-2">{chart.hi[i]?.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <section aria-labelledby="dist-h">
        <h2 id="dist-h" className={H3}>Distribution across events</h2>
        <Histogram values={b.events.map((e) => e.value)} title="Per-event statistic" />
      </section>

      <section aria-labelledby="placebo-h">
        <h2 id="placebo-h" className={H3}>Placebo comparison</h2>
        {isPlacebo ? (
          <p className="text-sm text-muted">This is a placebo: random dates should show nothing.</p>
        ) : placebo?.backtest ? (
          <div tabIndex={0} role="region" aria-label="Placebo comparison (scrollable)" className={tableWrap}>
            <table className="w-full min-w-[28rem] text-left text-sm">
              <caption className="sr-only">This claim compared with the placebo</caption>
              <thead>
                <tr><th scope="col" className={th}>Claim</th><th scope="col" className={th}>Estimate</th><th scope="col" className={th}>95% interval</th><th scope="col" className={th}>n</th></tr>
              </thead>
              <tbody>
                {[item, placebo].map((s) => (
                  <tr key={s.claim.id} className="border-t border-line">
                    <td className="px-4 py-2.5 font-mono text-xs">{s.claim.id}</td>
                    <td className="px-4 py-2.5">{pct(s.backtest?.mean)}</td>
                    <td className="px-4 py-2.5">{intervalText(s.backtest?.ci_lo ?? null, s.backtest?.ci_hi ?? null)}</td>
                    <td className="px-4 py-2.5">{s.backtest?.n_effective}</td>
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
        <h2 id="events-h" className={H3}>Every historical event used ({b.events.length})</h2>
        <p className="mb-3 text-sm text-muted">
          {b.n_matched} matched; {b.n_no_history} dropped for too little history, {b.n_scheduled_overlap} for a scheduled-event
          overlap, {b.n_overlap_collapsed} collapsed as overlapping.
        </p>
        <div tabIndex={0} role="region" aria-label="Historical events (scrollable)" className={`${tableWrap} max-h-80`}>
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Historical events</caption>
            <thead className="sticky top-0 bg-surface">
              <tr><th scope="col" className={th}>Date</th><th scope="col" className={th}>Event</th><th scope="col" className={th}>Window CAR</th><th scope="col" className={th}>Statistic</th></tr>
            </thead>
            <tbody>
              {b.events.map((e) => (
                <tr key={e.event_id} className="border-t border-line">
                  <td className="px-4 py-2">{e.event_date}</td>
                  <td className="px-4 py-2"><Link className="font-mono text-xs text-accent hover:underline" to={`/events/${e.event_id}`}>{e.event_id}</Link></td>
                  <td className="px-4 py-2">{pct(e.car)}</td>
                  <td className="px-4 py-2">{pct(e.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/* ---------- Page ---------- */

function ClaimBody({ item, site }: { item: SiteClaim; site: SiteData }) {
  const c = item.claim;
  const b = item.backtest;
  const [tab, setTab] = useState("overview");
  const [copied, setCopied] = useState(false);
  const text = citation(c.id, claimVersion(c.id), __COMMIT__, site.meta.repo);
  const forward = scoreboardRow(site.scoreboard.claims, c.id)?.effective_events ?? 0;

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
    <div>
      <div className="mb-6">
        <BackButton to="/" label="Back to trending claims" />
      </div>

      <header className="mb-8 max-w-4xl">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <Tag>{categoryOf(c.event_type)}</Tag>
          <Stamp>
            {b ? `${b.n_effective} past events tested · as of ${b.as_of}` : "Not tested yet"}
          </Stamp>
        </div>
        <h1 className="text-3xl font-extrabold leading-tight tracking-tight md:text-[40px]">
          <Highlight text={shortHeadline(item)} terms={highlightTerms(item)} />
        </h1>
        <p className="mt-3 text-[17px] leading-relaxed text-muted">{whatWeTest(item)}</p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Tabs.Root value={tab} onValueChange={setTab} className="min-w-0">
          <Tabs.List aria-label="Claim sections" className="no-scrollbar mb-6 flex gap-7 overflow-x-auto border-b border-line">
            <Tabs.Trigger value="overview" className={TAB_CLASS}>Situation overview</Tabs.Trigger>
            <Tabs.Trigger value="markets" className={TAB_CLASS}>Markets</Tabs.Trigger>
            <Tabs.Trigger value="sides" className={TAB_CLASS}>Opposite sides ({item.challenges.length + item.replications.length})</Tabs.Trigger>
            <Tabs.Trigger value="evidence" className={TAB_CLASS}>Evidence</Tabs.Trigger>
            <Tabs.Trigger value="forward" className={TAB_CLASS}>Forward log ({item.forward_log.length})</Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="overview"><Situation item={item} site={site} /></Tabs.Content>
          <Tabs.Content value="markets"><Markets item={item} setTab={setTab} /></Tabs.Content>
          <Tabs.Content value="sides"><Sides item={item} site={site} /></Tabs.Content>
          <Tabs.Content value="evidence"><Evidence item={item} site={site} /></Tabs.Content>
          <Tabs.Content value="forward"><ForwardLogTable rows={item.forward_log} /></Tabs.Content>
        </Tabs.Root>

        {/* Where a market page has its order ticket: the evidence so far and the citation. Nothing to buy. */}
        <aside aria-label="Claim summary" className="lg:sticky lg:top-20 lg:self-start">
          <div className={PANEL}>
            <div className="mb-5 flex items-center gap-3">
              <Logo symbol={c.instrument.symbol} size={40} />
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-bold">
                  {c.instrument.symbol}
                  <OutlineTag>{venueLabel(c.instrument.venue)}</OutlineTag>
                </p>
                <p className="truncate text-sm text-muted">{instrumentName(c.instrument.symbol)}</p>
              </div>
            </div>
            {b ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">Backtest estimate</p>
                <p className="mt-1 text-4xl font-extrabold tabular-nums">{pct(b.mean)}</p>
                <p className="mt-1 text-xs text-muted">
                  n={b.n_effective} · {intervalText(b.ci_lo, b.ci_hi)}
                  {b.data_synthetic && " · synthetic data"}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted">No backtest available.</p>
            )}
            <div className="my-6">
              <EvidenceMeter value={forward} max={c.success.min_forward_events} label="Forward events" />
              <div className="mt-3 flex items-center justify-between">
                <StatusBadge status={item.status} />
                <span className="text-xs text-muted">counts only after registration</span>
              </div>
            </div>
            <div className="grid gap-2">
              <button type="button" onClick={copy} className="flex items-center justify-center gap-2 rounded-full bg-primary py-2.5 font-bold text-on-primary hover:opacity-90">
                <Icon name="copy" size={16} />
                {copied ? "Copied" : "Copy citation"}
              </button>
              <button type="button" onClick={() => setTab("sides")} className="flex items-center justify-center gap-2 rounded-full bg-surface-alt py-2.5 font-bold hover:bg-line">
                <Icon name="flag" size={16} />
                Challenge this claim
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
        return item ? (
          <ClaimBody item={item} site={site} />
        ) : (
          <p>
            No claim named <code className="font-mono">{id}</code>. <Link className="text-accent underline" to="/">Back to all claims</Link>.
          </p>
        );
      }}
    </Ready>
  );
}
