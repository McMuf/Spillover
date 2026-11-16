/** A tiny, label-free trend line. It is decoration: the numbers beside it carry the meaning. */
export function sparkPath(values: number[], width: number, height: number, pad = 3): string {
  if (values.length < 2) return "";
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const pts = values.map((v, i): [number, number] => [
    pad + (i / (values.length - 1)) * (width - 2 * pad),
    pad + (1 - (v - lo) / span) * (height - 2 * pad),
  ]);
  return pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
}

export function Sparkline({
  values,
  width = 112,
  height = 38,
  tone = "accent",
}: {
  values: number[];
  width?: number;
  height?: number;
  /** Neutral by default; only a realized outcome may use positive or negative. */
  tone?: "accent" | "muted" | "positive" | "negative";
}) {
  const d = sparkPath(values, width, height);
  if (!d) return <span style={{ width, height }} className="inline-block" aria-hidden="true" />;
  const stroke = { accent: "var(--c-accent)", muted: "var(--c-muted)", positive: "var(--c-positive)", negative: "var(--c-negative)" }[tone];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false" className="shrink-0">
      <path d={d} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
