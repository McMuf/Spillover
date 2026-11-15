/**
 * The node language. One rule: if a shape could mean two things, the design is wrong.
 * Six node types, each with a fixed shape, a three-letter tag and a plain-English definition.
 * Colors are deliberately NOT used to distinguish types, so color stays reserved for outcomes.
 */

export type NodeTypeKey = "event" | "entity" | "instrument" | "factor" | "condition" | "prediction";

export interface NodeType {
  key: NodeTypeKey;
  tag: "EVT" | "ENT" | "INS" | "FAC" | "CON" | "PRD";
  name: string;
  glyph: string;
  cytoscapeShape: "rectangle" | "ellipse" | "diamond" | "hexagon" | "triangle" | "star";
  means: string;
  mustHave: string;
}

export const NODE_TYPES: readonly NodeType[] = [
  { key: "event", tag: "EVT", name: "Event", glyph: "■", cytoscapeShape: "rectangle",
    means: "One dated, sourced thing that happened", mustHave: "Timestamp, source" },
  { key: "entity", tag: "ENT", name: "Entity", glyph: "●", cytoscapeShape: "ellipse",
    means: "A company, person, country or institution", mustHave: "Stable ID, name" },
  { key: "instrument", tag: "INS", name: "Instrument", glyph: "◆", cytoscapeShape: "diamond",
    means: "A thing you can look up a price for, labeled with where it trades", mustHave: "Venue, symbol" },
  { key: "factor", tag: "FAC", name: "Factor", glyph: "⬡", cytoscapeShape: "hexagon",
    means: "A broad driver the engine controls for", mustHave: "Series definition" },
  { key: "condition", tag: "CON", name: "Condition", glyph: "▲", cytoscapeShape: "triangle",
    means: "A rule that must hold for the claim to apply", mustHave: "Machine-checkable rule" },
  { key: "prediction", tag: "PRD", name: "Prediction", glyph: "★", cytoscapeShape: "star",
    means: "A frozen, hashed forward call", mustHave: "Hash, timestamp, claim version" },
];

export const NODE_BY_KEY: Record<NodeTypeKey, NodeType> = Object.fromEntries(
  NODE_TYPES.map((t) => [t.key, t]),
) as Record<NodeTypeKey, NodeType>;
