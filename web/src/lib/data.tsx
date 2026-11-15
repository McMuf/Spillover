import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { SiteClaim, SiteData, SiteEvent } from "../generated/site";

type State =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; site: SiteData };

const SiteContext = createContext<State>({ phase: "loading" });

export async function loadSite(url = "./data/site.json"): Promise<SiteData> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Could not load ${url} (HTTP ${res.status}). Run \`uv run spillover export-site\` first.`);
  }
  const data = (await res.json()) as SiteData;
  if (data.schema_version !== 1) throw new Error(`Unsupported site data version ${String(data.schema_version)}`);
  return data;
}

export function SiteProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ phase: "loading" });
  useEffect(() => {
    let live = true;
    loadSite().then(
      (site) => live && setState({ phase: "ready", site }),
      (err: unknown) => live && setState({ phase: "error", message: err instanceof Error ? err.message : String(err) }),
    );
    return () => {
      live = false;
    };
  }, []);
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
