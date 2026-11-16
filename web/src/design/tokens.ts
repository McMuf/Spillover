/**
 * Design tokens. Spillover is dark-only: there is one theme and no switcher.
 *
 * Components use semantic names (bg, fg, primary...) through CSS variables, never raw colors.
 * Red and green are reserved for outcomes that already happened (`positive`, `negative`);
 * estimates, backtests and every other number stay neutral.
 */

export type ThemeName = "dark";

export interface ColorTokens {
  bg: string;
  surface: string;
  surfaceAlt: string;
  line: string;
  fg: string;
  muted: string;
  /** Links, progress, chart lines. */
  accent: string;
  onAccent: string;
  /** Filled pill buttons and the active tab. */
  primary: string;
  onPrimary: string;
  /** Realized, favorable outcome only. */
  positive: string;
  /** Realized, unfavorable outcome only. */
  negative: string;
  noticeBg: string;
  noticeFg: string;
}

export const color: Record<ThemeName, ColorTokens> = {
  dark: {
    bg: "#090c12",
    surface: "#11151d",
    surfaceAlt: "#181e2a",
    line: "#222a3a",
    fg: "#f3f6fb",
    muted: "#98a2b5",
    accent: "#8fb2ff",
    onAccent: "#0a0f1a",
    primary: "#1f3d73",
    onPrimary: "#ffffff",
    positive: "#3fd37f",
    negative: "#ff7b59",
    noticeBg: "#2a2410",
    noticeFg: "#f0d58a",
  },
};

export const radius = { card: "22px", pill: "999px" };
export const font = {
  sans: '"Inter Variable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
};

/** Pairs that must meet WCAG AA (4.5:1) for normal text. Checked by a unit test. */
export const textPairs: ReadonlyArray<readonly [keyof ColorTokens, keyof ColorTokens]> = [
  ["fg", "bg"],
  ["fg", "surface"],
  ["fg", "surfaceAlt"],
  ["muted", "bg"],
  ["muted", "surface"],
  ["muted", "surfaceAlt"],
  ["accent", "bg"],
  ["accent", "surface"],
  ["accent", "surfaceAlt"],
  ["onAccent", "accent"],
  ["onPrimary", "primary"],
  ["fg", "primary"],
  ["positive", "surface"],
  ["negative", "surface"],
  ["positive", "surfaceAlt"],
  ["negative", "surfaceAlt"],
  ["noticeFg", "noticeBg"],
];

/** WCAG relative luminance and contrast ratio for #rrggbb colors. */
export function luminance(hex: string): number {
  const channel = (i: number): number => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
