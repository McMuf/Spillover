/**
 * A market-style line chart: a thin line with no fill, a dashed baseline at the starting value, an
 * optional dashed marker for the event day, and a dot with a soft pulsing halo on the latest point.
 * Decorative: the numbers beside it carry the meaning.
 */
export function areaPaths(values: number[], width: number, height: number, pad = 4): { line: string; area: string } {
  if (values.length < 2) return { line: "", area: "" };
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const x = (i: number) => (i / (values.length - 1)) * width;
  const y = (v: number) => pad + (1 - (v - lo) / span) * (height - 2 * pad);
  const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  return { line, area: `${line} L${width} ${height} L0 ${height} Z` };
}

export type ChartTone = "up" | "down" | "neutral" | "accent";

const STROKE: Record<ChartTone, string> = {
  up: "var(--c-positive)",
  down: "var(--c-negative)",
  neutral: "var(--c-accent)", // the lime accent when direction does not apply
  accent: "var(--c-accent)",
};

export function AreaChart({
  values,
  markIndex,
  height = 140,
  tone = "neutral",
  live = true,
}: {
  values: number[];
  markIndex?: number;
  height?: number;
  /** Green when the effect is up, red when it is down; lime when direction does not apply. */
  tone?: ChartTone;
  /** Show the dot on the latest point. */
  live?: boolean;
}) {
  const stroke = STROKE[tone];
  const W = 600;
  const pad = 4;
  const { line } = areaPaths(values, W, height, pad);
  if (!line) return <div style={{ height }} aria-hidden="true" />;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const yOf = (v: number) => pad + (1 - (v - lo) / span) * (height - 2 * pad);
  const base = yOf(values[0] ?? lo);
  const last = values[values.length - 1] ?? lo;
  const mx = markIndex !== undefined && markIndex >= 0 ? (markIndex / (values.length - 1)) * W : null;
  return (
    <div className="relative" style={{ height }} aria-hidden="true">
      <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" width="100%" height={height} aria-hidden="true" focusable="false" className="block">
        <line x1="0" x2={W} y1={base} y2={base} stroke="var(--c-muted)" strokeOpacity="0.6" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
        {mx !== null && <line x1={mx} x2={mx} y1="0" y2={height} stroke="var(--c-muted)" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />}
        <path d={line} fill="none" stroke={stroke} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {live && (
        // Drawn in HTML so the dot stays round while the line stretches to fit.
        <span className="absolute right-0 h-2 w-2 -translate-y-1/2 translate-x-1/2" style={{ top: yOf(last) }}>
          <span className="live-halo absolute inset-0" style={{ background: stroke }} />
          <span className="absolute inset-0" style={{ background: stroke }} />
        </span>
      )}
    </div>
  );
}
