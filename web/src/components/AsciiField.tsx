import { useEffect, useRef } from "react";

/**
 * The home page's moving ASCII art: a market as a still basin of water. News lands as a drop, a
 * ripple spreads out and washes into the others (the spillover), and the ticker the news was about
 * flashes where it landed. Moving the pointer across it stirs the water.
 *
 * Drawn on a canvas, one character per cell, by a small 2D wave simulation (each cell's height is
 * the average of its neighbours minus its last height, slowly damped). Taller water uses denser
 * characters. Decorative only: hidden from screen readers, paused when off screen or in a background
 * tab, and a single still frame for people who ask for reduced motion.
 */

const RAMP = " .·:-=+*#%@";
const TICKERS = ["SPX", "NVDA", "MU", "GOOGL", "TSM", "WTI", "USD", "CPI", "FOMC", "AAPL", "AMZN", "XLK", "JPM", "10Y"];
const DAMPING = 0.982;
const FRAME_MS = 1000 / 30;
const DROP_EVERY_MS = 900;
const LABEL_MS = 1800;

interface Label {
  col: number;
  row: number;
  text: string;
  born: number;
}

/** One step of the wave equation on a cols x rows grid (edges stay still). Exported for tests. */
export function waveStep(cur: Float32Array, prev: Float32Array, cols: number, rows: number, damping = DAMPING): void {
  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      const i = r * cols + c;
      const next = (cur[i - 1]! + cur[i + 1]! + cur[i - cols]! + cur[i + cols]!) / 2 - prev[i]!;
      prev[i] = next * damping;
    }
  }
}

/** Water height to a character: calm water is blank, crests use the densest characters. */
export function charFor(height: number): string {
  const v = Math.min(1, Math.abs(height) / 3);
  return RAMP[Math.round(v * (RAMP.length - 1))] ?? " ";
}

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function AsciiField({ className = "", seed = 1 }: { className?: string; seed?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const ink = cssVar("--c-fg", "#141413");
    const accent = cssVar("--c-accent", "#3f6212");
    const pop = cssVar("--c-pop", "#c5ef4a");

    let rnd = seed * 9301 + 49297;
    const random = () => ((rnd = (rnd * 9301 + 49297) % 233280) / 233280);

    let cols = 0;
    let rows = 0;
    let cw = 8;
    let ch = 14;
    let cur = new Float32Array(0);
    let prev = new Float32Array(0);
    const labels: Label[] = [];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = `500 12px ${cssVar("--font-mono", "ui-monospace, monospace")}`;
      ctx.textBaseline = "top";
      cw = Math.max(6, ctx.measureText("M").width);
      ch = 14;
      cols = Math.max(3, Math.floor(width / cw));
      rows = Math.max(3, Math.floor(height / ch));
      cur = new Float32Array(cols * rows);
      prev = new Float32Array(cols * rows);
    };

    const drop = (col: number, row: number, strength: number, label: boolean, now: number) => {
      if (col < 2 || row < 2 || col >= cols - 2 || row >= rows - 2) return;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) cur[(row + dr) * cols + col + dc] = strength * (dr === 0 && dc === 0 ? 1 : 0.5);
      if (label) labels.push({ col, row, text: TICKERS[Math.floor(random() * TICKERS.length)]!, born: now });
    };

    const randomDrop = (now: number) => drop(2 + Math.floor(random() * (cols - 4)), 2 + Math.floor(random() * (rows - 4)), 7 + random() * 5, true, now);

    const draw = (now: number) => {
      const { width, height } = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, width, height);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const h = cur[r * cols + c]!;
          const glyph = charFor(h);
          if (glyph === " ") {
            // The still surface: a faint dot grid, so the basin is visible when calm.
            if (r % 2 === 0 && c % 3 === 0) {
              ctx.globalAlpha = 0.12;
              ctx.fillStyle = ink;
              ctx.fillText("·", c * cw, r * ch);
            }
            continue;
          }
          const v = Math.min(1, Math.abs(h) / 3);
          ctx.globalAlpha = 0.2 + 0.65 * v;
          ctx.fillStyle = h > 0 && v > 0.72 ? accent : ink;
          ctx.fillText(glyph, c * cw, r * ch);
        }
      }
      // Ticker labels where news landed, fading out.
      for (let i = labels.length - 1; i >= 0; i--) {
        const l = labels[i]!;
        const age = (now - l.born) / LABEL_MS;
        if (age >= 1) {
          labels.splice(i, 1);
          continue;
        }
        const x = Math.min((l.col + 1) * cw, width - (l.text.length + 2) * cw);
        const y = Math.max(0, (l.row - 1) * ch);
        ctx.globalAlpha = 1 - age;
        ctx.fillStyle = pop;
        ctx.fillRect(x - 3, y - 1, l.text.length * cw + 6, ch);
        ctx.fillStyle = ink;
        ctx.fillText(l.text, x, y);
      }
      ctx.globalAlpha = 1;
    };

    resize();
    let raf = 0;
    let last = 0;
    let lastDrop = 0;
    let visible = true;

    if (reduce) {
      // One still frame: a few ripples, already spreading.
      for (let k = 0; k < 5; k++) randomDrop(0);
      for (let s = 0; s < 40; s++) {
        waveStep(cur, prev, cols, rows);
        [cur, prev] = [prev, cur];
      }
      draw(LABEL_MS * 2);
      return;
    }

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible || document.visibilityState !== "visible" || now - last < FRAME_MS) return;
      last = now;
      if (now - lastDrop > DROP_EVERY_MS) {
        lastDrop = now;
        randomDrop(now);
      }
      waveStep(cur, prev, cols, rows);
      [cur, prev] = [prev, cur];
      draw(now);
    };
    raf = requestAnimationFrame(loop);

    const onMove = (e: PointerEvent) => {
      const box = canvas.getBoundingClientRect();
      drop(Math.floor((e.clientX - box.left) / cw), Math.floor((e.clientY - box.top) / ch), 3, false, performance.now());
    };
    canvas.addEventListener("pointermove", onMove);
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
    });
    io.observe(canvas);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointermove", onMove);
      ro.disconnect();
      io.disconnect();
    };
  }, [seed]);

  return <canvas ref={ref} aria-hidden="true" className={`block h-full w-full ${className}`} />;
}
