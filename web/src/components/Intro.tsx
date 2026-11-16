import { Link } from "react-router-dom";
import { NODE_TYPES } from "../design/nodes";
import { NodeShape } from "./NodeShape";

const STEPS = [
  {
    n: "1",
    title: "Someone writes a claim",
    body: "A claim is one testable sentence, such as “Fed rate decisions make the S&P 500 move more than usual.” It must also say what result would prove it wrong.",
  },
  {
    n: "2",
    title: "We freeze it",
    body: "Before the outcome happens, the claim is time-stamped and locked. Nobody can edit it afterwards, so nobody can pretend they called it.",
  },
  {
    n: "3",
    title: "The market grades it",
    body: "After enough real events, we check what the stock or index did, compared with what the overall market already explains. The result is public, with the maths shown.",
  },
];

/** The plain-English answer to "what is this?", before anything else on the page. */
export function Intro() {
  return (
    <section aria-labelledby="intro-h" className="relative mb-10 overflow-hidden rounded-xl border border-line bg-surface p-6 md:p-8">
      <div className="pointer-events-none absolute -right-4 -top-4 hidden grid-cols-3 gap-2 text-fg opacity-[0.07] md:grid" aria-hidden="true">
        {NODE_TYPES.map((t) => (
          <NodeShape key={t.key} type={t.key} size={64} />
        ))}
      </div>
      <h1 id="intro-h" className="relative max-w-3xl text-3xl font-extrabold leading-[1.1] md:text-5xl">
        Does news really move markets? Spillover tests it in public.
      </h1>
      <p className="relative mt-4 max-w-2xl text-lg text-muted">
        Anyone can post a prediction about how a headline or event will affect a stock or index. We lock it in before
        the outcome, then grade it against real market data. The scoreboard shows who was right, how many times it
        happened, and how sure we are.
      </p>

      <ol className="relative mt-8 grid gap-4 md:grid-cols-3">
        {STEPS.map((s) => (
          <li key={s.n} className="rounded-xl border border-line bg-bg p-4">
            <span className="mb-2 grid h-8 w-8 place-items-center rounded-full bg-primary text-sm font-extrabold text-on-primary" aria-hidden="true">
              {s.n}
            </span>
            <h2 className="text-lg font-bold">{s.title}</h2>
            <p className="mt-1 text-sm text-muted">{s.body}</p>
          </li>
        ))}
      </ol>

      <div className="relative mt-6 flex flex-wrap items-center gap-4">
        <a href="#claims" className="rounded-full bg-primary px-6 py-3 font-bold text-on-primary hover:brightness-110">
          Browse claims
        </a>
        <Link to="/submit" className="rounded-full border border-line px-6 py-3 font-bold hover:bg-surface-alt">
          Submit a claim
        </Link>
        <Link to="/method" className="text-sm font-semibold text-muted underline hover:text-fg">
          How the numbers are made
        </Link>
      </div>

      <p className="relative mt-5 text-sm text-muted">
        <strong className="text-fg">What this is not:</strong> there is no trading and no money here, and nothing is advice.
        The numbers on the cards below are <strong className="text-fg">backtests</strong> on past events: practice runs,
        not proof. “Inconclusive” means “not enough data yet”, not “wrong”.
      </p>
    </section>
  );
}
