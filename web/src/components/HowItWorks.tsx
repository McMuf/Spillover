import { Link } from "react-router-dom";
import { Icon, type IconName } from "./Icon";
import { tint } from "./ui";
import type { CategoryHue } from "../design/tokens";

const STEPS: { icon: IconName; hue: CategoryHue; title: string; body: string }[] = [
  {
    icon: "bulb",
    hue: "catYellow",
    title: "Someone writes a claim",
    body: "A claim is one testable sentence, such as “Fed rate decisions make the S&P 500 move more than usual.” It must also say what result would prove it wrong.",
  },
  {
    icon: "lock",
    hue: "catPurple",
    title: "We freeze it",
    body: "Before the outcome happens, the claim is time-stamped and locked. Nobody can edit it afterwards, so nobody can pretend they called it.",
  },
  {
    icon: "scale",
    hue: "catCyan",
    title: "The market grades it",
    body: "After enough real events, we check what the stock or index did, compared with what the overall market already explains. The result is public, with the maths shown.",
  },
];

/** The plain-English answer to "what is this?", at the bottom of the home page. */
export function HowItWorks() {
  return (
    <section aria-labelledby="how-h" className="rounded-xl border border-line bg-surface p-6 md:p-8">
      <h2 id="how-h" className="text-2xl font-bold md:text-3xl">
        What is Spillover?
      </h2>
      <p className="mt-3 max-w-3xl text-lg text-muted">
        Anyone can post a prediction about how a headline or event will affect a stock or index. We lock it in before
        the outcome, then grade it against real market data. The scoreboard shows who was right, how many times it
        happened, and how sure we are.
      </p>

      <ol className="mt-6 grid gap-4 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="rounded-xl border border-line bg-bg p-4">
            <span style={tint(s.hue, 18)} className="mb-3 grid h-10 w-10 place-items-center rounded-full border" aria-hidden="true">
              <Icon name={s.icon} size={20} />
            </span>
            <h3 className="text-lg font-bold">
              <span className="text-muted">{i + 1}. </span>
              {s.title}
            </h3>
            <p className="mt-1 text-sm text-muted">{s.body}</p>
          </li>
        ))}
      </ol>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link to="/submit" className="rounded-full bg-primary px-6 py-3 font-bold text-on-primary hover:brightness-110">
          Submit a claim
        </Link>
        <Link to="/method" className="rounded-full border border-line px-6 py-3 font-bold hover:bg-surface-alt">
          How the numbers are made
        </Link>
      </div>

      <p className="mt-5 text-sm text-muted">
        <strong className="text-fg">What this is not:</strong> there is no trading and no money here, and nothing is advice.
        The numbers on the cards are <strong className="text-fg">backtests</strong> on past events: practice runs, not
        proof. “Inconclusive” means “not enough data yet”, not “wrong”.
      </p>
    </section>
  );
}
