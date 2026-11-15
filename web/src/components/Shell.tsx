import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useSiteState } from "../lib/data";
import { useTheme } from "./ThemeContext";

const NAV = [
  { to: "/", label: "Claims", end: true },
  { to: "/scoreboard", label: "Scoreboard", end: false },
  { to: "/method", label: "Method", end: false },
  { to: "/submit", label: "Submit", end: false },
];

const THEME_LABEL = { system: "Theme: system", light: "Theme: light", dark: "Theme: dark" } as const;

export function Shell() {
  const { preference, cycle } = useTheme();
  const state = useSiteState();
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0); // braces: an effect must not return scrollTo's result
  }, [pathname]);
  const site = state.phase === "ready" ? state.site : null;

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:rounded focus:bg-accent focus:px-3 focus:py-1 focus:text-on-accent">
        Skip to content
      </a>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <NavLink to="/" className="text-xl font-extrabold tracking-tight">
            Spillover
          </NavLink>
          <nav aria-label="Main" className="flex items-center gap-1 text-sm">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `rounded-full px-3 py-1.5 ${isActive ? "bg-surface-alt font-semibold" : "text-muted hover:text-fg"}`
                }
              >
                {n.label}
              </NavLink>
            ))}
            <button
              type="button"
              onClick={cycle}
              className="ml-1 whitespace-nowrap rounded-full border border-line px-3 py-1.5 text-xs text-muted hover:text-fg"
              aria-label={`${THEME_LABEL[preference]}. Activate to change.`}
            >
              {THEME_LABEL[preference]}
            </button>
          </nav>
        </div>
      </header>

      {site?.meta.data_synthetic && (
        <div role="note" className="bg-notice-bg px-4 py-2 text-center text-xs text-notice-fg" data-testid="synthetic-banner">
          <strong>Synthetic demo data.</strong> Every number on this site comes from simulated returns, not real markets.
          Live data is not connected yet.
        </div>
      )}

      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <Outlet />
      </main>

      <footer className="border-t border-line bg-surface px-4 py-6 text-xs text-muted">
        <div className="mx-auto max-w-5xl space-y-2">
          <p>
            <strong className="text-fg">Research, not investment advice.</strong> Spillover never places trades and
            holds no funds. Nothing here is a recommendation to buy or sell anything.
          </p>
          <p>
            Open source (Apache-2.0 code, CC-BY-4.0 data).{" "}
            <a className="underline" href={`https://github.com/${site?.meta.repo ?? "McMuf/Spillover"}`}>
              Source on GitHub
            </a>
            {" · "}build {__COMMIT__}
            {" · "}Charts powered by{" "}
            <a className="underline" href="https://www.tradingview.com/" rel="noopener noreferrer">
              TradingView Lightweight Charts
            </a>
            .
          </p>
        </div>
      </footer>
    </div>
  );
}
