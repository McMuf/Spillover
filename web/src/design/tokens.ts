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
  /** Cards and panels. */
  surface: string;
  /** Inputs, chips and raised areas inside a card. */
  surfaceAlt: string;
  /** Hairline dividers. */
  line: string;
  fg: string;
  muted: string;
  /** The single accent: active tab, highlighted names, links, chart lines, the active filter. */
  accent: string;
  onAccent: string;
  /** Main call-to-action buttons. */
  primary: string;
  onPrimary: string;
  /** Realized, favorable outcome only. */
  positive: string;
  /** Realized, unfavorable outcome only. */
  negative: string;
  noticeBg: string;
  noticeFg: string;
}

/**
 * Black page, flat near-black surfaces, one lavender-blue accent. Hierarchy comes from type and
 * spacing, not from color, gradients or outlines.
 */
export const color: Record<ThemeName, ColorTokens> = {
  dark: {
    bg: "#000000",
    surface: "#111111",
    surfaceAlt: "#1b1b1b",
    line: "#262626",
    fg: "#f5f5f5",
    muted: "#8e8e8e",
    accent: "#9aabff",
    onAccent: "#0a0a0a",
    primary: "#f5f5f5",
    onPrimary: "#0a0a0a",
    positive: "#3ecf8e",
    negative: "#ff6b4a",
    noticeBg: "#111111",
    noticeFg: "#c9c9c9",
  },
};

export const radius = { card: "16px", pill: "999px" };
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
