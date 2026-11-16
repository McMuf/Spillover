/**
 * A flat area chart: one accent line over a faint fill of the same color (no gradient), with an
 * optional dashed marker for the event day. Decorative: the numbers beside it carry the meaning.
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

export function AreaChart({ values, markIndex, height = 140 }: { values: number[]; markIndex?: number; height?: number }) {
  const W = 600;
  const { line, area } = areaPaths(values, W, height);
  if (!line) return <div style={{ height }} aria-hidden="true" />;
  const mx = markIndex !== undefined && markIndex >= 0 ? (markIndex / (values.length - 1)) * W : null;
  return (
    <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" width="100%" height={height} aria-hidden="true" focusable="false" className="block">
      <path d={area} fill="var(--c-accent)" fillOpacity="0.1" />
      {mx !== null && <line x1={mx} x2={mx} y1="0" y2={height} stroke="var(--c-muted)" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />}
      <path d={line} fill="none" stroke="var(--c-accent)" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
