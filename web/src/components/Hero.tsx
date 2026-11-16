import { Link } from "react-router-dom";
import { NODE_TYPES } from "../design/nodes";
import { NodeShape } from "./NodeShape";

/** The six node shapes, translucent and overlapping, behind the pitch. */
export function Hero() {
  return (
    <section aria-labelledby="hero-h" className="relative mb-6 overflow-hidden rounded-[22px] border border-line bg-surface p-6">
      <div className="pointer-events-none absolute -right-6 -top-6 grid grid-cols-3 gap-2 text-accent opacity-25" aria-hidden="true">
        {NODE_TYPES.map((t) => (
          <NodeShape key={t.key} type={t.key} size={56} />
        ))}
      </div>
      <h1 id="hero-h" className="relative max-w-[18ch] text-[32px] font-extrabold leading-[1.1]">
        Write the claim. Freeze the call. Let the market grade it.
      </h1>
      <p className="relative mt-3 text-[15px] text-muted">
        An open ledger that tests how news spills over into markets. Each claim is frozen before the outcome, then
        graded against what the broader market already explains. Inconclusive means “not enough data yet”.
      </p>
      <Link
        to="/submit"
        className="relative mt-5 inline-flex rounded-full bg-primary px-6 py-3 text-base font-bold text-on-primary hover:brightness-110"
      >
        Submit a claim
      </Link>
    </section>
  );
}
