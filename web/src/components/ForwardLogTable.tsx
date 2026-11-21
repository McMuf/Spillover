import type { ForwardRow } from "../generated/site";
import { claimStat, pct, shortHash } from "../lib/format";

/** Every frozen prediction with its hash, timestamp, status and (once graded) outcome. */
export function ForwardLogTable({ rows, measure = "abnormal_return" }: { rows: ForwardRow[]; measure?: string }) {
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
      <table className="w-full min-w-[46rem] text-left text-sm">
        <caption className="sr-only">Frozen forward predictions</caption>
        <thead className="bg-surface-alt text-xs text-muted">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">Event</th>
            <th scope="col" className="px-3 py-2 font-medium">Frozen at (UTC)</th>
            <th scope="col" className="px-3 py-2 font-medium">Hash</th>
            <th scope="col" className="px-3 py-2 font-medium">Status</th>
            <th scope="col" className="px-3 py-2 font-medium">Outcome</th>
            <th scope="col" className="px-3 py-2 font-medium">Check-ins</th>
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
              <td className="px-3 py-2">
                {/* Descriptive follow-ups at 1 week to 5 years; never part of the grade. */}
                <ul className="flex flex-wrap gap-1" aria-label={`Check-ins for ${r.event_id}`}>
                  {r.checkins.map((c) => (
                    <li key={c.label} className="whitespace-nowrap rounded-full bg-surface-alt px-2 py-0.5 text-[11px]" title={c.value === null ? `Due about ${c.due}` : undefined}>
                      {c.label}: {c.value === null ? <span className="text-muted">due {c.due}</span> : <span className={claimStat(measure, c.value).cls}>{claimStat(measure, c.value).value}</span>}
                    </li>
                  ))}
                </ul>
              </td>
              <td className="px-3 py-2">{r.proof === "present" ? "OpenTimestamps proof" : <span className="text-muted">none yet</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
