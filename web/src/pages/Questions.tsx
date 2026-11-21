import { useMemo, useState } from "react";
import { FeedRow } from "../components/FeedRow";
import { Icon } from "../components/Icon";
import { Ready } from "../components/Ready";
import { StatRow } from "../components/ui";
import type { SiteData } from "../generated/site";
import { askUrl, GISCUS } from "../lib/community";
import type { FeedItem } from "../lib/feed";

const CHIP = "shrink-0 whitespace-nowrap px-3.5 py-1.5 text-[13px] font-semibold";
const chip = (on: boolean) => `${CHIP} ${on ? "bg-fg text-bg" : "border border-line text-muted hover:text-fg"}`;

const EXAMPLES = [
  "Do airline stocks fall after a big outage?",
  "Does the dollar move more on Fed days than on jobs-report days?",
  "Do chip makers drop when a cyberattack hits a supplier?",
];

/**
 * Write the question here, then finish on GitHub: the link opens GitHub's new-discussion page with
 * the text filled in, and nothing is posted until the person presses Start discussion there.
 */
function Ask({ site }: { site: SiteData }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const href = askUrl(site.community, title, body);
  return (
    <section aria-labelledby="ask-h" className="bg-surface p-5">
      <h2 id="ask-h" className="text-[17px] font-bold">
        Ask a question
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        Half-formed is fine. Ask about a <em>kind</em> of news and a market, and others can help shape it into a claim the
        market can grade.
      </p>
      <label className="mt-4 block">
        <span className="text-sm font-semibold">Your question</span>
        <input
          id="ask-title"
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={EXAMPLES[0]}
          className="mt-1.5 w-full border border-line bg-bg px-3 py-2.5 text-[15px] text-fg placeholder:text-muted"
        />
      </label>
      <label className="mt-3 block">
        <span className="text-sm font-semibold">
          What made you wonder? <span className="font-normal text-muted">(optional)</span>
        </span>
        <textarea
          value={body}
          maxLength={2000}
          rows={3}
          onChange={(e) => setBody(e.target.value)}
          placeholder="A headline, a chart, a hunch…"
          className="mt-1.5 w-full border border-line bg-bg px-3 py-2.5 text-[15px] text-fg placeholder:text-muted"
        />
      </label>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="btn inline-flex items-center gap-2 bg-fg px-4 py-2 text-sm font-semibold text-bg hover:opacity-90"
        >
          Continue on GitHub
          <Icon name="external" size={16} />
        </a>
        <span className="text-xs text-muted">Needs a GitHub account. Nothing is posted until you press Start discussion there.</span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Example questions">
        {EXAMPLES.map((e) => (
          <button key={e} type="button" onClick={() => setTitle(e)} className="border border-line px-3 py-1 text-[13px] text-muted hover:text-fg">
            {e}
          </button>
        ))}
      </div>
    </section>
  );
}

type Filter = "open" | "answered" | "all";

function QuestionsBody({ site }: { site: SiteData }) {
  const { questions, fetched_at } = site.community;
  const [filter, setFilter] = useState<Filter>("open");
  const answered = questions.filter((q) => q.answered).length;
  const shown = useMemo(
    () =>
      questions
        .filter((q) => filter === "all" || (filter === "answered") === q.answered)
        .map((q): FeedItem => ({ kind: "question", id: `question-${q.number}`, at: q.created_at, topic: "Questions", question: q })),
    [questions, filter],
  );
  const all = `https://github.com/${GISCUS.repo}/discussions`;
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">
        <header>
          <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">Questions</h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">
            Most claims start as a question. Ask what you wonder about the news and markets, answer others, and turn the good ones into
            claims. Questions and answers never change a result: only the market grades claims.
          </p>
          <button
            type="button"
            onClick={() => {
              document.getElementById("ask-h")?.scrollIntoView({ behavior: "smooth" });
              document.getElementById("ask-title")?.focus({ preventScroll: true });
            }}
            className="mt-4 inline-flex items-center gap-2 bg-fg px-4 py-2 text-sm font-semibold text-bg hover:opacity-90 lg:hidden"
          >
            <Icon name="pen" size={16} />
            Ask a question
          </button>
          <div className="mt-4">
            <StatRow
              label="Questions so far"
              items={[
                { value: String(questions.length - answered), label: "open" },
                { value: String(answered), label: "answered" },
              ]}
            />
          </div>
        </header>
        <div className="no-scrollbar -mx-4 mt-6 flex gap-2 overflow-x-auto border-b border-line px-4 pb-4 md:mx-0 md:px-0" role="group" aria-label="Show questions">
          {(
            [
              ["open", "Open"],
              ["answered", "Answered"],
              ["all", "All"],
            ] as const
          ).map(([f, label]) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={chip(filter === f)}>
              {label}
            </button>
          ))}
        </div>
        <ul>
          {shown.map((it) => (
            <FeedRow key={it.id} item={it} site={site} />
          ))}
        </ul>
        {shown.length === 0 && (
          <p className="py-8 text-[15px] text-muted">
            {fetched_at === null
              ? "Questions could not be loaded when this page was built. "
              : filter === "answered"
                ? "No answered questions yet. "
                : "No open questions yet. Be the first to ask. "}
            <a href={all} className="text-accent underline" rel="noopener noreferrer">
              See the discussions on GitHub
            </a>
            .
          </p>
        )}
        <p className="py-4 text-xs text-muted">
          Questions live in this project&apos;s{" "}
          <a href={all} className="underline" rel="noopener noreferrer">
            GitHub Discussions
          </a>
          {fetched_at ? `, as of ${new Date(fetched_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}` : ""}. New
          ones show here when the site next rebuilds (several times a day).
        </p>
      </div>
      <aside aria-label="Ask" className="min-w-0 lg:sticky lg:top-24 lg:self-start">
        <Ask site={site} />
      </aside>
    </div>
  );
}

export default function Questions() {
  return <Ready>{(site) => <QuestionsBody site={site} />}</Ready>;
}
