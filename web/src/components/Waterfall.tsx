import { clamp, fbm, gradient, Grid, noise2, rng, useAsciiScene } from "../lib/ascii";

/**
 * The home page's ASCII picture: a waterfall spilling over a cliff edge between dark, mossy rock
 * into a churning pool, with mist and spray rising. Spillover, drawn literally. Coloured for the
 * dark theme: near-black rock, olive moss, silver water with a lime tint at its brightest.
 */

const ROCK = gradient(["#050506", "#0d0e10", "#17191c", "#23262a", "#33373b"], 10);
const MOSS = gradient(["#141b0a", "#213010", "#324816", "#48661e"], 6);
const WATER = gradient(["#202326", "#3a3f43", "#5e666a", "#8d969a", "#bcc5c2", "#e2edcf"], 14);
const POOL = gradient(["#020303", "#07090a", "#0d1112", "#161b1c"], 8);
const MIST = gradient(["#5a6062", "#a9b0aa", "#f4ffe6"], 3);
const SKY = gradient(["#0a0b0c", "#121416"], 3);

/** Build the scene for a grid size (exported for tests). */
export function makeWaterfall(cols: number, rows: number): (t: number) => Grid {
  const g = new Grid(cols, rows);
  const pool = Math.round(rows * 0.76);
  const cx = Math.floor(cols / 2);
  const half = Math.max(5, Math.round(cols * 0.144));
  const r = rng(6);
  const spray = Array.from({ length: Math.round(cols * 1.2) }, () => [(r() - 0.5) * 2, r(), 0.6 + r() * 0.9, 3 + r() * 9] as const);
  const leftEdge = (y: number) => cx - half + Math.floor(fbm(y * 0.15, 1, 2, 3) * 4) - (y < 4 ? 3 - y : 0);
  const rightEdge = (y: number) => cx + half - Math.floor(fbm(y * 0.15, 5, 2, 3) * 4) + (y < 4 ? 3 - y : 0);

  return (t: number) => {
    g.clear();
    // Rock and moss.
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const n = fbm(x * 0.12, y * 0.25, 4, 2);
        const crack = noise2(x * 0.5, y * 0.3, 7) > 0.78;
        const v = clamp(0.2 + n * 0.7 - Math.abs(x - cx) * 0.004);
        const mossy = fbm(x * 0.1, y * 0.2, 3, 9) > 0.58;
        if (mossy && !crack) g.set(x, y, n > 0.5 ? "▓" : "%", MOSS[Math.min(5, Math.floor(v * 6))]!);
        else g.set(x, y, crack ? "░" : n > 0.6 ? "▓" : "▒", ROCK[clamp(Math.floor(v * 10) - (crack ? 2 : 0), 0, 9)]!);
      }
    // A sliver of night sky above the lip.
    for (let y = 0; y < 3; y++) for (let x = cx - half - 5; x <= cx + half + 5; x++) g.set(x, y, "▒", SKY[y % 3]!);
    // The falling water: streaks moving down.
    for (let y = 0; y < pool + 1; y++) {
      const L = leftEdge(y), R = rightEdge(y);
      for (let x = L; x <= R; x++) {
        const a = (x - L) / Math.max(1, R - L);
        const streak = fbm(x * 0.55, y * 0.12 - t * 2.6, 3, 4);
        const fast = noise2(x * 1.1, y * 0.3 - t * 6, 8);
        const edge = Math.min(a, 1 - a);
        const v = clamp(0.22 + streak * 0.55 + fast * 0.2 + edge * 0.35 + (y / pool) * 0.12);
        const ch = v > 0.92 ? "█" : fast > 0.55 ? "│" : v > 0.74 ? "▓" : v > 0.56 ? "▒" : v > 0.4 ? "|" : "¦";
        g.set(x, y, ch, WATER[Math.min(13, Math.floor(v * 14))]!);
      }
      if (y === 2) for (let x = L; x <= R; x++) g.set(x, y, "▀", WATER[12]!);
    }
    // The pool, with foam where the water lands.
    for (let y = pool; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const d = Math.hypot((x - cx) / 2.5, (y - pool) * 1.5);
        const w = fbm(x * 0.1 + Math.sign(x - cx) * -t * 0.6, y * 0.6, 3, 5);
        const foam = clamp(1 - d / 14 + (w - 0.5) * 0.8);
        if (foam > 0.35) g.set(x, y, foam > 0.75 ? "█" : foam > 0.55 ? "▓" : "▒", MIST[Math.min(2, Math.floor((foam - 0.35) * 5))]!);
        else g.set(x, y, w > 0.58 ? "≈" : w > 0.45 ? "~" : "▓", POOL[clamp(Math.floor((w + (rows - y) * 0.02) * 8), 0, 7)]!);
      }
    // Drifting mist over the landing.
    for (let y = pool - 7; y < pool + 3; y++)
      for (let x = cx - half * 2; x <= cx + half * 2; x++) {
        const m = fbm(x * 0.12 - t * 0.3, y * 0.3 + t * 0.4, 3, 6);
        const d = Math.hypot((x - cx) / 3, y - pool);
        if (m > 0.5 + d * 0.035) g.set(x, y, m > 0.7 ? "▒" : "░", MIST[m > 0.65 ? 2 : 1]!);
      }
    // Spray thrown up in arcs.
    for (const [ox, ph, sp, h] of spray) {
      const a = (t * sp + ph) % 1;
      g.set(cx + ox * half + ox * a * half * 1.6, pool - Math.sin(a * Math.PI) * h * 0.8, a < 0.5 ? "▒" : "░", MIST[2]!);
    }
    return g;
  };
}

const SCENE = { fontPx: 9, fps: 24, make: makeWaterfall };

export function Waterfall({ className = "" }: { className?: string }) {
  const ref = useAsciiScene(SCENE);
  return <canvas ref={ref} aria-hidden="true" className={`block h-full w-full ${className}`} />;
}
