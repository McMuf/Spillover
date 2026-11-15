import type { ReactNode } from "react";
import type { SiteData } from "../generated/site";
import { useSiteState } from "../lib/data";

/** Renders children once the site data has loaded; otherwise a plain loading or error message. */
export function Ready({ children }: { children: (site: SiteData) => ReactNode }) {
  const state = useSiteState();
  if (state.phase === "loading") return <p role="status" className="text-muted">Loading claims…</p>;
  if (state.phase === "error") {
    return (
      <div role="alert" className="rounded-[10px] border border-negative p-4 text-sm">
        <p className="font-semibold">The site data could not be loaded.</p>
        <p className="mt-1 text-muted">{state.message}</p>
      </div>
    );
  }
  return <>{children(state.site)}</>;
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-line py-2 first:border-t-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-right text-sm font-medium">{children}</dd>
    </div>
  );
}
