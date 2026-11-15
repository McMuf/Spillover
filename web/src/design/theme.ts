import { color, type ThemeName } from "./tokens";

export type ThemePreference = "system" | "light" | "dark";
const KEY = "spillover-theme";

export function readPreference(): ThemePreference {
  try {
    const v = window.localStorage.getItem(KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* storage can be blocked (private window); fall back to the system theme */
  }
  return "system";
}

export function savePreference(pref: ThemePreference): void {
  try {
    window.localStorage.setItem(KEY, pref);
  } catch {
    /* ignore: the preference just will not persist */
  }
}

export function resolveTheme(pref: ThemePreference): ThemeName {
  if (pref !== "system") return pref;
  const dark =
    typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
  return dark ? "dark" : "light";
}

/** Writes the tokens for a theme onto <html> as CSS variables (--c-bg, --c-fg, ...). */
export function applyTheme(name: ThemeName, root: HTMLElement = document.documentElement): void {
  root.dataset.theme = name;
  root.style.colorScheme = name;
  for (const [token, value] of Object.entries(color[name])) {
    root.style.setProperty(`--c-${token.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())}`, value);
  }
}
