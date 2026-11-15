import * as Dialog from "@radix-ui/react-dialog";
import cytoscape from "cytoscape";
import { useEffect, useRef, useState } from "react";
import { NODE_BY_KEY } from "../design/nodes";
import { color, type ThemeName } from "../design/tokens";
import type { GraphModel, GNode } from "../lib/graph";
import { NodeShape } from "./NodeShape";

/**
 * Graph of a claim. Secondary to the cards and tables: the node list below is the keyboard and
 * screen-reader path, and selecting a node (here or in the list) opens the same detail sheet.
 */
export default function GraphView({ model, theme, label }: { model: GraphModel; theme: ThemeName; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<GNode | null>(null);
  const byId = useRef(new Map<string, GNode>());

  useEffect(() => {
    byId.current = new Map(model.nodes.map((n) => [n.id, n]));
  }, [model]);

  useEffect(() => {
    const el = ref.current;
    if (!el || model.tooLarge) return;
    const c = color[theme];
    const cy = cytoscape({
      container: el,
      elements: [
        ...model.nodes.map((n) => ({
          data: {
            id: n.id,
            label: `${NODE_BY_KEY[n.type].tag}\n${n.label}`,
            shape: NODE_BY_KEY[n.type].cytoscapeShape,
            outcome: n.outcome ?? "none",
          },
        })),
        ...model.edges.map((e) => ({
          data: { id: e.id, source: e.source, target: e.target, label: e.label ?? "", dashed: e.dashed ? 1 : 0 },
        })),
      ],
      style: [
        {
          selector: "node",
          style: {
            shape: "data(shape)" as unknown as cytoscape.Css.Node["shape"],
            label: "data(label)",
            "text-wrap": "wrap",
            // Labels sit beside the node so edges (which run vertically) never cross them.
            "text-halign": "right",
            "text-valign": "center",
            "text-margin-x": 10,
            "text-justification": "left",
            "font-size": 11,
            color: c.fg,
            "background-color": c.surface,
            "border-width": 2,
            "border-color": c.fg,
            width: 46,
            height: 46,
          },
        },
        // Red and green only for predictions that were already graded.
        { selector: 'node[outcome = "hit"]', style: { "border-color": c.positive, "border-width": 4 } },
        { selector: 'node[outcome = "miss"]', style: { "border-color": c.negative, "border-width": 4 } },
        { selector: "node:selected", style: { "border-color": c.accent, "border-width": 4 } },
        {
          selector: "edge",
          style: {
            width: 2,
            "line-color": c.muted,
            "target-arrow-color": c.muted,
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            label: "data(label)",
            "font-size": 10,
            color: c.fg,
            "text-wrap": "wrap",
            "text-max-width": "190px",
            "text-background-color": c.bg,
            "text-background-opacity": 0.9,
            "text-background-padding": "3px",
          },
        },
        { selector: "edge[dashed = 1]", style: { "line-style": "dashed" } },
      ],
      // Generous spacing keeps the numeric edge label clear of the node labels around it.
      layout: { name: "breadthfirst", directed: true, padding: 24, spacingFactor: 2.1 },
      userZoomingEnabled: false,
      boxSelectionEnabled: false,
    });
    cy.on("tap", "node", (evt) => setSelected(byId.current.get(evt.target.id()) ?? null));
    return () => cy.destroy();
  }, [model, theme]);

  return (
    <div>
      {model.tooLarge ? (
        <p className="rounded-[10px] border border-dashed border-line p-4 text-sm text-muted">
          This view has {model.nodes.length} nodes, more than the 40 a person can read. Use the table below.
        </p>
      ) : (
        <div
          ref={ref}
          role="img"
          aria-label={`${label}. A list of the same nodes follows for keyboard and screen reader use.`}
          className="h-[460px] w-full rounded-[10px] border border-line bg-surface"
          data-testid="graph-canvas"
        />
      )}

      <ul className="mt-3 grid gap-2 sm:grid-cols-2" aria-label="Nodes in this graph">
        {model.nodes.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => setSelected(n)}
              className="flex w-full items-center gap-2 rounded-[10px] border border-line bg-surface px-3 py-2 text-left text-sm hover:bg-surface-alt"
            >
              <NodeShape type={n.type} size={18} />
              <span className="font-mono text-xs text-muted">{NODE_BY_KEY[n.type].tag}</span>
              <span className="truncate">{n.label}</span>
            </button>
          </li>
        ))}
      </ul>

      <Dialog.Root open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
          <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-[14px] border border-line bg-surface p-5 text-fg shadow-lg sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-96 sm:rounded-none sm:rounded-l-[14px]">
            {selected && (
              <>
                <Dialog.Title className="mb-1 flex items-center gap-2 text-lg font-semibold">
                  <NodeShape type={selected.type} />
                  {selected.label}
                </Dialog.Title>
                <Dialog.Description className="mb-4 text-sm text-muted">
                  {NODE_BY_KEY[selected.type].name} ({NODE_BY_KEY[selected.type].tag}):{" "}
                  {NODE_BY_KEY[selected.type].means.toLowerCase()}.
                </Dialog.Description>
                <dl className="space-y-2 text-sm">
                  {selected.rows.map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-xs text-muted">{k}</dt>
                      <dd className="break-words font-mono text-xs">{v}</dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
            <Dialog.Close className="mt-5 rounded-full border border-line px-4 py-1.5 text-sm hover:bg-surface-alt">
              Close
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
