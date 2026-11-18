/**
 * Design tokens. Spillover has one light theme, tinted lavender, and no switcher.
 *
 * Components use semantic names (bg, fg, accent...) through CSS variables, never raw colors.
 * Green and red mean direction (up and down) and nothing else; the brand color (violet, with a
 * lavender-to-peach wash) carries identity: links, focus, active states, neutral charts, hero bands.
 */

export type ThemeName = "light";

export interface ColorTokens {
  /** Page background: near-white with a lavender tint. */
  bg: string;
  /** Panels and raised areas (lavender). */
  surface: string;
  /** Inputs, chips and raised areas inside a panel. */
  surfaceAlt: string;
  /** Hairline dividers. */
  line: string;
  /** Text: a plum-black ink. */
  fg: string;
  muted: string;
  /** The brand color (violet): links, focus, active states, neutral chart lines, Proposed status. */
  accent: string;
  onAccent: string;
  /** A soft lavender fill for active items, with `accent` or `fg` text on it. */
  accentSoft: string;
  /** Main call-to-action buttons: ink pills, as on most finance sites. */
  primary: string;
  onPrimary: string;
  /** Up: a market number above zero, or a graded hit. */
  positive: string;
  /** Down: a market number below zero, or a graded miss. */
  negative: string;
  noticeBg: string;
  noticeFg: string;
  /** The brand wash, top to bottom: lavender, lilac, peach (a sky at dawn over the mountains). */
  washFrom: string;
  washVia: string;
  washTo: string;
}

/**
 * Lavender page, plum ink, violet brand. Green and red are darkened so numbers stay readable on the
 * light tints; every colored number also carries its sign (+ or −) or a word.
 */
export const color: Record<ThemeName, ColorTokens> = {
  light: {
    bg: "#fbf9fd",
    surface: "#f3eef9",
    surfaceAlt: "#e9e2f3",
    line: "#e3dbee",
    fg: "#1e1729",
    muted: "#5e5470",
    accent: "#5f3fc0",
    onAccent: "#ffffff",
    accentSoft: "#ebe3fb",
    primary: "#1e1729",
    onPrimary: "#ffffff",
    positive: "#07703a",
    negative: "#bd1d38",
    noticeBg: "#fbe8dc",
    noticeFg: "#5b3826",
    washFrom: "#e4dcf4",
    washVia: "#f1e3f1",
    washTo: "#fbe6d8",
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
  ["fg", "accentSoft"],
  ["muted", "bg"],
  ["muted", "surface"],
  ["muted", "surfaceAlt"],
  ["accent", "bg"],
  ["accent", "surface"],
  ["accent", "surfaceAlt"],
  ["accent", "accentSoft"],
  ["onAccent", "accent"],
  ["onPrimary", "primary"],
  ["bg", "fg"],
  ["positive", "bg"],
  ["negative", "bg"],
  ["positive", "surface"],
  ["negative", "surface"],
  ["positive", "surfaceAlt"],
  ["negative", "surfaceAlt"],
  ["noticeFg", "noticeBg"],
  ["fg", "washFrom"],
  ["fg", "washTo"],
  ["muted", "washFrom"],
  ["muted", "washVia"],
  ["muted", "washTo"],
]

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
