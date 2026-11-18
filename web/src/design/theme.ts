import { color } from "./tokens";

/** Writes the (single, dark) token set onto <html> as CSS variables: --c-bg, --c-fg, ... */
export function applyTheme(root: HTMLElement = document.documentElement): void {
  root.dataset.theme = "dark";
  root.style.colorScheme = "dark";
  for (const [token, value] of Object.entries(color.dark)) {
    root.style.setProperty(`--c-${token.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())}`, value);
  }
}
