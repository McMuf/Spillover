import type { Status } from "../lib/format";

// Supported and Not supported are realized verdicts, so they take green and red; Proposed takes the lime accent.
// Every badge also carries a text label and a distinct mark, so color is never the only cue.
const STYLE: Record<Status, { cls: string; mark: string }> = {
  Draft: { cls: "text-muted", mark: "◌" },
  Proposed: { cls: "text-accent", mark: "○" },
  Supported: { cls: "text-positive", mark: "✓" },
  "Not supported": { cls: "text-negative", mark: "✕" },
  Inconclusive: { cls: "text-muted", mark: "≈" },
};

export function StatusBadge({ status }: { status: Status }) {
  const s = STYLE[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md bg-surface-alt px-2 py-0.5 text-xs font-semibold ${s.cls}`}
    >
      <span aria-hidden="true">{s.mark}</span>
      {status}
    </span>
  );
}
