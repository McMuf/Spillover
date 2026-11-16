import type { ReactNode } from "react";
import { Link } from "react-router-dom";

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-3 rounded-xl border border-line bg-surface p-5">
      <h2 id={id} className="text-[22px] font-extrabold">
        {title}
      </h2>
      {children}
    </section>
  );
}

const P = "max-w-2xl text-sm leading-relaxed";

const GLOSSARY: Array<[string, string]> = [
  ["Event study", "A standard method for measuring what a security did around a dated event, beyond what the broader market explains."],
  ["Abnormal return", "What actually happened minus what the baseline predicted for that day."],
  ["CAR (cumulative abnormal return)", "The abnormal returns added up over the claim's window. The headline number for a claim."],
  ["Baseline", "The naive model of a normal day. “Factor only” predicts from the market's move (alpha plus beta times the factor). “Constant mean” uses the instrument's own average, for an index that is itself the market."],
  ["Effective events", "Independent events left after dropping events with too little history, events whose window overlaps a scheduled event, and events whose windows overlap each other. This is the sample that counts."],
  ["Bootstrap interval", "A 95% range for the average effect, found by resampling the events thousands of times. It assumes little about the shape of returns."],
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
  "Efron, B. (1979). Bootstrap methods: Another look at the jackknife. The Annals of Statistics, 7(1), 1–26.",
  "Benjamini, Y., and Hochberg, Y. (1995). Controlling the false discovery rate: A practical and powerful approach to multiple testing. Journal of the Royal Statistical Society, Series B, 57(1), 289–300.",
  "Harvey, C. R., Liu, Y., and Zhu, H. (2016). … and the cross-section of expected returns. The Review of Financial Studies, 29(1), 5–68.",
  "Chen, A. Y., and Zimmermann, T. (2022). Open source cross-sectional asset pricing. Critical Finance Review, 11(2), 207–264.",
];

export default function Method() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-[32px] font-extrabold leading-tight">How the numbers are made</h1>
        <p className={`${P} mt-1 text-muted`}>
          Every figure on this site comes from the steps below. They are the standard event-study method, applied the same
          way to every claim. If a step here disagrees with what the code does, the code is wrong, so please{" "}
          <a className="underline" href="https://github.com/McMuf/Spillover/issues/new?template=bug.yml">
            open an issue
          </a>
          .
        </p>
      </header>

      <Section id="steps" title="One claim, step by step">
        <ol className={`${P} list-decimal space-y-2 pl-5`}>
          <li>
            <strong>Find events.</strong> Take the events whose type matches the claim and whose entity is one of its trigger
            entities. An event with several matching entities counts once.
          </li>
          <li>
            <strong>Locate day 0.</strong> Day 0 is the first trading day on or after the event date. Daily data cannot tell
            news before the open from news after the close, so day 0 is a whole trading day.
          </li>
          <li>
            <strong>Require history.</strong> An event needs a full estimation window before it and a full event window after
            it. Otherwise it is dropped and counted.
          </li>
          <li>
            <strong>Drop contaminated events.</strong> If another scheduled event, such as a central bank decision, falls
            inside the window, the event is dropped and counted.
          </li>
          <li>
            <strong>Collapse overlaps.</strong> If two events&apos; windows overlap, only the first is kept. Ten headlines
            about one story are one test, not ten.
          </li>
          <li>
            <strong>Fit the baseline.</strong> Over <strong>120 trading days that end 10 trading days before day 0</strong>.
            The gap keeps run-up and leaked news out of the idea of a normal day.
          </li>
          <li>
            <strong>Abnormal return.</strong> For each day in the window, actual minus predicted. Their sum over the window is
            the CAR. A window of &ldquo;+1 trading day&rdquo; is two days: day 0 and day +1.
          </li>
          <li>
            <strong>Aggregate and test.</strong> Bootstrap the average of the per-event statistic across effective events.
          </li>
        </ol>
      </Section>

      <Section id="measures" title="What is being tested">
        <p className={P}>
          Most claims test the <strong>CAR</strong>: did the instrument move more than the baseline explains, in this
          direction? Volatility claims, such as &ldquo;central bank days are bigger moves&rdquo;, test{" "}
          <strong>excess absolute move</strong>: how much larger the size of the move (ignoring direction) was than the size
          of a typical window of the same length in the estimation period.
        </p>
      </Section>

      <Section id="uncertainty" title="Uncertainty">
        <p className={P}>
          Returns have fat tails and events are few, so the site avoids textbook t-tests. The{" "}
          <strong>interval</strong> is the 2.5th to 97.5th percentile of 10,000 resampled averages (with a fixed seed, so a
          report can be reproduced). The <strong>p-value</strong> resamples the sample after centering it on zero, which
          imposes &ldquo;no effect&rdquo;, and asks how often a resampled average is as far from zero as the real one. With
          fewer than two events no interval is shown.
        </p>
        <p className={P}>
          When many claims are tested, p-values are adjusted across the whole set so that a lucky claim does not look like a
          finding (Benjamini-Hochberg).
        </p>
      </Section>

      <Section id="status" title="What the statuses mean">
        <dl className={`${P} space-y-2`}>
          <div><dt className="font-semibold">Draft</dt><dd className="text-muted">In the repository but not registered. Only a backtest exists.</dd></div>
          <div><dt className="font-semibold">Proposed</dt><dd className="text-muted">Registered, with fewer effective forward events than the claim requires. Still collecting.</dd></div>
          <div><dt className="font-semibold">Supported</dt><dd className="text-muted">Enough forward events, the interval excludes zero in the stated direction, and it survives the adjustment across claims.</dd></div>
          <div><dt className="font-semibold">Not supported</dt><dd className="text-muted">Enough forward events and the interval excludes zero in the <em>opposite</em> direction.</dd></div>
          <div><dt className="font-semibold">Inconclusive</dt><dd className="text-muted">Enough forward events, but the interval includes zero, or the result did not survive the adjustment. It means &ldquo;cannot tell from no effect&rdquo;, not &ldquo;failed&rdquo;.</dd></div>
        </dl>
      </Section>

      <Section id="limits" title="What this cannot tell you">
        <ul className={`${P} list-disc space-y-1 pl-5`}>
          <li><strong>Whether a result will persist.</strong> Markets change; a few years of history may not repeat.</li>
          <li><strong>Why.</strong> An event study shows behavior around a date, not mechanism.</li>
          <li><strong>Anything finer than a day.</strong> Intraday timing, after-hours and weekend news are not resolved.</li>
          <li><strong>Small samples well.</strong> Thin claims have wide intervals, and that is reported rather than hidden.</li>
          <li><strong>Mechanical effects of index weight.</strong> Separating an index member&apos;s weight from spillover is not built yet, and claims that ask for it are refused rather than quietly mis-scored.</li>
          <li><strong>Extraction accuracy yet.</strong> Events taken from headlines come from a model whose accuracy against a hand-labeled set has not been measured; treat them as unmeasured until it is.</li>
        </ul>
        <p className={P}>
          Nothing on this site is investment advice. Costs, slippage, risk and regime change are not modeled, and a claim that
          held in a sample says nothing about what to buy or sell.
        </p>
      </Section>

      <Section id="glossary" title="Glossary">
        <dl className={`${P} space-y-3`}>
          {GLOSSARY.map(([term, meaning]) => (
            <div key={term}>
              <dt className="font-semibold">{term}</dt>
              <dd className="text-muted">{meaning}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="reading" title="Reading list">
        <p className={`${P} text-muted`}>
          Standard references for the methods used here. Check details against the originals before citing them.
        </p>
        <ul className={`${P} list-disc space-y-2 pl-5`}>
          {REFERENCES.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <p className={P}>
          Back to the <Link className="underline" to="/">claims</Link> or the <Link className="underline" to="/scoreboard">scoreboard</Link>.
        </p>
      </Section>
    </div>
  );
}
