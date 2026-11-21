import { useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { Ready } from "../components/Ready";
import type { SiteClaim, SiteData } from "../generated/site";
import {
  baselineFor,
  eventTypeCheck,
  groupedTypes,
  ORIGIN_LABEL,
  plainSentence,
  readiness,
  suggestedFalsifier,
  suggestedId,
  symbolCheck,
  vagueHints,
  venueFor,
  WINDOWS,
  type Check,
  type Direction,
} from "../lib/claimGuide";
import { EMPTY_FORM, pullRequestUrl, toYaml, validateYaml, type ClaimForm } from "../lib/claimYaml";
import { eventLabel, shortName } from "../lib/plain";

const FIELD = "mt-1 w-full border border-transparent bg-surface-alt px-4 py-3 text-[15px] text-fg focus:border-accent";

const MARK: Record<Check["level"], { glyph: string; cls: string; label: string }> = {
  ok: { glyph: "✓", cls: "text-positive", label: "OK" },
  warn: { glyph: "!", cls: "text-fg", label: "Note" },
  error: { glyph: "×", cls: "text-negative", label: "Problem" },
};

/** Always rendered (possibly empty) so the field's aria-describedby always points at something. */
function Hint({ check, id }: { check: Check | null; id: string }) {
  const m = check ? MARK[check.level] : null;
  return (
    <p id={id} aria-live="polite" className="mt-1.5 flex gap-2 text-xs leading-relaxed text-muted">
      {check && m && (
        <>
          <span className={`font-bold ${m.cls}`}>
            <span aria-hidden="true">{m.glyph}</span>
            <span className="sr-only">{m.label}:</span>
          </span>
          <span>{check.text}</span>
        </>
      )}
    </p>
  );
}

const STEPS: { n: number; title: string; body: string; example: string }[] = [
  {
    n: 1,
    title: "Start from the news",
    body: "Any story that makes you think the market should react.",
    example: "Flights across the US were grounded after an airline's systems were hit.",
  },
  {
    n: 2,
    title: "Name the kind of event, not the one story",
    body: "One story happens once, and one event can never separate a real effect from a bad day. A kind of event keeps happening, so it can be tested again and again.",
    example: "A company reports a serious cyberattack (dozens a year, from SEC filings).",
  },
  {
    n: 3,
    title: "Say what moves, which way, and how fast",
    body: "One basket of stocks and one direction per claim. Two predictions are two claims.",
    example: "Airline stocks fall within three trading days. (A second claim: cybersecurity stocks rise.)",
  },
  {
    n: 4,
    title: "Say what would prove you wrong",
    body: "Before any new event happens. The claim is then graded only on events after it is registered.",
    example: "After eight new events, the average move is not below zero.",
  },
];

function Guide() {
  return (
    <section aria-labelledby="guide-h" className="bg-surface p-5">
      <h2 id="guide-h" className="text-lg font-extrabold">From a news story to a claim</h2>
      <ol className="mt-3 grid gap-3 sm:grid-cols-2">
        {STEPS.map((s) => (
          <li key={s.n} className="bg-surface-alt p-4">
            <p className="text-sm font-bold">
              <span className="mr-2 text-accent">{s.n}</span>
              {s.title}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted">{s.body}</p>
            <p className="mt-2 text-xs leading-relaxed">
              <span className="text-muted">Example: </span>
              {s.example}
            </p>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs leading-relaxed text-muted">
        What a claim cannot test: why something happened. The data shows how prices moved after a kind of event, not
        what caused one particular day.
      </p>
    </section>
  );
}

const DIRECTIONS: { value: Direction; label: string; hint: string }[] = [
  { value: "up", label: "Goes up", hint: "rises more than a normal day explains" },
  { value: "down", label: "Goes down", hint: "falls more than a normal day explains" },
  { value: "swing", label: "Bigger swings", hint: "moves more than usual, either way" },
];

/** Quick picks: the markets that are priced today, so a claim on them can be graded. */
function MarketPicks({ priced, onPick, current }: { priced: string[]; onPick: (s: string) => void; current: string }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Markets priced today">
      {priced.map((s) => (
        <button
          key={s}
          type="button"
          aria-pressed={current.toUpperCase() === s}
          onClick={() => onPick(s)}
          className={`px-3 py-1 text-[13px] font-semibold ${current.toUpperCase() === s ? "bg-fg text-bg" : "border border-line hover:bg-surface"}`}
        >
          {shortName(s)}
        </button>
      ))}
    </div>
  );
}

function Step({ n, title, children, done }: { n: number; title: string; children: ReactNode; done: boolean }) {
  return (
    <fieldset className="border border-line bg-bg p-5">
      <legend className="sr-only">{`Step ${n}: ${title}`}</legend>
      <p className="flex items-center gap-2 text-[15px] font-bold" aria-hidden="true">
        <span className={`grid h-6 w-6 place-items-center text-xs ${done ? "bg-pop text-on-pop" : "bg-surface-alt text-muted"}`}>
          {done ? "✓" : n}
        </span>
        {title}
      </p>
      <div className="mt-3">{children}</div>
    </fieldset>
  );
}

/** Start from the URL: a headline, a kind of event, or another claim to counter or refine. */
function initialForm(site: SiteData, params: URLSearchParams): { form: ClaimForm; direction: Direction; from: SiteClaim | null } {
  const answer = params.get("counter") ?? params.get("refine");
  const other = answer ? (site.claims.find((c) => c.claim.id === answer) ?? null) : null;
  if (other) {
    const c = other.claim;
    const counter = params.has("counter");
    const swing = c.measure === "abs_excess_return";
    const direction: Direction = swing ? "swing" : counter ? (c.expected_sign === "positive" ? "down" : "up") : c.expected_sign === "positive" ? "up" : "down";
    return {
      direction,
      from: other,
      form: {
        ...EMPTY_FORM,
        statement: counter
          ? `Counter to ${c.id}: ${swing ? "these events do not make the market move more than usual" : `when ${eventLabel(c.event_type)}, ${shortName(c.instrument.symbol)} ${direction === "up" ? "rises" : "falls"} instead`}.`
          : "",
        eventType: c.event_type,
        entities: c.trigger_entities.join(", "),
        symbol: c.instrument.symbol,
        venue: c.instrument.venue,
        windowEnd: c.window.end,
        baseline: c.baseline,
        measure: c.measure,
        expectedSign: direction === "down" ? "negative" : "positive",
        respondsTo: { claim: c.id, stance: counter ? "counter" : "refine" },
      },
    };
  }
  const t = params.get("eventType") ?? "";
  const symbol = (params.get("symbol") ?? "").toUpperCase().replace(/[^A-Z0-9.]/g, "").slice(0, 12);
  const dir = params.get("direction");
  const direction: Direction = dir === "up" || dir === "down" || dir === "swing" ? dir : "down";
  const windowEnd = WINDOWS.some((w) => w.value === params.get("window")) ? (params.get("window") as string) : EMPTY_FORM.windowEnd;
  return {
    direction,
    from: null,
    form: {
      ...EMPTY_FORM,
      statement: (params.get("statement") ?? "").slice(0, 600),
      eventType: site.taxonomy.some((e) => e.name === t) ? t : "",
      entities: (params.get("entities") ?? "").replace(/[^A-Za-z0-9., ]/g, "").slice(0, 80),
      symbol,
      venue: symbol ? venueFor(symbol) : EMPTY_FORM.venue,
      baseline: symbol ? baselineFor(symbol) : EMPTY_FORM.baseline,
      windowEnd,
    },
  };
}

function Form({ site }: { site: SiteData }) {
  const repo = site.meta.repo;
  const [params] = useSearchParams();
  const start = useMemo(() => initialForm(site, params), [site, params]);
  const [f, setF] = useState<ClaimForm>(start.form);
  const [direction, setDirection] = useState<Direction>(start.direction);
  const [idEdited, setIdEdited] = useState(false);
  const set = <K extends keyof ClaimForm>(k: K, v: ClaimForm[K]) => setF((p) => ({ ...p, [k]: v }));

  // Choices that follow from other choices, unless the person changed them under Advanced.
  const derived: ClaimForm = {
    ...f,
    expectedSign: direction === "down" ? "negative" : "positive",
    measure: direction === "swing" ? "abs_excess_return" : "abnormal_return",
    id: idEdited ? f.id : suggestedId(f.eventType, f.symbol, direction),
  };
  const text = useMemo(() => toYaml(derived), [derived]);
  const typeCheck = eventTypeCheck(f.eventType, site.taxonomy);
  const problems = useMemo(() => {
    const out = validateYaml(text);
    if (!f.eventType) out.push("Choose a kind of event.");
    else if (typeCheck?.level === "error") out.push(typeCheck.text);
    return out;
  }, [text, f.eventType, typeCheck]);
  const groups = useMemo(() => groupedTypes(site.taxonomy), [site.taxonomy]);
  const chosen = site.taxonomy.find((t) => t.name === f.eventType);
  const sentence = plainSentence(f.eventType, f.symbol, derived.expectedSign, f.windowEnd, f.baseline, direction === "swing");
  const hints = vagueHints(f.statement);
  const ready = readiness(f);
  const pickSymbol = (s: string) => setF((p) => ({ ...p, symbol: s, venue: venueFor(s), baseline: baselineFor(s) }));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[32px] font-extrabold leading-tight">Submit a claim</h1>
        <p className="mt-1 max-w-2xl text-[15px] text-muted">
          Seven short steps. No finance background needed: each step says what it means, and the form writes the claim file
          for you. Review checks only that a claim can be tested, never whether the idea is good.
        </p>
      </header>

      {start.from && derived.respondsTo && (
        <p role="note" className="border border-line bg-accent-soft p-4 text-[15px]">
          You are writing a <strong>{derived.respondsTo.stance === "counter" ? "counter-claim" : "refinement"}</strong> to{" "}
          <strong>{start.from.claim.id}</strong>. It is graded on its own, by the same rules, and listed on that claim&apos;s page.
          {derived.respondsTo.stance === "counter" ? " The direction is already set to the opposite." : ""}
        </p>
      )}

      <Guide />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <form className="min-w-0 space-y-4" onSubmit={(e) => e.preventDefault()} aria-label="Claim form">
          <Step n={1} title="What did you notice?" done={ready[0]!.done}>
            <label className="block text-sm">
              Your idea, in one sentence (a question is fine to start with)
              <textarea
                className={FIELD}
                rows={3}
                value={f.statement}
                placeholder="When airlines report a big IT outage, airline stocks fall within a week."
                onChange={(e) => set("statement", e.target.value)}
                aria-describedby="statement-hints"
              />
            </label>
            <div id="statement-hints" aria-live="polite">
              {hints.map((h) => (
                <Hint key={h.text} check={h} id={`h-${h.text.slice(0, 12)}`} />
              ))}
            </div>
          </Step>

          <Step n={2} title="What kind of event is it?" done={ready[1]!.done}>
            <label className="block text-sm">
              Pick the kind of event that keeps happening, not the one story
              <select className={FIELD} value={f.eventType} onChange={(e) => set("eventType", e.target.value)} aria-describedby="type-def type-hint">
                <option value="">Choose a kind of event…</option>
                {groups.map(([origin, types]) => (
                  <optgroup key={origin} label={ORIGIN_LABEL[origin]}>
                    {types.map((t) => (
                      <option key={t.name} value={t.name}>
                        {eventLabel(t.name)} ({t.past_events} past)
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <p id="type-def" className="mt-1.5 text-xs leading-relaxed text-muted">
              {chosen ? chosen.definition : "None fits? "}
              {!chosen && (
                <a className="text-accent underline" href={`https://github.com/${repo}/issues/new?template=event-type.yml`} rel="noopener noreferrer">
                  Suggest a new kind of event
                </a>
              )}
            </p>
            <Hint id="type-hint" check={typeCheck} />
          </Step>

          <Step n={3} title="Who is the news about?" done={!!f.entities.trim()}>
            <label className="block text-sm">
              Companies or institutions, by ticker (optional for scheduled releases)
              <input className={FIELD} placeholder="NVDA, MU" value={f.entities} onChange={(e) => set("entities", e.target.value.toUpperCase())} />
            </label>
          </Step>

          <Step n={4} title="Which market should move?" done={ready[2]!.done}>
            <label className="block text-sm">
              The stock, index or currency you expect to react
              <input className={`${FIELD} font-mono`} value={f.symbol} onChange={(e) => pickSymbol(e.target.value.toUpperCase())} aria-describedby="symbol-hint" />
            </label>
            <MarketPicks priced={site.meta.priced_symbols.filter((s) => s !== "MKT")} current={f.symbol} onPick={pickSymbol} />
            <Hint id="symbol-hint" check={symbolCheck(f.symbol, site.meta.priced_symbols)} />
          </Step>

          <Step n={5} title="Which way, and how fast?" done>
            <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Which way">
              {DIRECTIONS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  role="radio"
                  aria-checked={direction === d.value}
                  onClick={() => setDirection(d.value)}
                  className={` border p-3 text-left ${direction === d.value ? "border-fg bg-accent-soft" : "border-line hover:bg-surface"}`}
                >
                  <span className="block text-sm font-bold">{d.label}</span>
                  <span className="block text-xs text-muted">{d.hint}</span>
                </button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="How fast">
              {WINDOWS.map((w) => (
                <button
                  key={w.value}
                  type="button"
                  role="radio"
                  aria-checked={f.windowEnd === w.value}
                  onClick={() => set("windowEnd", w.value)}
                  className={` px-3.5 py-1.5 text-[13px] font-semibold ${f.windowEnd === w.value ? "bg-fg text-bg" : "border border-line hover:bg-surface"}`}
                >
                  {w.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              The claim is graded on this window. Check-ins at 1 week, 1 month, 6 months, 1 year and 5 years are added
              automatically, to show longer-term trends; they are never part of the grade.
            </p>
          </Step>

          <Step n={6} title="What would prove you wrong?" done={ready[3]!.done}>
            <label className="block text-sm">
              Written before any new event happens
              <textarea className={FIELD} rows={3} value={f.falsifier} onChange={(e) => set("falsifier", e.target.value)} />
            </label>
            <button
              type="button"
              onClick={() => set("falsifier", suggestedFalsifier(f.symbol, direction, f.minEvents))}
              className="mt-2 border border-line px-3 py-1 text-[13px] font-semibold hover:bg-surface"
            >
              Write it for me
            </button>
          </Step>

          <Step n={7} title="Who are you?" done={ready[4]!.done}>
            <label className="block text-sm">
              Your GitHub username (the claim is registered under it)
              <input className={FIELD} value={f.handle} onChange={(e) => set("handle", e.target.value)} />
            </label>
          </Step>

          <details className="border border-line bg-bg p-5">
            <summary className="cursor-pointer text-sm font-semibold">Advanced (filled in for you)</summary>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">Claim id
                <input
                  className={`${FIELD} font-mono`}
                  value={derived.id}
                  onChange={(e) => {
                    setIdEdited(true);
                    set("id", e.target.value);
                  }}
                  aria-describedby="id-help"
                />
                <span id="id-help" className="text-xs text-muted">Lowercase, ends in a version, e.g. clm_semis_korea_us_v1</span>
              </label>
              <label className="block text-sm">Venue
                <input className={`${FIELD} font-mono`} value={f.venue} onChange={(e) => set("venue", e.target.value)} />
              </label>
              <label className="block text-sm">Compared with
                <select className={FIELD} value={f.baseline} onChange={(e) => set("baseline", e.target.value as ClaimForm["baseline"])}>
                  <option value="factor_only">what the overall market explains</option>
                  <option value="constant_mean">its own normal day (for an index or currency)</option>
                </select>
              </label>
              <label className="block text-sm">New events needed for a verdict
                <input type="number" min={8} className={FIELD} value={f.minEvents} onChange={(e) => set("minEvents", Number(e.target.value))} />
              </label>
            </div>
          </details>
        </form>

        <div className="min-w-0 space-y-4 lg:sticky lg:top-24 lg:self-start">
          <section aria-labelledby="plain-h" className="hex-bg border border-line bg-surface p-5">
            <h2 id="plain-h" className="mb-1 text-lg font-extrabold">Your claim, made testable</h2>
            <p className="text-[15px] leading-relaxed" data-testid="plain-sentence">
              {sentence ?? <span className="text-muted">Choose a kind of event and a market to see it.</span>}
            </p>
            <ul className="mt-4 space-y-1.5 text-sm" aria-label="What the claim still needs">
              {ready.map((r) => (
                <li key={r.label} className={r.done ? "" : "text-muted"}>
                  <span aria-hidden="true" className={r.done ? "text-positive" : ""}>{r.done ? "✓ " : "○ "}</span>
                  {r.label}
                  <span className="sr-only">{r.done ? " (done)" : " (still needed)"}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs leading-relaxed text-muted">
              Checked by fixed rules anyone can read, not by an AI: they decide whether a claim can be tested, never whether it
              is right. The market decides that.
            </p>
          </section>

          <section aria-labelledby="valid-h" className="border border-line bg-bg p-5">
            <h2 id="valid-h" className="mb-2 text-lg font-extrabold">Validation</h2>
            {problems.length === 0 ? (
              <p role="status" className="text-sm font-medium text-positive">✓ Valid against the claim schema.</p>
            ) : (
              <div role="status" aria-live="polite">
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {problems.map((p) => <li key={p}>{p}</li>)}
                </ul>
              </div>
            )}
          </section>

          <a
            href={problems.length === 0 ? pullRequestUrl(repo, derived.id.trim(), text) : undefined}
            aria-disabled={problems.length > 0}
            className={`inline-flex w-full justify-center px-5 py-2.5 text-sm font-semibold ${problems.length === 0 ? "bg-pop text-on-pop" : "cursor-not-allowed bg-surface-alt text-muted"}`}
          >
            Open pull request on GitHub
          </a>
          <p className="text-xs text-muted">
            Opens GitHub&apos;s editor with this file pre-filled; choose &ldquo;Create a new branch and start a pull request&rdquo;.
            After merge you cannot edit the claim, only register a new version.
          </p>

          <details className="border border-line bg-bg p-4">
            <summary className="cursor-pointer text-sm font-semibold">See the claim file</summary>
            <pre tabIndex={0} aria-label="Generated claim file (scrollable)" className="mt-3 max-h-96 overflow-auto bg-surface p-3 font-mono text-xs" data-testid="yaml-preview">{text}</pre>
            <p className="mt-2 text-xs text-muted">
              To check it locally first: save it as <code className="font-mono">claims/{derived.id}.yaml</code> and run{" "}
              <code className="font-mono">make test-claim CLAIM=claims/{derived.id}.yaml</code>.
            </p>
          </details>
        </div>
      </div>
    </div>
  );
}

export default function SubmitPage() {
  return <Ready>{(site) => <Form site={site} />}</Ready>;
}
