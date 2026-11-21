import { Link } from "react-router-dom";
import { ArchitectureMap } from "../components/ArchitectureMap";

const REPO = "https://github.com/McMuf/Spillover";

/** The pipeline, left to right: where things come from, what the engine does, where it is kept, what you see. */
const STAGES: { title: string; items: string[] }[] = [
  { title: "Contribute", items: ["A claim as one YAML file", "A pull request, checked by CI and a bot"] },
  { title: "Inputs", items: ["Fed, CPI and jobs-report calendars", "SEC 8-K filings", "Headlines from outlets' feeds and GDELT", "Prices from FRED and Tiingo"] },
  { title: "Engine (Python)", items: ["Validate the claim", "Label events", "Event study", "Freeze, hash and timestamp", "Grade closed windows"] },
  { title: "Store (Git)", items: ["events/", "predictions/ with .ots proofs", "outcomes/", "Append-only history"] },
  { title: "Website", items: ["One JSON file from the engine", "React, built to static files", "GitHub Pages, rebuilt hourly"] },
];

const WHY: [string, string][] = [
  ["Git as the database", "Pre-registration needs a public history nobody can quietly rewrite. Git already gives diffs, authorship, review and mirrors, and a hosted database would add cost and a trust question."],
  ["A static site", "No hosting bill, no server to attack, and anyone can preview it locally."],
  ["Python engine, TypeScript site", "Python has the statistics tooling; TypeScript gives a typed interface. A JSON Schema sits between them, so they cannot drift apart without a build error."],
  ["One schema, generated types", "The Pydantic models are the single source. JSON Schema and the site's TypeScript types are generated from them."],
  ["Scheduled CI instead of a server", "The engine only needs to run on a schedule. GitHub Actions jobs commit their results back to main, which replaces a backend."],
];

const PARTS: { name: string; does: string; why: string }[] = [
  {
    name: "Claims registry",
    does: "One YAML file per claim, parsed into a Pydantic model and checked against a generated JSON Schema. A claim's id carries its version.",
    why: "A pull request on a claim is readable and attributable, and a changed claim is a new version, so nobody can edit their way to a win.",
  },
  {
    name: "Data ingestion",
    does: "Pulls daily prices into a local cache of derived returns: indexes and currencies from FRED, single stocks from Tiingo. Implausible data, such as an unadjusted split, is refused.",
    why: "Only derived statistics are stored or shown, never raw prices, which respects the providers' terms. A new source is one small function.",
  },
  {
    name: "Event feed",
    does: "Scheduled releases from official calendars, company events from SEC 8-K item numbers, and headline metadata (title, link, outlet, time).",
    why: "An event is dated by the first New York session that could react to it. One story from fifteen outlets is one event, not fifteen.",
  },
  {
    name: "Event labelers",
    does: "Turn a headline into a typed event. Phrase rules are the default; a small open model (MiniLM) runs locally as a second option, and Claude is optional.",
    why: "People label a sample by hand, and that set measures each labeler. Accuracy is shown only once the set holds enough real events.",
  },
  {
    name: "Event-study engine",
    does: "Fits what a normal day looks like over 120 trading days that end 10 days before the event, subtracts it, and sums the difference over the claim's window.",
    why: "It is the standard method for this question. A Student t-interval on exactly the first N events, checked by simulation, keeps false positives near 5%.",
  },
  {
    name: "Prediction ledger",
    does: "For every new qualifying event, a prediction is written before its window closes, hashed with SHA-256 and submitted to OpenTimestamps.",
    why: "Git times can be rewritten. A Bitcoin-anchored proof shows the file existed by a given block, independent of GitHub and of the maintainer.",
  },
  {
    name: "Scoring",
    does: "After a window closes, each prediction is graded into an append-only outcome record, and claims get their status once their fixed sample is complete.",
    why: "Grading is a pure function of the prediction, the prices and the rules version, so anyone can recompute every number.",
  },
  {
    name: "Website",
    does: "React and TypeScript, built with Vite and styled with Tailwind tokens. It reads one JSON file the engine writes.",
    why: "No backend and no secrets in the browser. A strict Content-Security-Policy allows only the site's own code.",
  },
];

const JOBS: [string, string, string][] = [
  ["check", "Every pull request", "Lint, types, tests, schema checks, and blocks edits to registered claims or generated files. Read-only, no secrets."],
  ["comment", "After check", "Reads a pull request's files as plain text with trusted code and posts one feasibility comment. Never runs the pull request's code."],
  ["register", "A merged claim", "Stamps the registration time on the files that push added."],
  ["ingest", "Schedule", "Builds the price cache, adds new events, freezes predictions."],
  ["stamp", "Schedule", "Verifies the ledger's hashes and requests or upgrades timestamp proofs."],
  ["score", "Weekdays", "Grades closed windows against real prices and rebuilds the scoreboard data."],
  ["site", "Hourly and on every merge", "Fetches the latest headlines and icons, builds the site and deploys it to GitHub Pages."],
];

const SECURITY = [
  "Pull requests from forks run with a read-only token and no secrets.",
  "The bot that comments never checks out or runs pull-request code.",
  "Secrets exist only in scheduled jobs on main, and each is given to the one step that needs it.",
  "Every GitHub Action is pinned to a commit hash and updated by Dependabot.",
  "Network fetches are https-only, size-capped, and redact keys from every message.",
];

const STACK: [string, string][] = [
  ["Engine", "Python 3.12, uv, Pydantic v2, Polars, DuckDB, statsmodels, scipy, Typer"],
  ["Website", "React, TypeScript, Vite, Tailwind, Radix, TradingView Lightweight Charts"],
  ["Testing", "pytest, pyright (strict), Vitest, Playwright, axe-core"],
  ["Infrastructure", "GitHub Actions, GitHub Pages, OpenTimestamps"],
];

const H2 = "text-[24px] font-extrabold tracking-tight";

export default function Architecture() {
  return (
    <div className="space-y-12">
      <header className="hex-bg lift bg-surface px-6 py-10 md:px-10 md:py-12">
        <h1 className="text-[34px] font-extrabold leading-[1.05] tracking-tight md:text-[46px]">Architecture</h1>
        <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-muted">
          Git is the database, Python is the engine, and the website is a static build that reads the engine&apos;s output.
          There is no server to run, no database to administer and no secret in the browser. The full write-up is in the{" "}
          <a className="text-accent underline underline-offset-2" href={`${REPO}#architecture`}>
            README
          </a>
          .
        </p>
      </header>

      <section aria-labelledby="flow-h">
        <h2 id="flow-h" className={H2}>
          How data moves
        </h2>
        <p className="mt-1 text-muted">Read left to right. Everything that is graded lives in Git.</p>
        <div className="lift mt-5 bg-black p-3 md:p-4">
          <ArchitectureMap />
        </div>
        <ol className="sr-only">
          {STAGES.map((s) => (
            <li key={s.title}>
              {s.title}: {s.items.join(", ")}
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="why-h">
        <h2 id="why-h" className={H2}>
          Why this shape
        </h2>
        <dl className="lift mt-5 divide-y divide-line bg-bg">
          {WHY.map(([k, v]) => (
            <div key={k} className="grid gap-1 px-5 py-4 md:grid-cols-[16rem_minmax(0,1fr)] md:gap-6">
              <dt className="font-bold">{k}</dt>
              <dd className="text-[15px] leading-relaxed text-muted">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="parts-h">
        <h2 id="parts-h" className={H2}>
          The parts
        </h2>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          {PARTS.map((p) => (
            <article key={p.name} className="border border-line bg-bg p-5">
              <h3 className="text-[17px] font-extrabold">{p.name}</h3>
              <p className="mt-2 text-[15px] leading-relaxed">{p.does}</p>
              <p className="mt-3 border-t border-line pt-3 text-sm leading-relaxed text-muted">{p.why}</p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="jobs-h">
        <h2 id="jobs-h" className={H2}>
          Scheduled jobs
        </h2>
        <p className="mt-1 text-muted">GitHub Actions workflows, each with the smallest permissions it needs.</p>
        <div tabIndex={0} role="region" aria-label="Scheduled jobs (scrollable)" className="lift mt-5 overflow-x-auto bg-bg">
          <table className="w-full min-w-[40rem] text-left text-[15px]">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="px-4 py-3 text-[13px] font-medium text-muted">Workflow</th>
                <th scope="col" className="px-4 py-3 text-[13px] font-medium text-muted">Runs on</th>
                <th scope="col" className="px-4 py-3 text-[13px] font-medium text-muted">What it does</th>
              </tr>
            </thead>
            <tbody>
              {JOBS.map(([name, when, does]) => (
                <tr key={name} className="border-b border-line last:border-b-0">
                  <td className="px-4 py-3 font-semibold">{name}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">{when}</td>
                  <td className="px-4 py-3">{does}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-8 md:grid-cols-2">
        <section aria-labelledby="sec-h">
          <h2 id="sec-h" className={H2}>
            Pull requests from strangers
          </h2>
          <ul className="mt-4 space-y-2 text-[15px] leading-relaxed">
            {SECURITY.map((s) => (
              <li key={s} className="border-l-2 border-accent pl-3">
                {s}
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="stack-h">
          <h2 id="stack-h" className={H2}>
            Stack
          </h2>
          <dl className="mt-4 space-y-3 text-[15px]">
            {STACK.map(([k, v]) => (
              <div key={k}>
                <dt className="font-bold">{k}</dt>
                <dd className="text-muted">{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <p className="text-muted">
        The statistics behind each number are on{" "}
        <Link to="/method" className="text-accent underline underline-offset-2">
          How it works
        </Link>
        .
      </p>
    </div>
  );
}
