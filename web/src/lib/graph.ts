import type { SiteClaim, SiteData } from "../generated/site";
import type { NodeTypeKey } from "../design/nodes";
import { claimVersion, intervalText, pct, venueLabel, windowLabel } from "./format";

export const MAX_GRAPH_NODES = 40;

export interface GNode {
  id: string;
  type: NodeTypeKey;
  label: string;
  sub?: string;
  /** Hit or miss for graded predictions: the only place red and green may appear. */
  outcome?: "hit" | "miss" | "open";
  rows: Array<[string, string]>;
}

export interface GEdge {
  id: string;
  source: string;
  target: string;
  kind: "about" | "applies" | "spillover" | "controls" | "predicts";
  /** Numeric edges carry all five: estimate, interval, sample size, window, as-of. */
  label?: string;
  dashed: boolean;
}

export interface GraphModel {
  nodes: GNode[];
  edges: GEdge[];
  /** More than MAX_GRAPH_NODES: the UI falls back to a table. */
  tooLarge: boolean;
}

/** The five things every numeric edge must show, in one line. */
export function edgeLabel(c: SiteClaim): string | undefined {
  const b = c.backtest;
  if (!b) return undefined;
  return [
    `${pct(b.mean)} ${intervalText(b.ci_lo, b.ci_hi)}`,
    `n=${b.n_effective}`,
    windowLabel(b.window_days),
    `as of ${b.as_of}`,
    "backtest",
  ].join(" · ");
}

export function buildGraph(claims: SiteClaim[], site: SiteData): GraphModel {
  const nodes = new Map<string, GNode>();
  const edges: GEdge[] = [];
  const put = (n: GNode) => {
    if (!nodes.has(n.id)) nodes.set(n.id, n);
  };

  for (const c of claims) {
    const cl = c.claim;
    const ins = `ins:${cl.instrument.venue}:${cl.instrument.symbol}`;
    put({
      id: ins,
      type: "instrument",
      label: cl.instrument.symbol,
      sub: venueLabel(cl.instrument.venue),
      rows: [["Symbol", cl.instrument.symbol], ["Venue", venueLabel(cl.instrument.venue)]],
    });

    const latest = site.events
      .filter((e) => c.event_ids.includes(e.event_id))
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    const evtId = latest ? `evt:${latest.event_id}` : `evt:none:${cl.id}`;
    if (latest) {
      put({
        id: evtId,
        type: "event",
        label: latest.date,
        sub: latest.event_type,
        rows: [
          ["Event", latest.event_id],
          ["Type", latest.event_type],
          ["Date", latest.date],
          ["Source", latest.source],
          ["Shown", `most recent of ${c.event_ids.length} matching event(s)`],
        ],
      });
    }

    for (const ent of cl.trigger_entities) {
      put({ id: `ent:${ent}`, type: "entity", label: ent, rows: [["ID", ent]] });
      if (latest) edges.push({ id: `${ent}>${evtId}`, source: `ent:${ent}`, target: evtId, kind: "about", dashed: false });
    }

    if (cl.baseline === "factor_only") {
      const fac = `fac:${cl.factor}`;
      put({ id: fac, type: "factor", label: cl.factor, sub: "controlled for", rows: [["Series", cl.factor], ["Role", "the engine controls for this driver"]] });
      edges.push({ id: `${fac}>${ins}:${cl.id}`, source: fac, target: ins, kind: "controls", dashed: false });
    }

    const con = `con:${cl.id}`;
    put({
      id: con,
      type: "condition",
      label: "No scheduled event in window",
      rows: [["Rule", "Events whose window overlaps another scheduled event are excluded (scoring rule 5)"]],
    });
    if (latest) edges.push({ id: `${con}>${evtId}`, source: con, target: evtId, kind: "applies", dashed: false });

    if (latest) {
      const lowSample = !c.backtest || c.backtest.n_effective < cl.success.min_forward_events;
      edges.push({
        id: `${evtId}>${ins}:${cl.id}`,
        source: evtId,
        target: ins,
        kind: "spillover",
        label: edgeLabel(c),
        dashed: lowSample,
      });
    }

    for (const f of c.forward_log.slice(-3)) {
      const pid = `prd:${cl.id}:${f.event_id}`;
      put({
        id: pid,
        type: "prediction",
        label: f.event_date,
        sub: f.status,
        outcome: f.status === "graded" ? (f.hit ? "hit" : "miss") : "open",
        rows: [["Claim", `${cl.id} (v${claimVersion(cl.id)})`], ["Hash", f.sha256], ["Frozen", f.created_at], ["Status", f.status]],
      });
      edges.push({ id: `${pid}>${ins}`, source: pid, target: ins, kind: "predicts", dashed: false });
    }
  }

  const list = [...nodes.values()];
  return { nodes: list, edges, tooLarge: list.length > MAX_GRAPH_NODES };
}
