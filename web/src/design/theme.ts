import { color } from "./tokens";

/** Writes the (single, light) token set onto <html> as CSS variables: --c-bg, --c-fg, ... */
export function applyTheme(root: HTMLElement = document.documentElement): void {
  root.dataset.theme = "light";
  root.style.colorScheme = "light";
  for (const [token, value] of Object.entries(color.light)) {
    root.style.setProperty(`--c-${token.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())}`, value);
  }
}
