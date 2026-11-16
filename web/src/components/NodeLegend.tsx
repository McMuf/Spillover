import { NODE_TYPES } from "../design/nodes";
import { NodeShape } from "./NodeShape";

/** Always-visible legend. If a shape could mean two things, the design is wrong. */
export function NodeLegend({ compact = false }: { compact?: boolean }) {
  return (
    <section aria-label="Node legend" data-testid="node-legend" className="rounded-xl border border-line bg-surface p-4">
      <h2 className="mb-3 text-sm font-semibold">Node legend</h2>
      <dl className={compact ? "grid gap-2 sm:grid-cols-2" : "grid gap-3 sm:grid-cols-2 lg:grid-cols-3"}>
        {NODE_TYPES.map((t) => (
          <div key={t.key}>
            <dt className="flex items-center gap-2 text-sm font-semibold">
              <NodeShape type={t.key} />
              <span>{t.name}</span>
              <span className="font-mono text-xs font-normal text-muted">{t.tag}</span>
            </dt>
            <dd className="ml-7 text-xs text-muted">{t.means}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-muted">
        Shape and tag name the type; color never does. Green and red appear only on outcomes that already happened.
        Dashed lines are untested or low-sample.
      </p>
    </section>
  );
}
