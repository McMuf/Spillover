import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon, type IconName } from "../components/Icon";
import { AsciiField } from "../components/AsciiField";
import { NodeLegend } from "../components/NodeLegend";

/**
 * How it works: the method as pictures first and a sentence or two each, not paragraphs. The engine's
 * real constants and status names are written out in this file; a test checks them against the code
 * (engine/tests/test_docs_drift.py).
 */

function Section({ id, n, title, lead, children }: { id: string; n: string; title: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="scroll-mt-28 border-t border-line pt-10">
      <p className="font-mono text-sm font-semibold text-accent">{n}</p>
      <h2 id={id} className="mt-1 text-[26px] font-extrabold leading-tight md:text-[30px]">
        {title}
      </h2>
      {lead && <p className="mt-2 max-w-2xl text-[16px] leading-relaxed text-muted">{lead}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

/* --- 01 the life of a claim ------------------------------------------------------------------ */

const LIFE: { icon: IconName; title: string; body: string }[] = [
  { icon: "pen", title: "Write", body: "One sentence about a kind of news, and what would prove it wrong." },
  { icon: "trend", title: "Backtest", body: "Past events show whether there is anything worth testing." },
  { icon: "lock", title: "Freeze", body: "Time-stamped and locked before new events happen." },
  { icon: "scale", title: "Grade", body: "New events arrive, and the market decides. Hits and misses are public." },
];

function Life() {
  return (
    <ol className="relative grid gap-6 md:grid-cols-4 md:gap-4">
      {/* the path joining the stops */}
      <span aria-hidden="true" className="absolute left-[23px] top-6 bottom-6 border-l-2 border-dashed border-accent/40 md:left-6 md:right-6 md:top-[23px] md:bottom-auto md:border-l-0 md:border-t-2" />
      {LIFE.map((s, i) => (
        <li key={s.title} className="relative flex gap-4 md:block">
          <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-full bg-pop text-on-pop ring-8 ring-bg">
            <Icon name={s.icon} size={20} />
          </span>
          <div className="md:mt-4">
            <p className="text-[13px] font-medium text-muted">Step {i + 1}</p>
            <h3 className="text-lg font-bold">{s.title}</h3>
            <p className="mt-1 text-[15px] leading-relaxed text-muted">{s.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* --- 02 the event window, to scale ------------------------------------------------------------ */

function WindowDiagram() {
  // Proportions: 120 estimation days, a 10-day gap, then day 0 and the event window (shown wider
  // than scale so it can be read).
  return (
    <figure className="rounded-2xl bg-surface p-5 md:p-6">
      <div className="flex h-14 items-stretch gap-1 text-xs font-semibold" aria-hidden="true">
        <div className="flex flex-[12] items-center justify-center rounded-l-xl bg-accent-soft text-accent">Normal days</div>
        <div className="flex flex-[1.6] items-center justify-center bg-[repeating-linear-gradient(135deg,var(--c-line)_0_6px,transparent_6px_12px)] text-muted">
          gap
        </div>
        <div className="relative flex flex-[0.9] items-center justify-center rounded-md bg-pop text-on-pop">0</div>
        <div className="flex flex-[2.6] items-center justify-center rounded-r-xl bg-notice-bg text-fg">window</div>
      </div>
      <div className="mt-3 grid grid-cols-[12fr_1.6fr_0.9fr_2.6fr] gap-1 text-[12px] leading-snug text-muted" aria-hidden="true">
        <span>Estimation window: what a normal day looks like</span>
        <span className="text-center">Skipped</span>
        <span className="text-center">Day 0</span>
        <span>What we measure</span>
      </div>
      <figcaption className="mt-5 border-t border-line pt-4 text-[15px] leading-relaxed">
        The baseline is fitted over <strong>120 trading days that end 10 trading days before day 0</strong>. The gap keeps
        run-up and leaked news out of the idea of a normal day, and days of other scheduled news (and of this claim&apos;s own
        kind of event) are left out too; an event needs at least 60 clean days, or it is dropped and counted. Day 0 is the
        first trading day on or after the event; a window of &ldquo;+1 trading day&rdquo; is two days, day 0 and day +1.
      </figcaption>
    </figure>
  );
}

const STEPS: { title: string; body: string }[] = [
  { title: "Find events", body: "Events of the claim's type, about one of its entities. Several matches on one day count once." },
  { title: "Locate day 0", body: "The first trading day on or after the event. Daily data cannot split before-open from after-close." },
  { title: "Require history", body: "A full estimation window before and a full event window after, or the event is dropped and counted." },
  { title: "Drop contaminated events", body: "Another scheduled event, such as a central bank decision, inside the window: dropped and counted." },
  { title: "Collapse overlaps", body: "Windows that overlap keep only the first. Ten headlines about one story are one test, not ten." },
  { title: "Fit the baseline", body: "What a normal day predicts, from the market's move (or the instrument's own average)." },
  { title: "Abnormal return", body: "Each day: actual minus predicted. Their sum over the window is the CAR." },
  { title: "Aggregate and test", body: "A Student t-interval for the average, on exactly the first N events the claim asked for." },
];

function Steps() {
  return (
    <ol className="mt-6 grid gap-x-6 sm:grid-cols-2">
      {STEPS.map((s, i) => (
        <li key={s.title} className="flex gap-4 border-b border-line py-4">
          <span className="w-7 shrink-0 font-mono text-[15px] font-bold text-accent">{String(i + 1).padStart(2, "0")}</span>
          <div>
            <h3 className="font-bold">{s.title}</h3>
            <p className="mt-0.5 text-[15px] leading-relaxed text-muted">{s.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* --- 03 what is being tested ------------------------------------------------------------------ */

function Measures() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-2xl bg-surface p-5">
        <svg viewBox="0 0 200 70" className="h-16 w-full" aria-hidden="true">
          <line x1="0" x2="200" y1="45" y2="45" stroke="var(--c-muted)" strokeDasharray="3 4" />
          <path d="M0 45 L40 44 L70 46 L95 45 L110 30 L135 22 L160 18 L200 14" fill="none" stroke="var(--c-accent)" strokeWidth="2.5" strokeLinejoin="round" />
          <line x1="110" x2="110" y1="4" y2="66" stroke="var(--c-muted)" strokeDasharray="2 3" />
        </svg>
        <h3 className="mt-3 text-lg font-bold">Which way: the CAR</h3>
        <p className="mt-1 text-[15px] leading-relaxed text-muted">
          Did the market move more than the baseline explains, <em>in the stated direction</em>? Most claims test this.
        </p>
      </div>
      <div className="rounded-2xl bg-surface p-5">
        <svg viewBox="0 0 200 70" className="h-16 w-full" aria-hidden="true">
          {[14, 10, 16, 12, 9, 15, 11].map((h, i) => (
            <rect key={i} x={8 + i * 18} y={60 - h} width="10" height={h} rx="2" fill="var(--c-line)" />
          ))}
          <rect x="140" y="12" width="14" height="48" rx="3" fill="var(--c-accent)" />
          <text x="176" y="40" fontSize="11" fill="var(--c-muted)" textAnchor="middle">day 0</text>
        </svg>
        <h3 className="mt-3 text-lg font-bold">How big: the move&apos;s rank</h3>
        <p className="mt-1 text-[15px] leading-relaxed text-muted">
          For &ldquo;bigger moves than usual&rdquo; claims: how the size of the move, either way, ranks among ordinary windows
          of the same length. Typical is 50%; &ldquo;bigger than 80% of ordinary days&rdquo; is a big move.
        </p>
      </div>
    </div>
  );
}

/* --- 04 statuses, as the interval that produces them ------------------------------------------ */

/** A number line with zero, the average (dot) and its 95% interval (band). Positions in percent. */
function Interval({ lo, mid, hi }: { lo: number; mid: number; hi: number }) {
  return (
    <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="h-6 w-full" aria-hidden="true">
      <line x1="0" x2="100" y1="12" y2="12" stroke="var(--c-line)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <line x1="50" x2="50" y1="2" y2="22" stroke="var(--c-muted)" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
      <rect x={lo} y="7" width={hi - lo} height="10" rx="5" fill="var(--c-accent)" opacity="0.25" />
      <circle cx={mid} cy="12" r="4" fill="var(--c-accent)" />
    </svg>
  );
}

function Collecting({ have, need }: { have: number; need: number }) {
  return (
    <div className="flex h-6 items-center gap-1" aria-hidden="true">
      {Array.from({ length: need }, (_, i) => (
        <span key={i} className={`h-2.5 flex-1 rounded-full ${i < have ? "bg-accent" : "bg-line"}`} />
      ))}
    </div>
  );
}

function StatusRow({ picture, meaning, children }: { picture: ReactNode; meaning: ReactNode; children: ReactNode }) {
  return (
    <div className="grid items-center gap-3 border-b border-line py-4 md:grid-cols-[160px_220px_minmax(0,1fr)] md:gap-6">
      {children}
      {/* The picture belongs to the meaning; on wide screens both sit in the row's grid. */}
      <dd className="grid gap-3 md:contents">
        <div>{picture}</div>
        <p className="text-[15px] leading-relaxed text-muted">{meaning}</p>
      </dd>
    </div>
  );
}

function Statuses() {
  return (
    <>
      <div className="mb-2 hidden grid-cols-[160px_220px_minmax(0,1fr)] gap-6 text-[13px] font-medium text-muted md:grid" aria-hidden="true">
        <span>Status</span>
        <span>
          Picture <span>(dot: average, band: 95% range, line: zero)</span>
        </span>
        <span>Means</span>
      </div>
      <dl>
        <StatusRow picture={<Collecting have={0} need={8} />} meaning="In the repository but not registered. Only a backtest exists.">
          <dt className="font-bold">Draft</dt>
        </StatusRow>
        <StatusRow picture={<Collecting have={3} need={8} />} meaning="Registered and frozen; still collecting the forward events it needs.">
          <dt className="font-bold">Proposed</dt>
        </StatusRow>
        <StatusRow picture={<Interval lo={60} mid={72} hi={86} />} meaning="Enough events, the range is clear of zero in the stated direction, and it survives the adjustment across claims.">
          <dt className="font-bold">Supported</dt>
        </StatusRow>
        <StatusRow picture={<Interval lo={14} mid={28} hi={40} />} meaning="Enough events, and the range is clear of zero in the opposite direction.">
          <dt className="font-bold">Not supported</dt>
        </StatusRow>
        <StatusRow
          picture={<Interval lo={36} mid={56} hi={74} />}
          meaning={
            <>
              Enough events, but the range includes zero (or the result did not survive the adjustment). It means{" "}
              <strong className="text-fg">cannot tell</strong>, not failed.
            </>
          }
        >
          <dt className="font-bold">Inconclusive</dt>
        </StatusRow>
      </dl>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <p className="rounded-2xl bg-surface p-5 text-[15px] leading-relaxed">
          <strong>The range.</strong> <span className="text-muted">A Student t-interval for the average across events. It was
          chosen by simulation: with 8 events and no real effect it is wrong about 5% of the time, as a 95% range should be.
          The percentile bootstrap used before (rules 0.1) was wrong 11 to 18% of the time, so it was replaced before any
          claim was graded. Size claims are tested on the move&apos;s rank, which stays honest with few events. Fewer than two
          events: no interval.</span>
        </p>
        <p className="rounded-2xl bg-surface p-5 text-[15px] leading-relaxed">
          <strong>Fixed stopping, one standard.</strong> <span className="text-muted">A verdict uses exactly the first N events the
          claim asked for, so nobody can wait until the numbers happen to look good; later events are shown but never
          counted. Test enough claims and some look real by luck, so p-values are adjusted (Benjamini-Hochberg) together with
          the claims that finished first; a later claim can never move an earlier verdict.</span>
        </p>
      </div>
    </>
  );
}

/* --- 05 limits --------------------------------------------------------------------------------- */

const LIMITS: { title: string; body: string }[] = [
  { title: "Whether it lasts", body: "Markets change; a few years may not repeat." },
  { title: "Why", body: "It shows behavior around a date, not the mechanism." },
  { title: "Anything finer than a day", body: "Intraday, after-hours and weekend timing are not resolved." },
  { title: "Small samples, well", body: "Claims with few events get wide ranges, and the page shows them in full." },
  { title: "Index-weight effects", body: "Not built yet; claims that need it are refused, not mis-scored." },
  { title: "Headline labels, fully", body: "The labeler's accuracy is measured on a growing hand-labeled set." },
];

function Limits() {
  return (
    <>
      <ul className="grid gap-px overflow-hidden rounded-2xl bg-line sm:grid-cols-2 lg:grid-cols-3">
        {LIMITS.map((l) => (
          <li key={l.title} className="bg-bg p-5">
            <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-full bg-notice-bg text-notice-fg">
              <Icon name="close" size={14} />
            </span>
            <h3 className="mt-3 font-bold">{l.title}</h3>
            <p className="mt-0.5 text-[15px] leading-relaxed text-muted">{l.body}</p>
          </li>
        ))}
      </ul>
      <p className="mt-4 rounded-2xl bg-notice-bg px-5 py-4 text-[15px] leading-relaxed text-notice-fg">
        <strong>Nothing on this site is investment advice.</strong> Costs, slippage, risk and regime change are not modeled,
        and a claim that held in a sample says nothing about what to buy or sell.
      </p>
    </>
  );
}

/* --- glossary and references ------------------------------------------------------------------- */

const GLOSSARY: Array<[string, string]> = [
  ["Event study", "A standard method for measuring what a security did around a dated event, beyond what the broader market explains."],
  ["Abnormal return", "What actually happened minus what the baseline predicted for that day."],
  ["CAR (cumulative abnormal return)", "The abnormal returns added up over the claim's window. The headline number for a claim."],
  ["Baseline", "The naive model of a normal day. “Factor only” predicts from the market's move (alpha plus beta times the factor). “Constant mean” uses the instrument's own average, for an index that is itself the market."],
  ["Effective events", "Independent events left after dropping events with too little history, events whose window overlaps a scheduled event, and events whose windows overlap each other. This is the sample that counts."],
  ["Student t-interval", "A 95% range for the average effect across events: the average, plus or minus a multiple of its standard error that grows when there are few events. Checked by simulation to be wrong about 5% of the time with 8 events, as a 95% range should be."],
  ["Size rank", "For bigger-move claims: the share of ordinary same-length windows whose move was smaller than the event's. 50% is typical. Ranks stay well behaved with few events, where raw size differences do not."],
  ["Fixed sample", "A claim states how many new events it needs (at least 8). The verdict uses exactly those first events, so it cannot be checked over and over until it looks good."],
  ["False discovery rate", "When many claims are tested, some look significant by luck. Results are adjusted across the whole set so one lucky claim does not look like a finding."],
  ["Placebo", "A claim on random dates that should show nothing. If it ever works, the engine has a bug."],
  ["Backtest", "A result from events that already happened. Useful for deciding whether a claim is testable, but not forward evidence."],
  ["Forward evidence", "Events that happen after a claim is registered, with predictions frozen and hashed before the window closes. This is what a verdict rests on."],
  ["Registered", "A claim whose registration time was stamped when it merged. After that it is frozen: a change is a new version."],
  ["Needs review", "An event the extractor labeled with low confidence. It is excluded from scoring until a person confirms it."],
];

const REFERENCES = [
  "MacKinlay, A. C. (1997). Event studies in economics and finance. Journal of Economic Literature, 35(1), 13–39.",
  "Brown, S. J., and Warner, J. B. (1985). Using daily stock returns: The case of event studies. Journal of Financial Economics, 14(1), 3–31.",
  "Fama, E. F., Fisher, L., Jensen, M. C., and Roll, R. (1969). The adjustment of stock prices to new information. International Economic Review, 10(1), 1–21.",
  "Corrado, C. J. (1989). A nonparametric test for abnormal security-price performance in event studies. Journal of Financial Economics, 23(2), 385–395.",
  "Benjamini, Y., and Hochberg, Y. (1995). Controlling the false discovery rate: A practical and powerful approach to multiple testing. Journal of the Royal Statistical Society, Series B, 57(1), 289–300.",
  "Harvey, C. R., Liu, Y., and Zhu, H. (2016). … and the cross-section of expected returns. The Review of Financial Studies, 29(1), 5–68.",
  "Chen, A. Y., and Zimmermann, T. (2022). Open source cross-sectional asset pricing. Critical Finance Review, 11(2), 207–264.",
];

function Fold({ summary, children }: { summary: ReactNode; children: ReactNode }) {
  return (
    <details className="group border-b border-line">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-semibold [&::-webkit-details-marker]:hidden">
        {summary}
        <span aria-hidden="true" className="text-muted transition-transform group-open:rotate-180">
          <Icon name="chevronDown" size={18} />
        </span>
      </summary>
      <div className="pb-4 text-[15px] leading-relaxed text-muted">{children}</div>
    </details>
  );
}

const JUMP = [
  ["life", "Life of a claim"],
  ["steps", "Step by step"],
  ["measures", "What is tested"],
  ["status", "Statuses"],
  ["limits", "Limits"],
  ["glossary", "Glossary"],
] as const;

export default function Method() {
  return (
    <div className="space-y-12">
      <header className="hex-bg relative overflow-hidden rounded-3xl border border-line bg-surface">
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[42%] border-l border-line bg-bg md:block">
          <AsciiField seed={7} className="absolute inset-0" />
        </div>
        <div className="relative px-6 py-10 md:w-[60%] md:px-10 md:py-14">
          <p className="text-sm font-semibold text-accent">How it works</p>
          <h1 className="mt-2 text-[34px] font-extrabold leading-[1.05] tracking-tight md:text-[46px]">How the numbers are made</h1>
          <p className="mt-4 max-w-lg text-[17px] leading-relaxed text-muted">
            Every claim goes through the same public steps, the standard event-study method. If this page and the code ever
            disagree, the code is wrong:{" "}
            <a className="text-accent underline underline-offset-2" href="https://github.com/McMuf/Spillover/issues/new?template=bug.yml">
              open an issue
            </a>
            .
          </p>
          <nav aria-label="On this page" className="mt-6 flex flex-wrap gap-2">
            {JUMP.map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" })}
                className="rounded-full bg-bg/80 px-3.5 py-1.5 text-[13px] font-semibold text-fg hover:bg-bg"
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <Section id="life" n="01" title="The life of a claim" lead="Four stops, the same for everyone.">
        <Life />
      </Section>

      <Section id="steps" n="02" title="One claim, step by step" lead="What the engine does with every event, in order.">
        <WindowDiagram />
        <Steps />
      </Section>

      <Section id="measures" n="03" title="What is being tested">
        <Measures />
      </Section>

      <Section id="status" n="04" title="What the statuses mean" lead="A verdict is a picture of the evidence: an average and how sure we are of it.">
        <Statuses />
      </Section>

      <Section id="limits" n="05" title="What this cannot tell you">
        <Limits />
      </Section>

      <Section
        id="shapes"
        n="06"
        title="How a claim is drawn"
        lead="Every claim page draws the claim as a chain: who triggers it, what happens, which market should move. Each step has one of six shapes, and its label always names it."
      >
        <NodeLegend compact />
      </Section>

      <section aria-labelledby="glossary" className="scroll-mt-28 grid gap-10 border-t border-line pt-10 lg:grid-cols-2">
        <div>
          <p className="font-mono text-sm font-semibold text-accent">07</p>
          <h2 id="glossary" className="mt-1 text-[26px] font-extrabold md:text-[30px]">
            Glossary
          </h2>
          <div className="mt-4 border-t border-line">
            {GLOSSARY.map(([term, meaning]) => (
              <Fold key={term} summary={term}>
                {meaning}
              </Fold>
            ))}
          </div>
        </div>
        <div>
          <p className="font-mono text-sm font-semibold text-accent">08</p>
          <h2 id="reading" className="mt-1 text-[26px] font-extrabold md:text-[30px]">
            Reading list
          </h2>
          <p className="mt-2 text-[15px] text-muted">Standard references for these methods. Check details against the originals before citing them.</p>
          <ul className="mt-4 space-y-3 text-[14px] leading-relaxed">
            {REFERENCES.map((r) => (
              <li key={r} className="border-l-2 border-accent-soft pl-3">
                {r}
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-wrap gap-2">
            <Link to="/" className="inline-flex items-center gap-2 rounded-full bg-fg px-4 py-2 text-sm font-semibold text-bg hover:opacity-90">
              See the claims
            </Link>
            <Link to="/scoreboard" className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-semibold hover:bg-surface">
              Scoreboard
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
