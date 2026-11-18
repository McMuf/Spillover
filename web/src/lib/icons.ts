import type { SiteData } from "../generated/site";
import { useSiteState } from "./data";

/**
 * Real icons stored with the site at build time (see engine/spillover/ingest/icons.py). Nothing on
 * the site draws a letter or stand-in where an icon belongs: a name with no icon here shows none.
 */
export type Icons = SiteData["icons"];

const EMPTY: Icons = { domains: {}, symbols: {}, people: {} };

/** Only files in the site's own icons folder are ever used. */
const SAFE = /^icons\/[a-z0-9._-]+\.(png|ico|jpg|gif|webp)$/;
const safe = (path: string | undefined) => (path && SAFE.test(path) ? path : undefined);

export const outletKey = (domain: string) => domain.toLowerCase().replace(/^www\./, "");

export function outletIcon(icons: Icons, domain: string): string | undefined {
  return safe(icons.domains[outletKey(domain)]);
}

export function symbolIcon(icons: Icons, symbol: string): string | undefined {
  return safe(icons.symbols[symbol.toUpperCase()] ?? icons.symbols[symbol]);
}

export function personIcon(icons: Icons, handle: string): string | undefined {
  return safe(icons.people[handle]);
}

/** The icon manifest from the loaded site, or none while it loads (components then show nothing). */
export function useIcons(): Icons {
  const state = useSiteState();
  return state.phase === "ready" ? (state.site.icons ?? EMPTY) : EMPTY;
}
