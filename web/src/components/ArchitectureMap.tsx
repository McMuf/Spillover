import { fbm, Grid, useAsciiScene } from "../lib/ascii";

/**
 * An animated map of Spillover's pipeline: inputs and claims flow into the engine, which writes the
 * ledger and outcomes to Git, which the website reads. Packets move along every link, coloured by
 * what they carry. Decorative; the page lists the same steps in text.
 */

const C = {
  text: "#ededea",
  muted: "#a3a49d",
  link: "#4a4d53",
  rule: "#33353a",
  event: "#c5ef4a",
  price: "#8ecae6",
  claim: "#ffffff",
  prediction: "#f2cc60",
  grade: "#c4b5fd",
  input: "#8a8d86",
};

type Node = { x: number; y: number; w: number; label: string; sub: string; color: string; double?: boolean };

export const COLS = 104;
export const ROWS = 24;

export const NODES: Record<string, Node> = {
  calendars: { x: 1, y: 1, w: 15, label: "Calendars", sub: "Fed, CPI, jobs", color: C.input },
  sec: { x: 1, y: 6, w: 15, label: "SEC 8-K", sub: "company filings", color: C.input },
  headlines: { x: 1, y: 11, w: 15, label: "Headlines", sub: "GDELT, labeled", color: C.input },
  prices: { x: 1, y: 16, w: 15, label: "Prices", sub: "FRED, Tiingo", color: C.input },
  claims: { x: 24, y: 1, w: 16, label: "Claims", sub: "YAML via PR", color: C.claim },
  events: { x: 24, y: 6, w: 16, label: "Event store", sub: "events/", color: C.event },
  cache: { x: 24, y: 16, w: 16, label: "Price cache", sub: "returns only", color: C.price },
  engine: { x: 47, y: 6, w: 17, label: "Event study", sub: "market model, CAR", color: C.event },
  ledger: { x: 70, y: 1, w: 14, label: "Ledger", sub: "hashed, .ots", color: C.prediction, double: true },
  outcomes: { x: 70, y: 11, w: 14, label: "Outcomes", sub: "append-only", color: C.grade, double: true },
  site: { x: 89, y: 6, w: 13, label: "Website", sub: "GitHub Pages", color: C.price },
};

/** Expand corner points into every cell along an orthogonal path. */
export function cellsOf(pts: [number, number][]): [number, number][] {
  const out: [number, number][] = [pts[0]!];
  for (let i = 1; i < pts.length; i++) {
    let [x, y] = out[out.length - 1]!;
    const [tx, ty] = pts[i]!;
    while (x !== tx || y !== ty) {
      x += Math.sign(tx - x);
      y += Math.sign(ty - y);
      out.push([x, y]);
    }
  }
  return out;
}

export const EDGES: { path: [number, number][]; color: string; rate: number }[] = [
  { path: cellsOf([[16, 2], [19, 2], [19, 7], [23, 7]]), color: C.event, rate: 0.5 },
  { path: cellsOf([[16, 7], [23, 7]]), color: C.event, rate: 0.6 },
  { path: cellsOf([[16, 12], [20, 12], [20, 7], [23, 7]]), color: C.event, rate: 1.2 },
  { path: cellsOf([[16, 17], [23, 17]]), color: C.price, rate: 1.6 },
  { path: cellsOf([[40, 2], [43, 2], [43, 7], [46, 7]]), color: C.claim, rate: 0.3 },
  { path: cellsOf([[40, 7], [46, 7]]), color: C.event, rate: 1 },
  { path: cellsOf([[40, 17], [44, 17], [44, 7], [46, 7]]), color: C.price, rate: 1.4 },
  { path: cellsOf([[64, 7], [67, 7], [67, 2], [69, 2]]), color: C.prediction, rate: 0.8 },
  { path: cellsOf([[64, 7], [67, 7], [67, 12], [69, 12]]), color: C.grade, rate: 0.5 },
  { path: cellsOf([[84, 2], [86, 2], [86, 7], [88, 7]]), color: C.prediction, rate: 0.8 },
  { path: cellsOf([[84, 12], [86, 12], [86, 7], [88, 7]]), color: C.grade, rate: 0.5 },
];

// Which neighbours each link cell connects to, turned into one box-drawing character.
const N = 1, E = 2, S = 4, W = 8;
const LINE: Record<number, string> = {
  [E]: "─", [W]: "─", [E | W]: "─", [N]: "│", [S]: "│", [N | S]: "│",
  [S | E]: "╭", [S | W]: "╮", [N | E]: "╰", [N | W]: "╯",
  [N | S | E]: "├", [N | S | W]: "┤", [E | W | S]: "┬", [E | W | N]: "┴", [N | E | S | W]: "┼",
};

function linkChars(): Map<number, string> {
  const dirs = new Map<number, number>();
  const ends = new Set<number>();
  const key = (x: number, y: number) => y * COLS + x;
  const add = (x: number, y: number, d: number) => dirs.set(key(x, y), (dirs.get(key(x, y)) ?? 0) | d);
  for (const { path } of EDGES) {
    for (let i = 1; i < path.length; i++) {
      const [ax, ay] = path[i - 1]!, [bx, by] = path[i]!;
      const d = bx > ax ? E : bx < ax ? W : by > ay ? S : N;
      add(ax, ay, d);
      add(bx, by, { [E]: W, [W]: E, [N]: S, [S]: N }[d]!);
    }
    const [ex, ey] = path[path.length - 1]!;
    ends.add(key(ex, ey));
  }
  const out = new Map<number, string>();
  for (const [k, d] of dirs) out.set(k, ends.has(k) ? "▸" : (LINE[d] ?? "┼"));
  return out;
}

export function makeArchitectureMap(): (t: number) => Grid {
  const g = new Grid(COLS, ROWS);
  const links = linkChars();
  return (t: number) => {
    g.clear();
    for (const [k, ch] of links) g.set(k % COLS, Math.floor(k / COLS), ch, C.link);
    // Packets travelling along each link, in bursts.
    EDGES.forEach(({ path, color, rate }, e) => {
      const gap = Math.max(3, Math.round(6 / rate));
      const off = Math.floor(t * 12 + e * 3.7);
      for (let k = off % gap; k < path.length - 1; k += gap) {
        if (fbm(t * 0.7 + k * 0.05, e * 3, 2, 5) < 0.32) continue;
        g.set(path[k]![0], path[k]![1], "●", color);
        if (k > 0) g.set(path[k - 1]![0], path[k - 1]![1], "•", color);
      }
    });
    for (const n of Object.values(NODES)) {
      g.box(n.x, n.y, n.w, 3, n.double ? "double" : "round", n.color);
      g.text(n.x + 2, n.y + 1, n.label, C.text);
      g.set(n.x + n.w - 2, n.y + 1, Math.sin(t * 3 + n.x) > 0 ? "●" : "○", n.color);
      g.text(n.x + 1, n.y + 3, n.sub, C.muted);
    }
    g.text(1, 0, "inputs", C.muted);
    g.text(47, 4, "engine", C.muted);
    g.text(70, 0, "stored in Git", C.muted);
    g.text(89, 4, "what you see", C.muted);
    for (let x = 0; x < COLS; x++) g.set(x, ROWS - 3, "─", C.rule);
    const legend: [string, string][] = [["event", C.event], ["price", C.price], ["claim", C.claim], ["prediction", C.prediction], ["grade", C.grade]];
    let x = 1;
    for (const [label, color] of legend) {
      g.set(x, ROWS - 2, "●", color);
      g.text(x + 2, ROWS - 2, label, C.muted);
      x += label.length + 6;
    }
    g.text(COLS - 31, ROWS - 2, "scheduled on GitHub Actions", C.muted);
    return g;
  };
}

const SCENE = { cols: COLS, rows: ROWS, fps: 20, make: makeArchitectureMap };

export function ArchitectureMap() {
  const ref = useAsciiScene(SCENE);
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px]" style={{ aspectRatio: `${(COLS * 0.6) / (ROWS * 1.25)}` }}>
        <canvas ref={ref} aria-hidden="true" className="block h-full w-full" />
      </div>
    </div>
  );
}
