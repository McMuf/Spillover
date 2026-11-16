/**
 * Design tokens. Spillover is dark-only: there is one theme and no switcher.
 *
 * Components use semantic names (bg, fg, primary...) through CSS variables, never raw colors.
 * Red and green are reserved for outcomes that already happened (`positive`, `negative`);
 * estimates, backtests and every other number stay neutral.
 */

export type ThemeName = "dark";

export interface ColorTokens {
  /** Page background. */
  bg: string;
  surface: string;
  surfaceAlt: string;
  line: string;
  fg: string;
  muted: string;
  /** Links, progress, chart lines. */
  accent: string;
  onAccent: string;
  /** Filled pill buttons and the active filter. */
  primary: string;
  onPrimary: string;
  /** Realized, favorable outcome only. */
  positive: string;
  /** Realized, unfavorable outcome only. */
  negative: string;
  noticeBg: string;
  noticeFg: string;
  /** Decorative category hues for chips, tags and card art. They never mean good or bad. */
  catBlue: string;
  catPurple: string;
  catOrange: string;
  catCyan: string;
  catPink: string;
  catYellow: string;
}

/**
 * Palette after TradingView's dark theme (blue #2962FF, slate surfaces, soft grays) on a black page.
 */
export const color: Record<ThemeName, ColorTokens> = {
  dark: {
    bg: "#000000",
    surface: "#131722",
    surfaceAlt: "#1e222d",
    line: "#2a2e39",
    fg: "#e0e3eb",
    muted: "#9598a1",
    accent: "#7aa2ff",
    onAccent: "#0b0e14",
    primary: "#2962ff",
    onPrimary: "#ffffff",
    positive: "#2ebd85",
    negative: "#f7525f",
    noticeBg: "#2a2410",
    noticeFg: "#f0d58a",
    catBlue: "#5c8dff",
    catPurple: "#b388ff",
    catOrange: "#ffa94d",
    catCyan: "#4dd0e1",
    catPink: "#ff7aa8",
    catYellow: "#ffd54f",
  },
};

export const CATEGORY_HUES = ["catBlue", "catPurple", "catOrange", "catCyan", "catPink", "catYellow"] as const;
export type CategoryHue = (typeof CATEGORY_HUES)[number];

export const radius = { card: "12px", pill: "999px" };
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
  ["positive", "surface"],
  ["negative", "surface"],
  ["positive", "surfaceAlt"],
  ["negative", "surfaceAlt"],
  ["noticeFg", "noticeBg"],
  ...CATEGORY_HUES.flatMap((h) => [[h, "surface"] as const, [h, "surfaceAlt"] as const]),
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
