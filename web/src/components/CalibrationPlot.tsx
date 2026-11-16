import type { CalibrationBin } from "../generated/site";
import { plainPct } from "../lib/format";

const W = 320;
const H = 260;
const PAD = 36;
const x = (v: number): number => PAD + ((v - 0.5) / 0.5) * (W - 2 * PAD);
const y = (v: number): number => H - PAD - ((v - 0.5) / 0.5) * (H - 2 * PAD);

/** Stated confidence versus realized hit rate. The diagonal is perfect calibration. */
export function CalibrationPlot({ bins }: { bins: CalibrationBin[] }) {
  const used = bins.filter((b) => b.n > 0 && b.mean_confidence !== null && b.hit_rate !== null);
  if (used.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">
        No graded outcomes with a stated confidence yet. A claim can state one with the optional{" "}
        <code className="font-mono">confidence</code> field.
      </p>
    );
  }
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Calibration plot: stated confidence against realized hit rate" className="w-full max-w-sm">
        {[0.5, 0.6, 0.7, 0.8, 0.9, 1].map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={PAD} y2={H - PAD} stroke="var(--c-line)" />
            <line x1={PAD} x2={W - PAD} y1={y(t)} y2={y(t)} stroke="var(--c-line)" />
            <text x={x(t)} y={H - PAD + 14} fontSize="10" textAnchor="middle" fill="var(--c-muted)">{plainPct(t)}</text>
            <text x={PAD - 6} y={y(t) + 3} fontSize="10" textAnchor="end" fill="var(--c-muted)">{plainPct(t)}</text>
          </g>
        ))}
        <line x1={x(0.5)} y1={y(0.5)} x2={x(1)} y2={y(1)} stroke="var(--c-muted)" strokeDasharray="4 4" />
        {used.map((b) => {
          const cx = x(b.mean_confidence as number);
          const ci = b.hit_rate_ci;
          return (
            <g key={b.range[0]}>
              {ci && <line x1={cx} x2={cx} y1={y(Math.max(0.5, ci[0]))} y2={y(Math.max(0.5, ci[1]))} stroke="var(--c-accent)" strokeWidth="2" />}
              <circle cx={cx} cy={y(Math.max(0.5, b.hit_rate as number))} r={3 + Math.min(6, Math.sqrt(b.n))} fill="var(--c-accent)" />
            </g>
          );
        })}
        <text x={W / 2} y={H - 4} fontSize="10" textAnchor="middle" fill="var(--c-muted)">stated confidence</text>
        <text x={10} y={H / 2} fontSize="10" textAnchor="middle" fill="var(--c-muted)" transform={`rotate(-90 10 ${H / 2})`}>realized hit rate</text>
      </svg>
      <figcaption className="mt-2 text-xs text-muted">Dot size grows with the number of events; bars are 95% Wilson intervals.</figcaption>
      <table className="mt-3 w-full text-left text-xs">
        <caption className="sr-only">Calibration data</caption>
        <thead className="text-muted">
          <tr><th className="py-1 pr-2 font-medium">Stated</th><th className="pr-2 font-medium">Events</th><th className="font-medium">Hit rate</th></tr>
        </thead>
        <tbody>
          {used.map((b) => (
            <tr key={b.range[0]} className="border-t border-line">
              <td className="py-1 pr-2">{plainPct(b.mean_confidence)}</td><td className="pr-2">{b.n}</td><td>{plainPct(b.hit_rate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
