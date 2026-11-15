import { useMemo, useState } from "react";
import { Ready } from "../components/Ready";
import { EMPTY_FORM, pullRequestUrl, toYaml, validateYaml, type ClaimForm } from "../lib/claimYaml";

const FIELD = "mt-1 w-full rounded-[10px] border border-line bg-surface px-3 py-2 text-sm text-fg";

function Form({ repo }: { repo: string }) {
  const [f, setF] = useState<ClaimForm>(EMPTY_FORM);
  const set = <K extends keyof ClaimForm>(k: K, v: ClaimForm[K]) => setF((p) => ({ ...p, [k]: v }));
  const text = useMemo(() => toYaml(f), [f]);
  const problems = useMemo(() => validateYaml(text), [text]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Submit a claim</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Fill in the form. It writes the claim file, checks it live against the engine&apos;s schema, and opens a pull
          request. Review checks clarity and testability, never whether the idea is good.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <form className="space-y-4" onSubmit={(e) => e.preventDefault()} aria-label="Claim form">
          <label className="block text-sm">Claim id
            <input className={`${FIELD} font-mono`} value={f.id} onChange={(e) => set("id", e.target.value)} aria-describedby="id-help" />
            <span id="id-help" className="text-xs text-muted">Lowercase, ends in a version, e.g. clm_semis_korea_us_v1</span>
          </label>
          <label className="block text-sm">Statement (one sentence a non-expert can understand)
            <textarea className={FIELD} rows={3} value={f.statement} onChange={(e) => set("statement", e.target.value)} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">Event type
              <input className={`${FIELD} font-mono`} placeholder="FOMC_DECISION" value={f.eventType} onChange={(e) => set("eventType", e.target.value.toUpperCase())} />
            </label>
            <label className="block text-sm">Trigger entities (comma separated)
              <input className={FIELD} placeholder="GOOGL, MSFT" value={f.entities} onChange={(e) => set("entities", e.target.value)} />
            </label>
            <label className="block text-sm">Instrument symbol
              <input className={`${FIELD} font-mono`} value={f.symbol} onChange={(e) => set("symbol", e.target.value)} />
            </label>
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

        <div className="space-y-4">
          <section aria-labelledby="yaml-h">
            <h2 id="yaml-h" className="mb-2 text-sm font-semibold">Your claim file</h2>
            <pre tabIndex={0} aria-label="Generated claim file (scrollable)" className="max-h-96 overflow-auto rounded-[10px] border border-line bg-surface p-3 font-mono text-xs" data-testid="yaml-preview">{text}</pre>
          </section>

          <section aria-labelledby="valid-h" className="rounded-[10px] border border-line bg-surface p-4">
            <h2 id="valid-h" className="mb-2 text-sm font-semibold">Validation</h2>
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

          <section aria-labelledby="feas-h" className="rounded-[10px] border border-line bg-surface p-4">
            <h2 id="feas-h" className="mb-1 text-sm font-semibold">Feasibility check</h2>
            <p className="text-sm text-muted">
              How many past events match and how many are independent is computed by the engine, which does not run in the
              browser. Save the file as <code className="font-mono">claims/{f.id}.yaml</code> and run{" "}
              <code className="font-mono">make test-claim CLAIM=claims/{f.id}.yaml</code> before you open the pull request.
              An in-browser check is planned.
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
  return <Ready>{(site) => <Form repo={site.meta.repo} />}</Ready>;
}
