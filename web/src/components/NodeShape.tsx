import type { NodeTypeKey } from "../design/nodes";

const PATHS: Record<NodeTypeKey, string> = {
  event: "M4 4h16v16H4z",
  entity: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z",
  instrument: "M12 2l10 10l-10 10L2 12z",
  factor: "M12 2l8.66 5v10L12 22l-8.66-5V7z",
  condition: "M12 3l10 18H2z",
  prediction: "M12 2l3 7l7.5.6l-5.7 4.9l1.8 7.4L12 18l-6.6 3.9l1.8-7.4L1.5 9.6L9 9z",
};

export function NodeShape({ type, size = 20 }: { type: NodeTypeKey; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={PATHS[type]} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}
