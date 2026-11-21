import { Link } from "react-router-dom";
import { Icon, type IconName } from "./Icon";

const STEPS: { icon: IconName; title: string; body: string }[] = [
  { icon: "pen", title: "Someone writes a claim", body: "“Fed decisions make the S&P 500 swing more than usual”, plus what would prove it wrong." },
  { icon: "lock", title: "It is frozen", body: "Time-stamped and locked before the outcome. Nobody can pretend they called it." },
  { icon: "scale", title: "The market grades it", body: "After enough real events, against what the overall market already explains." },
];

/** The plain-English answer to "what is this?", at the bottom of the home page. */
export function HowItWorks() {
  return (
    <section aria-labelledby="how-h" className="hex-bg overflow-hidden rounded-3xl border border-line bg-surface p-6 md:p-8">
      <h2 id="how-h" className="text-[24px] font-extrabold tracking-tight">
        What is Spillover?
      </h2>
      <p className="mt-1 max-w-2xl text-[16px] leading-relaxed text-muted">
        Predictions about how news moves markets, locked in first and graded by real market data after.
      </p>

      <ol className="relative mt-6 grid gap-5 md:grid-cols-3 md:gap-4">
        <span aria-hidden="true" className="absolute left-5 right-5 top-5 hidden border-t-2 border-dashed border-accent/35 md:block" />
        {STEPS.map((s) => (
          <li key={s.title} className="relative flex gap-3 md:block">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-pop text-on-pop">
              <Icon name={s.icon} size={18} />
            </span>
            <div className="md:mt-3">
              <h3 className="font-bold">{s.title}</h3>
              <p className="mt-0.5 text-[15px] leading-relaxed text-muted">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-bg/70 px-4 py-3 text-sm">
        <p className="text-muted">
          <strong className="text-fg">No trading, no money, no advice.</strong> Card numbers are backtests: practice runs, not
          proof.
        </p>
        <Link to="/method" className="inline-flex items-center gap-1.5 font-semibold text-accent hover:underline">
          How the numbers are made
        </Link>
      </div>
    </section>
  );
}
