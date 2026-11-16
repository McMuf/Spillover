import { Link } from "react-router-dom";

const STEPS = [
  {
    title: "Someone writes a claim",
    body: "One testable sentence, such as “Fed rate decisions make the S&P 500 move more than usual,” plus the result that would prove it wrong.",
  },
  {
    title: "We freeze it",
    body: "Before the outcome, the claim is time-stamped and locked. Nobody can edit it afterwards, so nobody can pretend they called it.",
  },
  {
    title: "The market grades it",
    body: "After enough real events, we check what the stock or index did, compared with what the overall market already explains. The maths is public.",
  },
];

/** The plain-English answer to "what is this?", at the bottom of the home page. */
export function HowItWorks() {
  return (
    <section aria-labelledby="how-h" className="rounded-2xl bg-surface p-6 md:p-8">
      <h2 id="how-h" className="text-[22px] font-bold">
        What is Spillover?
      </h2>
      <p className="mt-2 max-w-3xl text-[17px] leading-relaxed text-muted">
        Anyone can post a prediction about how a headline or event will affect a stock or index. We lock it in before
        the outcome, then grade it against real market data. The scoreboard shows who was right, how often it happened,
        and how sure we are.
      </p>

      <ol className="mt-8 grid gap-8 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title}>
            <p className="font-mono text-sm text-muted">0{i + 1}</p>
            <h3 className="mt-1 text-lg font-bold">{s.title}</h3>
            <p className="mt-1 text-[15px] leading-relaxed text-muted">{s.body}</p>
          </li>
        ))}
      </ol>

      <p className="mt-8 border-t border-line pt-5 text-sm leading-relaxed text-muted">
        <strong className="text-fg">What this is not.</strong> There is no trading and no money here, and nothing is advice.
        Numbers on the cards are <strong className="text-fg">backtests</strong> on past events: practice runs, not proof.
        “Inconclusive” means “not enough data yet”, not “wrong”.{" "}
        <Link to="/method" className="text-accent underline underline-offset-2">
          How the numbers are made
        </Link>
      </p>
    </section>
  );
}
