/**
 * Design tokens. Spillover has one theme: light paper panels with a lime accent, raised on a deep
 * olive-black backdrop so the foreground stands clearly off the background. No switcher.
 *
 * Components use semantic names (bg, fg, accent...) through CSS variables, never raw colors.
 * Green and red mean direction (up and down) and nothing else. Lime carries identity: bright lime
 * (`pop`) as a fill behind dark text (buttons, active items, highlights), and a deep olive-lime
 * (`accent`) for text and lines, because bright lime text on white is hard to read.
 */

export type ThemeName = "light";

export interface ColorTokens {
  /** The plane behind everything: a deep olive-black the paper panels sit on, for depth. */
  backdrop: string;
  /** Text set directly on the backdrop. */
  onBackdrop: string;
  /** Panel background: a warm off-white paper. */
  bg: string;
  /** Panels and raised areas. */
  surface: string;
  /** Inputs, chips and raised areas inside a panel. */
  surfaceAlt: string;
  /** Hairline dividers. */
  line: string;
  /** Text. */
  fg: string;
  muted: string;
  /** Deep olive-lime for links, focus, neutral chart lines and the Proposed status (readable as text). */
  accent: string;
  onAccent: string;
  /** A pale lime fill for active items, with `fg` or `accent` text on it. */
  accentSoft: string;
  /** Bright lime, only as a fill behind dark text: the main button, the live dot, highlights. */
  pop: string;
  onPop: string;
  /** Secondary call-to-action buttons: ink pills. */
  primary: string;
  onPrimary: string;
  /** Up: a market number above zero, or a graded hit. */
  positive: string;
  /** Down: a market number below zero, or a graded miss. */
  negative: string;
  noticeBg: string;
  noticeFg: string;
}

export const color: Record<ThemeName, ColorTokens> = {
  light: {
    backdrop: "#1a1c15",
    onBackdrop: "#e9ebe0",
    bg: "#fafaf7",
    surface: "#f2f2ec",
    surfaceAlt: "#e8e8e0",
    line: "#e1e1d8",
    fg: "#141413",
    muted: "#5d5d55",
    accent: "#3f6212",
    onAccent: "#ffffff",
    accentSoft: "#eef7cf",
    pop: "#c5ef4a",
    onPop: "#141413",
    primary: "#141413",
    onPrimary: "#fafaf7",
    positive: "#13703a",
    negative: "#b4232a",
    noticeBg: "#f6f3df",
    noticeFg: "#4f4520",
  },
};

export const THEMES: ThemeName[] = ["light"];

export const radius = { card: "0px", pill: "0px" };
export const font = {
  sans: '"Geist Variable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  mono: '"Geist Mono Variable", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
};

/** Pairs that must meet WCAG AA (4.5:1) for normal text. Checked by a unit test. */
export const textPairs: ReadonlyArray<readonly [keyof ColorTokens, keyof ColorTokens]> = [
  ["fg", "bg"],
  ["onBackdrop", "backdrop"],
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
  ["onPop", "pop"],
  ["onPrimary", "primary"],
  ["bg", "fg"],
  ["positive", "bg"],
  ["negative", "bg"],
  ["positive", "surface"],
  ["negative", "surface"],
  ["positive", "surfaceAlt"],
  ["negative", "surfaceAlt"],
  ["noticeFg", "noticeBg"],
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
