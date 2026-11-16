import type { Status } from "../lib/format";

// Verdicts come from realized outcomes, so Supported and Not supported may use green and red.
// Every badge also carries a text label and a distinct mark, so color is never the only cue.
const STYLE: Record<Status, { cls: string; mark: string }> = {
  Draft: { cls: "border-dashed border-line text-muted", mark: "◌" },
  Proposed: { cls: "border-cat-blue/40 bg-cat-blue/15 text-cat-blue", mark: "○" },
  Supported: { cls: "border-positive bg-positive/15 text-positive", mark: "✓" },
  "Not supported": { cls: "border-negative bg-negative/15 text-negative", mark: "✕" },
  Inconclusive: { cls: "border-cat-orange/40 bg-cat-orange/15 text-cat-orange", mark: "≈" },
};

export function StatusBadge({ status }: { status: Status }) {
  const s = STYLE[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${s.cls}`}
    >
      <span aria-hidden="true">{s.mark}</span>
      {status}
    </span>
  );
}
