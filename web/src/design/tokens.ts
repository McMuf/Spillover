/**
 * Design tokens: the single source for both themes. Components use semantic names (bg, fg,
 * accent...) through CSS variables, never raw colors. Red and green are reserved for realized
 * outcomes (`positive`, `negative`); everything else is neutral or the one calm accent.
 */

export type ThemeName = "light" | "dark";

export interface ColorTokens {
  bg: string;
  surface: string;
  surfaceAlt: string;
  line: string;
  fg: string;
  muted: string;
  accent: string;
  onAccent: string;
  /** Realized, favorable outcome only. */
  positive: string;
  /** Realized, unfavorable outcome only. */
  negative: string;
  noticeBg: string;
  noticeFg: string;
}

export const color: Record<ThemeName, ColorTokens> = {
  light: {
    bg: "#fafaf9",
    surface: "#ffffff",
    surfaceAlt: "#f3f3f1",
    line: "#dcdcd6",
    fg: "#16181d",
    muted: "#555c69",
    accent: "#2b5cd6",
    onAccent: "#ffffff",
    positive: "#17703f",
    negative: "#b02e19",
    noticeBg: "#fff4d6",
    noticeFg: "#5b4300",
  },
  dark: {
    bg: "#0f1115",
    surface: "#16181d",
    surfaceAlt: "#1d2027",
    line: "#2e323c",
    fg: "#f4f5f7",
    muted: "#9aa1ad",
    accent: "#7aa2ff",
    onAccent: "#0f1115",
    positive: "#4ec27f",
    negative: "#ff8a6b",
    noticeBg: "#2b2410",
    noticeFg: "#f0d58a",
  },
};

export const space = { 1: "0.25rem", 2: "0.5rem", 3: "0.75rem", 4: "1rem", 6: "1.5rem", 8: "2rem" };
export const radius = { sm: "6px", md: "10px", pill: "999px" };
export const font = {
  sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
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
  ["onAccent", "accent"],
  ["positive", "surface"],
  ["negative", "surface"],
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
