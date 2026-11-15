import type { Instrument } from "../generated/site";
import { venueLabel } from "../lib/format";

/** Symbol plus venue, never one without the other. */
export function InstrumentChip({ instrument }: { instrument: Instrument }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs">
      <span aria-hidden="true" className="text-muted">◆</span>
      <span className="font-mono font-semibold">{instrument.symbol}</span>
      <span className="text-muted">· {venueLabel(instrument.venue)}</span>
    </span>
  );
}
