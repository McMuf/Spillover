/**
 * Design tokens. Spillover has one theme: dark. Dark grey panels sit on a pure black backdrop with a
 * faint white hexagon grid, so the foreground stands clearly off the background. No switcher.
 *
 * Components use semantic names (bg, fg, accent...) through CSS variables, never raw colors.
 * Green and red mean direction (up and down) and nothing else. Lime carries identity: as a fill
 * behind dark text (buttons, highlights) and as text for links and focus, which reads well on dark.
 */

export type ThemeName = "dark";

export interface ColorTokens {
  /** The plane behind everything: pure black, with a faint white hexagon grid. */
  backdrop: string;
  /** Text set directly on the backdrop. */
  onBackdrop: string;
  /** Panel background: a grey near-black. */
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
  dark: {
    backdrop: "#000000",
    onBackdrop: "#e6e7e2",
    bg: "#161719",
    surface: "#1e1f22",
    surfaceAlt: "#28292d",
    line: "#33353a",
    fg: "#ededea",
    muted: "#a3a49d",
    accent: "#c5ef4a",
    onAccent: "#141413",
    accentSoft: "#2b3313",
    pop: "#c5ef4a",
    onPop: "#141413",
    primary: "#ededea",
    onPrimary: "#141413",
    positive: "#4fd47f",
    negative: "#ff7a7a",
    noticeBg: "#2a2614",
    noticeFg: "#ecdc8c",
  },
};

export const THEMES: ThemeName[] = ["dark"];

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
