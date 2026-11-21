import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Ready } from "../components/Ready";
import { Stamp, Tag } from "../components/ui";
import type { SiteData } from "../generated/site";
import { type Draft, goldRows, loadDrafts, parseTickers, saveDrafts, toJsonl } from "../lib/gold";
import { plainPct } from "../lib/format";

const PANEL = "rounded-2xl bg-surface p-5 md:p-6";
const FIELD = "mt-1 w-full rounded-xl border border-transparent bg-surface-alt px-3 py-2.5 text-[15px] text-fg focus:border-accent";

function LabelBody({ site }: { site: SiteData }) {
  const lab = site.labeling;
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => loadDrafts());
  const [copied, setCopied] = useState(false);
  useEffect(() => saveDrafts(drafts), [drafts]);

  const rows = useMemo(() => goldRows(lab.gold, lab.candidates, drafts), [lab, drafts]);
  const added = rows.length - lab.gold.length;
  const text = toJsonl(rows);
  const repo = site.meta.repo;

  const set = (id: string, patch: Partial<Draft>) =>
    setDrafts((d) => ({ ...d, [id]: { type: d[id]?.type ?? "", entities: d[id]?.entities ?? "", ...patch } }));

  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "application/jsonl" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "gold.jsonl";
    a.click();
    URL.revokeObjectURL(url);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy the file contents:", text);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight">Help measure the labeler</h1>
        <p className="mt-3 text-[17px] leading-relaxed text-muted">
          Spillover reads news headlines and labels each one automatically: what kind of event it is, and which company
          it is about. To know how often that is right, people label the same headlines by hand. Your labels are compared
          with the labeler&apos;s and the accuracy is published. You never see its answers here, so they cannot sway yours.
        </p>
      </header>

      <section aria-labelledby="acc-h" className={PANEL}>
        <h2 id="acc-h" className="text-lg font-bold">
          Accuracy so far
        </h2>
        {lab.accuracy && !lab.accuracy.measurable ? (
          // Honest by construction: on a gold set of only "none of the above", a labeler that always
          // answers "none" scores 100%, so no accuracy number is shown until there are real events.
          <div className="mt-3 rounded-xl bg-notice-bg p-4 text-[15px] leading-relaxed text-notice-fg" data-testid="accuracy-not-measurable">
            <p className="font-semibold">Not measurable yet.</p>
            <p className="mt-1">
              {lab.accuracy.n_positive} of {lab.accuracy.n_scored} labeled headlines are real events; the rest are &ldquo;none of
              the above&rdquo;. On a set like that, a labeler that always answers &ldquo;none&rdquo; would score{" "}
              {plainPct(lab.accuracy.majority_baseline)}, so an accuracy number would say nothing. It appears once at least 20
              labeled headlines are real events. The headlines below mix likely events with the rest to get there.
            </p>
          </div>
        ) : lab.accuracy ? (
          <>
            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Real events typed right", plainPct(lab.accuracy.event_recall)],
                ["Its event answers that were right", plainPct(lab.accuracy.event_precision)],
                ["All answers right", plainPct(lab.accuracy.type_accuracy)],
                ["Always answering the most common label", plainPct(lab.accuracy.majority_baseline)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-surface-alt p-3">
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd className="text-xl font-extrabold">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-xs text-muted">
              The last number is the bar to beat: a labeler is only useful if it does better than always giving the most common
              answer. Based on {lab.accuracy.n_positive} real events.
            </p>
          </>
        ) : (
          <p className="mt-2 text-[15px] text-muted">
            No accuracy yet: nobody has labeled headlines. The first set of labels you add here produces the first number.
          </p>
        )}
        <p className="mt-3 text-xs text-muted">
          {lab.gold_rows} headline{lab.gold_rows === 1 ? "" : "s"} labeled by people so far
          {lab.accuracy && `, checked against labeler ${lab.accuracy.extractor_version}`}
        </p>
      </section>

      <details className={PANEL}>
        <summary className="cursor-pointer text-[15px] font-semibold">What each label means</summary>
        <dl className="mt-3 space-y-2.5">
          {lab.event_types.map((t) => (
            <div key={t.name}>
              <dt className="font-mono text-sm font-semibold">{t.name}</dt>
              <dd className="text-sm text-muted">{t.definition}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-sm text-muted">
          Companies: write the stock ticker (for example AXP for American Express). Leave it empty if no listed company
          is the subject. Unsure about a headline? Leave it unlabeled; skipping is better than guessing.
        </p>
      </details>

      {lab.candidates.length === 0 ? (
        <p className={`${PANEL} text-[15px] text-muted`}>
          No headlines to label right now. They appear after the scheduled job has read the news feeds.
        </p>
      ) : (
        <ol className="space-y-3" aria-label="Headlines to label">
          {lab.candidates.map((c, i) => {
            const d = drafts[c.headline_id] ?? { type: "", entities: "" };
            const { bad } = parseTickers(d.entities);
            const typeId = `t-${c.headline_id}`;
            const entId = `e-${c.headline_id}`;
            return (
              <li key={c.headline_id} className={`${PANEL} ${d.type ? "ring-1 ring-accent/40" : ""}`}>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-muted">#{i + 1}</span>
                  <Tag>{c.source}</Tag>
                  <Stamp>{c.published_at.slice(0, 10)}</Stamp>
                </div>
                <p className="text-[17px] font-semibold leading-snug">
                  <a href={c.url} rel="noopener noreferrer" target="_blank" className="hover:underline">
                    {c.title}
                  </a>
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label htmlFor={typeId} className="block text-sm text-muted">
                    What happened
                    <select id={typeId} className={FIELD} value={d.type} onChange={(e) => set(c.headline_id, { type: e.target.value })}>
                      <option value="">Not labeled yet</option>
                      {lab.event_types.map((t) => (
                        <option key={t.name} value={t.name}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label htmlFor={entId} className="block text-sm text-muted">
                    Company tickers (comma separated)
                    <input
                      id={entId}
                      className={`${FIELD} font-mono`}
                      value={d.entities}
                      disabled={d.type === "NONE"}
                      placeholder={d.type === "NONE" ? "none" : "e.g. AXP"}
                      aria-invalid={bad.length > 0}
                      aria-describedby={bad.length ? `${entId}-err` : undefined}
                      onChange={(e) => set(c.headline_id, { entities: e.target.value })}
                    />
                    {bad.length > 0 && (
                      <span id={`${entId}-err`} className="mt-1 block text-xs text-negative">
                        Not a ticker: {bad.join(", ")}
                      </span>
                    )}
                  </label>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <section aria-labelledby="send-h" className={PANEL}>
        <h2 id="send-h" className="text-lg font-bold">
          Add your labels to the project
        </h2>
        <p className="mt-1 text-sm text-muted" role="status">
          {added} new label{added === 1 ? "" : "s"} this session, {rows.length} in the file in total
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={download}
            disabled={added === 0}
            className="rounded-full bg-fg px-5 py-2.5 font-bold text-bg hover:brightness-110 disabled:opacity-50"
          >
            Download gold.jsonl
          </button>
          <button type="button" onClick={copy} disabled={added === 0} className="rounded-full bg-surface-alt px-5 py-2.5 font-bold hover:bg-line disabled:opacity-50">
            {copied ? "Copied" : "Copy contents"}
          </button>
        </div>
        <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-muted">
          <li>
            Open the{" "}
            <a className="text-accent underline underline-offset-2" href={`https://github.com/${repo}/tree/main/labels`}>
              labels folder on GitHub
            </a>{" "}
            and choose <strong className="text-fg">Add file → Upload files</strong>.
          </li>
          <li>
            Upload the downloaded <code className="font-mono">gold.jsonl</code>. It already includes every earlier label, so
            replacing the old file loses nothing.
          </li>
          <li>Commit. The next site build scores the labeler against your labels and shows the result above.</li>
        </ol>
        <p className="mt-3 text-xs text-muted">
          Your answers are kept in this browser until you download them. See <Link className="text-accent underline underline-offset-2" to="/method">how the numbers are made</Link>.
        </p>
      </section>
    </div>
  );
}

export default function LabelPage() {
  return <Ready>{(site) => <LabelBody site={site} />}</Ready>;
}
