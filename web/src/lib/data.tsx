import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { SiteClaim, SiteData, SiteEvent } from "../generated/site";

type State =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; site: SiteData };

const SiteContext = createContext<State>({ phase: "loading" });

function parseSite(data: SiteData, url: string): SiteData {
  if (data.schema_version !== 1) throw new Error(`Unsupported site data version ${String(data.schema_version)} in ${url}`);
  return data;
}

export async function loadSite(url = "./data/site.json"): Promise<SiteData> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Could not load ${url} (HTTP ${res.status}). Run \`uv run spillover export-site\` first.`);
  }
  return parseSite((await res.json()) as SiteData, url);
}

/** How often an open page checks for newer site data (new events, predictions, headlines). */
export const REFRESH_MS = 5 * 60 * 1000;

export function SiteProvider({ children, refreshMs = REFRESH_MS }: { children: ReactNode; refreshMs?: number }) {
  const [state, setState] = useState<State>({ phase: "loading" });
  useEffect(() => {
    let live = true;
    let last = "";
    loadSite().then(
      (site) => {
        if (!live) return;
        last = JSON.stringify(site);
        setState({ phase: "ready", site });
      },
      (err: unknown) => live && setState({ phase: "error", message: err instanceof Error ? err.message : String(err) }),
    );
    // While the tab is visible, look for a newer build now and then. Only a real change re-renders,
    // and the numbers that moved roll to their new values.
    const tick = async () => {
      if (document.visibilityState !== "visible" || !last) return;
      try {
        const res = await fetch(`./data/site.json?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const text = await res.text();
        const site = parseSite(JSON.parse(text) as SiteData, "site.json");
        const next = JSON.stringify(site);
        if (live && next !== last) {
          last = next;
          setState({ phase: "ready", site });
        }
      } catch {
        // A failed refresh keeps what is on screen; the next tick tries again.
      }
    };
    const id = window.setInterval(() => void tick(), refreshMs);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [refreshMs]);
  return <SiteContext.Provider value={state}>{children}</SiteContext.Provider>;
}

export function useSiteState(): State {
  return useContext(SiteContext);
}

export function findClaim(site: SiteData, id: string | undefined): SiteClaim | undefined {
  return site.claims.find((c) => c.claim.id === id);
}

export function findEvent(site: SiteData, id: string | undefined): SiteEvent | undefined {
  return site.events.find((e) => e.event_id === id);
}
