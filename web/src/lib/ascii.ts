import { useEffect, useRef, type RefObject } from "react";

/**
 * A tiny kit for the site's ASCII pictures: a grid of coloured characters, smooth value noise, and a
 * canvas hook that draws a scene at a steady frame rate. Pictures are decorative: the hook pauses
 * when off screen or in a background tab, and draws one still frame for reduced motion.
 */

export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** Smooth value noise in [0, 1]. */
export function noise2(x: number, y: number, seed = 0): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, seed), b = hash(xi + 1, yi, seed);
  const c = hash(xi, yi + 1, seed), d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Fractal noise: several octaves of value noise, in [0, 1]. */
export function fbm(x: number, y: number, octaves = 3, seed = 0): number {
  let sum = 0, amp = 0.5, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2(x * freq, y * freq, seed + i * 17);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/** A seeded random number generator in [0, 1). */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Evenly blend a list of colours into n steps. */
export function gradient(stops: string[], n: number): string[] {
  const rgb = stops.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
  return Array.from({ length: n }, (_, k) => {
    const t = n === 1 ? 0 : (k / (n - 1)) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(t));
    const f = t - i;
    const mix = rgb[i]!.map((c, j) => Math.round(c + (rgb[i + 1]![j]! - c) * f));
    return "#" + mix.map((c) => c.toString(16).padStart(2, "0")).join("");
  });
}

/** A cols x rows grid of characters, each with a colour (a CSS colour string). */
export class Grid {
  ch: string[];
  co: string[];
  constructor(
    public cols: number,
    public rows: number,
  ) {
    this.ch = new Array<string>(cols * rows).fill(" ");
    this.co = new Array<string>(cols * rows).fill("");
  }
  clear(): void {
    this.ch.fill(" ");
    this.co.fill("");
  }
  set(x: number, y: number, ch: string, color: string): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return;
    this.ch[y * this.cols + x] = ch;
    this.co[y * this.cols + x] = color;
  }
  get(x: number, y: number): string {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return " ";
    return this.ch[y * this.cols + x]!;
  }
  text(x: number, y: number, s: string, color: string): void {
    for (let i = 0; i < s.length; i++) this.set(x + i, y, s[i]!, color);
  }
  /** A box w wide and h tall with its top-left at (x, y): rounded or double line. */
  box(x: number, y: number, w: number, h: number, style: "round" | "double", color: string): void {
    const [tl, tr, bl, br, hz, vt] = style === "double" ? ["╔", "╗", "╚", "╝", "═", "║"] : ["╭", "╮", "╰", "╯", "─", "│"];
    for (let i = 1; i < w - 1; i++) {
      this.set(x + i, y, hz, color);
      this.set(x + i, y + h - 1, hz, color);
      for (let j = 1; j < h - 1; j++) this.set(x + i, y + j, " ", color);
    }
    for (let j = 1; j < h - 1; j++) {
      this.set(x, y + j, vt, color);
      this.set(x + w - 1, y + j, vt, color);
    }
    this.set(x, y, tl, color);
    this.set(x + w - 1, y, tr, color);
    this.set(x, y + h - 1, bl, color);
    this.set(x + w - 1, y + h - 1, br, color);
  }
}

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** Draw a grid onto a 2D context, batching characters by colour. */
export function drawGrid(ctx: CanvasRenderingContext2D, g: Grid, cw: number, ch: number, x0 = 0, y0 = 0): void {
  const byColor = new Map<string, number[]>();
  for (let i = 0; i < g.ch.length; i++) {
    if (g.ch[i] === " " || !g.co[i]) continue;
    const list = byColor.get(g.co[i]!);
    if (list) list.push(i);
    else byColor.set(g.co[i]!, [i]);
  }
  for (const [color, cells] of byColor) {
    ctx.fillStyle = color;
    for (const i of cells) ctx.fillText(g.ch[i]!, x0 + (i % g.cols) * cw, y0 + Math.floor(i / g.cols) * ch);
  }
}

export interface Scene {
  /** Fixed grid size (the font scales to fit the width), or omit to fill the canvas at `fontPx`. */
  cols?: number;
  rows?: number;
  fontPx?: number;
  fps?: number;
  /** Time (seconds) for the single frame drawn with reduced motion. */
  stillAt?: number;
  /** Build a scene for a grid size; returns the frame function. */
  make: (cols: number, rows: number) => (t: number) => Grid;
}

/** Run an ASCII scene on a canvas. */
export function useAsciiScene(scene: Scene): RefObject<HTMLCanvasElement | null> {
  const ref = useRef<HTMLCanvasElement>(null);
  const { cols: fixedCols, rows: fixedRows, fontPx = 12, fps = 24, stillAt = 3, make } = scene;

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const family = cssVar("--font-mono", "ui-monospace, Menlo, monospace");
    let cw = 7, chH = 14, x0 = 0, frame: (t: number) => Grid = () => new Grid(1, 1);

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.textBaseline = "top";
      let cols: number, rows: number, size: number;
      if (fixedCols && fixedRows) {
        ctx.font = `500 10px ${family}`;
        const ratio = ctx.measureText("M").width / 10;
        size = Math.min(width / (fixedCols * ratio), height / (fixedRows * 1.25));
        cols = fixedCols;
        rows = fixedRows;
      } else {
        size = fontPx;
        ctx.font = `500 ${size}px ${family}`;
        cols = Math.max(10, Math.floor(width / ctx.measureText("M").width));
        rows = Math.max(8, Math.floor(height / (size * 1.25)));
      }
      ctx.font = `500 ${size}px ${family}`;
      cw = ctx.measureText("M").width;
      chH = size * 1.25;
      x0 = Math.max(0, (width - cols * cw) / 2);
      frame = make(cols, rows);
    };

    const paint = (t: number) => {
      const { width, height } = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, width, height);
      drawGrid(ctx, frame(t), cw, chH, x0, 0);
    };

    resize();
    if (reduce) {
      paint(stillAt);
      return;
    }
    let raf = 0, last = 0, visible = true;
    const start = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible || document.visibilityState !== "visible" || now - last < 1000 / fps) return;
      last = now;
      paint((now - start) / 1000);
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
  }, [fixedCols, fixedRows, fontPx, fps, stillAt, make]);

  return ref;
}
