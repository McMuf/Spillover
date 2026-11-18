import { useMemo, useState } from "react";
import { Ready } from "../components/Ready";
import type { SiteData } from "../generated/site";
import {
  eventTypeCheck,
  groupedTypes,
  oneOffHint,
  ORIGIN_LABEL,
  plainSentence,
  symbolCheck,
  type Check,
} from "../lib/claimGuide";
import { EMPTY_FORM, pullRequestUrl, toYaml, validateYaml, type ClaimForm } from "../lib/claimYaml";
import { eventLabel } from "../lib/plain";

const FIELD = "mt-1 w-full rounded-xl border border-transparent bg-surface-alt px-4 py-3 text-[15px] text-fg focus:border-accent";

const MARK: Record<Check["level"], { glyph: string; cls: string; label: string }> = {
  ok: { glyph: "✓", cls: "text-positive", label: "OK" },
  warn: { glyph: "!", cls: "text-accent", label: "Note" },
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
    <section aria-labelledby="guide-h" className="rounded-2xl bg-surface p-5">
      <h2 id="guide-h" className="text-lg font-extrabold">From a news story to a claim</h2>
      <ol className="mt-3 grid gap-3 sm:grid-cols-2">
        {STEPS.map((s) => (
          <li key={s.n} className="rounded-xl bg-surface-alt p-4">
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

function Form({ site }: { site: SiteData }) {
  const repo = site.meta.repo;
  const [f, setF] = useState<ClaimForm>(EMPTY_FORM);
  const set = <K extends keyof ClaimForm>(k: K, v: ClaimForm[K]) => setF((p) => ({ ...p, [k]: v }));
  const text = useMemo(() => toYaml(f), [f]);
  const typeCheck = eventTypeCheck(f.eventType, site.taxonomy);
  const problems = useMemo(() => {
    const out = validateYaml(text);
    if (!f.eventType) out.push("Choose an event type.");
    else if (typeCheck?.level === "error") out.push(typeCheck.text);
    return out;
  }, [text, f.eventType, typeCheck]);
  const groups = useMemo(() => groupedTypes(site.taxonomy), [site.taxonomy]);
  const chosen = site.taxonomy.find((t) => t.name === f.eventType);
  const sentence = plainSentence(f.eventType, f.symbol, f.expectedSign, f.windowEnd, f.baseline);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[32px] font-extrabold leading-tight">Submit a claim</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Fill in the form. It writes the claim file, checks it live against the engine&apos;s schema, and opens a pull
          request. Review checks clarity and testability, never whether the idea is good.
        </p>
      </header>

      <Guide />

      <div className="grid gap-6">
        <form className="min-w-0 space-y-4" onSubmit={(e) => e.preventDefault()} aria-label="Claim form">
          <label className="block text-sm">Claim id
            <input className={`${FIELD} font-mono`} value={f.id} onChange={(e) => set("id", e.target.value)} aria-describedby="id-help" />
            <span id="id-help" className="text-xs text-muted">Lowercase, ends in a version, e.g. clm_semis_korea_us_v1</span>
          </label>
          <div>
            <label className="block text-sm">Statement (one sentence a non-expert can understand)
              <textarea className={FIELD} rows={3} value={f.statement} onChange={(e) => set("statement", e.target.value)} aria-describedby="statement-hint" />
            </label>
            <Hint id="statement-hint" check={oneOffHint(f.statement)} />
          </div>
          <div>
          <label className="block text-sm">Event type (the kind of event)
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
              {chosen && (
                <>
                  <code className="font-mono text-fg">{chosen.name}</code>: {chosen.definition}
                </>
              )}
            </p>
            <Hint id="type-hint" check={typeCheck} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">Trigger entities (comma separated)
              <input className={FIELD} placeholder="GOOGL, MSFT" value={f.entities} onChange={(e) => set("entities", e.target.value)} />
            </label>
            <div>
              <label className="block text-sm">Instrument symbol
                <input className={`${FIELD} font-mono`} value={f.symbol} onChange={(e) => set("symbol", e.target.value)} aria-describedby="symbol-hint" />
              </label>
              <Hint id="symbol-hint" check={symbolCheck(f.symbol, site.meta.priced_symbols)} />
            </div>
            <label className="block text-sm">Venue (required)
              <input className={`${FIELD} font-mono`} value={f.venue} onChange={(e) => set("venue", e.target.value)} />
            </label>
            <label className="block text-sm">Window end
              <select className={FIELD} value={f.windowEnd} onChange={(e) => set("windowEnd", e.target.value)}>
                <option value="+1_trading_day">+1 trading day</option>
                <option value="+3_trading_days">+3 trading days</option>
                <option value="+5_trading_days">+5 trading days</option>
              </select>
            </label>
            <label className="block text-sm">Expected sign
              <select className={FIELD} value={f.expectedSign} onChange={(e) => set("expectedSign", e.target.value as ClaimForm["expectedSign"])}>
                <option value="negative">negative</option>
                <option value="positive">positive</option>
              </select>
            </label>
            <label className="block text-sm">Baseline
              <select className={FIELD} value={f.baseline} onChange={(e) => set("baseline", e.target.value as ClaimForm["baseline"])}>
                <option value="factor_only">factor only</option>
                <option value="constant_mean">constant mean (index claims)</option>
              </select>
            </label>
            <label className="block text-sm">Minimum forward events
              <input type="number" min={8} className={FIELD} value={f.minEvents} onChange={(e) => set("minEvents", Number(e.target.value))} />
            </label>
          </div>
          <label className="block text-sm">What would prove me wrong? (mandatory)
            <textarea className={FIELD} rows={3} value={f.falsifier} onChange={(e) => set("falsifier", e.target.value)} />
          </label>
          <label className="block text-sm">Your GitHub handle
            <input className={FIELD} value={f.handle} onChange={(e) => set("handle", e.target.value)} />
          </label>
        </form>

        <div className="min-w-0 space-y-4">
          <section aria-labelledby="plain-h" className="rounded-2xl bg-surface p-5">
            <h2 id="plain-h" className="mb-1 text-lg font-extrabold">Your claim in plain words</h2>
            <p className="text-sm leading-relaxed" data-testid="plain-sentence">
              {sentence ?? <span className="text-muted">Choose an event type and a symbol to see it.</span>}
            </p>
          </section>

          <section aria-labelledby="yaml-h">
            <h2 id="yaml-h" className="mb-2 text-lg font-extrabold">Your claim file</h2>
            <pre tabIndex={0} aria-label="Generated claim file (scrollable)" className="max-h-96 overflow-auto rounded-2xl bg-surface p-3 font-mono text-xs" data-testid="yaml-preview">{text}</pre>
          </section>

          <section aria-labelledby="valid-h" className="rounded-2xl bg-surface p-5">
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

          <section aria-labelledby="feas-h" className="rounded-2xl bg-surface p-5">
            <h2 id="feas-h" className="mb-1 text-lg font-extrabold">Feasibility check</h2>
            <p className="text-sm text-muted">
              The event type above shows how many past events are in the data. How many of them the claim can actually use
              (events too close together overlap and count once) is computed by the engine, which does not run in the
              browser. Save the file as <code className="font-mono">claims/{f.id}.yaml</code> and run{" "}
              <code className="font-mono">make test-claim CLAIM=claims/{f.id}.yaml</code> before you open the pull request.
            </p>
          </section>

          <a
            href={problems.length === 0 ? pullRequestUrl(repo, f.id.trim(), text) : undefined}
            aria-disabled={problems.length > 0}
            className={`inline-block rounded-full px-5 py-2 text-sm font-semibold ${problems.length === 0 ? "bg-accent text-on-accent" : "cursor-not-allowed bg-surface-alt text-muted"}`}
          >
            Open pull request on GitHub
          </a>
          <p className="text-xs text-muted">
            Opens GitHub&apos;s editor with this file pre-filled; choose “Create a new branch and start a pull request”.
            Sign off your commit (<code className="font-mono">git commit -s</code> if you use the command line). After merge
            you cannot edit the claim, only register a new version.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SubmitPage() {
  return <Ready>{(site) => <Form site={site} />}</Ready>;
}
