import type { ForwardRow } from "../generated/site";
import { pct, shortHash } from "../lib/format";

/** Every frozen prediction with its hash, timestamp, status and (once graded) outcome. */
export function ForwardLogTable({ rows }: { rows: ForwardRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">
        No frozen predictions yet. A claim collects forward evidence only after it is registered, and only for events
        that happen after registration. Nothing here is backfilled.
      </p>
    );
  }
  return (
    <div tabIndex={0} role="region" aria-label="Frozen forward predictions (scrollable)" className="overflow-x-auto rounded-2xl bg-surface">
      <table className="w-full min-w-[34rem] text-left text-sm">
        <caption className="sr-only">Frozen forward predictions</caption>
        <thead className="bg-surface-alt text-xs text-muted">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">Event</th>
            <th scope="col" className="px-3 py-2 font-medium">Frozen at (UTC)</th>
            <th scope="col" className="px-3 py-2 font-medium">Hash</th>
            <th scope="col" className="px-3 py-2 font-medium">Status</th>
            <th scope="col" className="px-3 py-2 font-medium">Outcome</th>
            <th scope="col" className="px-3 py-2 font-medium">Timestamp proof</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.sha256} className="border-t border-line">
              <td className="px-3 py-2 font-mono text-xs">{r.event_id}</td>
              <td className="px-3 py-2">{r.created_at.replace("T", " ").replace(/\+00:00$|Z$/, "")}</td>
              <td className="px-3 py-2 font-mono text-xs" title={r.sha256}>{shortHash(r.sha256)}…</td>
              <td className="px-3 py-2 capitalize">{r.status}</td>
              <td className="px-3 py-2">
                {r.status !== "graded" || r.hit === null ? (
                  <span className="text-muted">pending</span>
                ) : (
                  // Realized outcome: the only place green and red are allowed in this table.
                  <span className={r.hit ? "font-semibold text-positive" : "font-semibold text-negative"}>
                    {r.hit ? "✓ hit" : "✕ miss"} <span className="font-normal">({pct(r.value)})</span>
                  </span>
                )}
              </td>
              <td className="px-3 py-2">{r.proof === "present" ? "OpenTimestamps proof" : <span className="text-muted">none yet</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
