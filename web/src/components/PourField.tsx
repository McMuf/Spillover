import { useEffect, useRef } from "react";

/**
 * The home page's ASCII art: a glass being filled by a steady pour of stock ticks until it spills
 * over. Every falling character is one tick of a random price walk, green when the price went up
 * and red when it went down, and the stream sways with the price so the pour draws a chart. Once
 * the glass is full the ticks run over the rim and pool on the table: the spillover.
 *
 * A small falling-liquid simulation on a grid of characters. Decorative only: hidden from screen
 * readers, paused off screen or in a background tab, and one still frame (already overflowing) for
 * people who ask for reduced motion.
 */

export const EMPTY = 0;
export const WALL = 1;
export const UP = 2;
export const DOWN = 3;

const UP_CHARS = ["/", "^", "+"];
const DOWN_CHARS = ["\\", "v", "-"];
const FRAME_MS = 1000 / 30;
/** Spilled ticks on the table soak away at this rate per step, so the pool never floods the canvas. */
const DRAIN = 0.04;
/** How far along a row a tick looks for somewhere to fall. */
const FLOW = 5;

export interface Glass {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface Pour {
  cols: number;
  rows: number;
  cells: Uint8Array;
  glyph: Uint8Array;
  glass: Glass;
  step: () => void;
  /** Where the stream enters this step (for tests). */
  spout: () => number;
}

/** A glass in the middle of a cols x rows grid, with a table along the bottom row. */
export function createPour(cols: number, rows: number, seed = 7): Pour {
  const cells = new Uint8Array(cols * rows);
  const glyph = new Uint8Array(cols * rows);
  let rnd = seed * 9301 + 49297;
  const random = () => (rnd = (rnd * 9301 + 49297) % 233280) / 233280;

  // A short, wide glass, so it fills in a few seconds and the overflow is the main event.
  const inner = Math.max(6, Math.min(22, Math.round(cols * 0.26)));
  const height = Math.max(4, Math.min(9, Math.round(rows * 0.34)));
  const left = Math.floor((cols - inner) / 2) - 1;
  const right = left + inner + 1;
  const bottom = rows - 2;
  const top = bottom - height;
  const glass: Glass = { left, right, top, bottom };
  const at = (c: number, r: number) => r * cols + c;

  // The glass: two walls and a base. The table (last row) is solid too.
  for (let r = top; r <= bottom; r++) {
    cells[at(left, r)] = WALL;
    cells[at(right, r)] = WALL;
  }
  for (let c = left; c <= right; c++) cells[at(c, bottom)] = WALL;
  for (let c = 0; c < cols; c++) cells[at(c, rows - 1)] = WALL;

  let price = 0;
  let sway = 0;
  const center = Math.floor((left + right) / 2);
  const reach = Math.max(1, Math.floor(inner / 2) - 2);

  const move = (from: number, to: number) => {
    cells[to] = cells[from]!;
    glyph[to] = glyph[from]!;
    cells[from] = EMPTY;
  };

  const step = () => {
    // A new tick enters at the top: up or down from the last price.
    const delta = random() - 0.5;
    price += delta;
    sway = Math.max(-reach, Math.min(reach, sway + Math.sign(delta) * (random() < 0.5 ? 1 : 0)));
    const col = center + sway;
    if (cells[at(col, 0)] === EMPTY) {
      const up = delta >= 0;
      cells[at(col, 0)] = up ? UP : DOWN;
      glyph[at(col, 0)] = Math.floor(random() * 3);
    }

    // Bottom-up so each tick moves at most once per step; alternate the sweep direction.
    const ltr = random() < 0.5;
    for (let r = rows - 2; r >= 0; r--) {
      for (let k = 0; k < cols; k++) {
        const c = ltr ? k : cols - 1 - k;
        const i = at(c, r);
        const kind = cells[i]!;
        if (kind !== UP && kind !== DOWN) continue;
        // On the table outside the glass: run away from the glass, soak away, and fall off the edges.
        if (r === rows - 2 && (c < left || c > right)) {
          if (random() < DRAIN) {
            cells[i] = EMPTY;
            continue;
          }
          const out = c < left ? c - 1 : c + 1;
          if (out < 0 || out >= cols) cells[i] = EMPTY;
          else if (cells[at(out, r)] === EMPTY) move(i, at(out, r));
          continue;
        }
        const below = at(c, r + 1);
        if (cells[below] === EMPTY) {
          move(i, below);
          continue;
        }
        // Liquid: look a few cells along the row, either way, for a place to fall. This levels the
        // surface quickly, and it is what carries ticks over the rim once the glass is full.
        const first = random() < 0.5 ? -1 : 1;
        let moved = false;
        for (const d of [first, -first]) {
          for (let k = 1; k <= FLOW && !moved; k++) {
            const nc = c + d * k;
            if (nc < 0 || nc >= cols) {
              cells[i] = EMPTY; // ran off the side of the picture
              moved = true;
              break;
            }
            if (cells[at(nc, r)] !== EMPTY) break;
            if (cells[at(nc, r + 1)] === EMPTY) {
              move(i, at(nc, r + 1));
              moved = true;
            }
          }
          if (moved) break;
        }
        if (moved) continue;
        // Nowhere to fall: drift one cell sideways, so the surface keeps moving like a liquid.
        const nc = c + first;
        if (nc >= 0 && nc < cols && cells[at(nc, r)] === EMPTY && random() < 0.5) move(i, at(nc, r));
      }
    }
  };

  return { cols, rows, cells, glyph, glass, step, spout: () => center + sway };
}

/** The character for a cell: chart strokes for ticks, the glass drawn in ASCII. */
export function charAt(p: Pour, c: number, r: number): string {
  const i = r * p.cols + c;
  const kind = p.cells[i];
  if (kind === UP) return UP_CHARS[p.glyph[i]!] ?? "/";
  if (kind === DOWN) return DOWN_CHARS[p.glyph[i]!] ?? "\\";
  if (kind === WALL) {
    const g = p.glass;
    if (r === p.rows - 1) return "_";
    if (r === g.bottom) return c === g.left ? "\\" : c === g.right ? "/" : "_";
    return "|";
  }
  return " ";
}

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function PourField({ className = "", seed = 7 }: { className?: string; seed?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const ink = cssVar("--c-fg", "#141413");
    const up = cssVar("--c-positive", "#13703a");
    const down = cssVar("--c-negative", "#b4232a");

    let cw = 8;
    const ch = 15;
    let pour = createPour(3, 3, seed);

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = `600 13px ${cssVar("--font-mono", "ui-monospace, monospace")}`;
      ctx.textBaseline = "top";
      cw = Math.max(6, ctx.measureText("M").width);
      pour = createPour(Math.max(12, Math.floor(width / cw)), Math.max(10, Math.floor(height / ch)), seed);
    };

    const draw = () => {
      const { width, height } = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, width, height);
      const xOff = Math.floor((width - pour.cols * cw) / 2);
      for (let r = 0; r < pour.rows; r++) {
        for (let c = 0; c < pour.cols; c++) {
          const kind = pour.cells[r * pour.cols + c];
          if (kind === EMPTY) continue;
          ctx.fillStyle = kind === UP ? up : kind === DOWN ? down : ink;
          ctx.globalAlpha = kind === WALL ? (r === pour.rows - 1 ? 0.35 : 0.8) : 0.95;
          ctx.fillText(charAt(pour, c, r), xOff + c * cw, r * ch);
        }
      }
      ctx.globalAlpha = 1;
    };

    resize();
    if (reduce) {
      // One still frame, already overflowing.
      for (let s = 0; s < 900; s++) pour.step();
      draw();
      return;
    }

    let raf = 0;
    let last = 0;
    let visible = true;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible || document.visibilityState !== "visible" || now - last < FRAME_MS) return;
      last = now;
      pour.step();
      draw();
    };
    raf = requestAnimationFrame(loop);
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
    });
    io.observe(canvas);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, [seed]);

  return <canvas ref={ref} aria-hidden="true" className={`block h-full w-full ${className}`} />;
}
