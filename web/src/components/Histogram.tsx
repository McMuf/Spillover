import { pct } from "../lib/format";

export interface Bin {
  from: number;
  to: number;
  count: number;
}

/** Equal-width bins across the data range. Pure so it can be unit tested. */
export function histogram(values: number[], bins = 12): Bin[] {
  if (values.length === 0) return [];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const width = hi === lo ? 1 : (hi - lo) / bins;
  const out: Bin[] = Array.from({ length: hi === lo ? 1 : bins }, (_, i) => ({
    from: lo + i * width,
    to: lo + (i + 1) * width,
    count: 0,
  }));
  for (const v of values) {
    const i = Math.min(out.length - 1, Math.floor((v - lo) / width));
    (out[i] as Bin).count += 1;
  }
  return out;
}

const W = 360;
const H = 160;
const PAD = 24;

export function Histogram({ values, title }: { values: number[]; title: string }) {
  const bins = histogram(values);
  if (bins.length === 0) return <p className="text-sm text-muted">No events to plot.</p>;
  const lo = (bins[0] as Bin).from;
  const hi = (bins[bins.length - 1] as Bin).to;
  const max = Math.max(...bins.map((b) => b.count));
  const sx = (v: number): number => PAD + ((v - lo) / (hi - lo || 1)) * (W - 2 * PAD);
  const zeroVisible = lo <= 0 && hi >= 0;
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} className="w-full max-w-md">
        {bins.map((b) => (
          <rect
            key={b.from}
            x={sx(b.from) + 1}
            y={H - PAD - (b.count / max) * (H - 2 * PAD)}
            width={Math.max(1, sx(b.to) - sx(b.from) - 2)}
            height={(b.count / max) * (H - 2 * PAD)}
            fill="var(--c-muted)"
            opacity="0.75"
          />
        ))}
        <line x1={PAD} x2={W - PAD} y1={H - PAD} y2={H - PAD} stroke="var(--c-muted)" />
        {zeroVisible && <line x1={sx(0)} x2={sx(0)} y1={PAD / 2} y2={H - PAD} stroke="var(--c-fg)" strokeDasharray="3 3" />}
        <text x={PAD} y={H - 6} fontSize="10" fill="var(--c-muted)">{pct(lo)}</text>
        <text x={W - PAD} y={H - 6} fontSize="10" textAnchor="end" fill="var(--c-muted)">{pct(hi)}</text>
        {zeroVisible && <text x={sx(0)} y={PAD / 2 - 2} fontSize="10" textAnchor="middle" fill="var(--c-fg)">0</text>}
      </svg>
      <figcaption className="text-xs text-muted">
        {title}: {values.length} events, from {pct(lo)} to {pct(hi)}. Dashed line marks zero.
      </figcaption>
    </figure>
  );
}
