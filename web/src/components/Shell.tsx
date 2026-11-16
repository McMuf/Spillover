import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useSiteState } from "../lib/data";
import { Icon, type IconName } from "./Icon";

// Detail pages get a back arrow of their own, so the floating bar and the section tabs step aside.
const DETAIL = /^\/(claims|events)\//;

const BAR: { to: string; label: string; icon: IconName; end: boolean }[] = [
  { to: "/", label: "Claims", icon: "explore", end: true },
  { to: "/scoreboard", label: "Scoreboard", icon: "scoreboard", end: false },
  { to: "/method", label: "Method", icon: "method", end: false },
  { to: "/submit", label: "Submit a claim", icon: "submit", end: false },
];

export function Shell() {
  const state = useSiteState();
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0); // braces: an effect must not return scrollTo's result
  }, [pathname]);
  const site = state.phase === "ready" ? state.site : null;
  const detail = DETAIL.test(pathname);

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-accent focus:px-3 focus:py-1 focus:text-on-accent">
        Skip to content
      </a>

      {site?.meta.data_synthetic && (
        <div role="note" className="bg-notice-bg px-4 py-2 text-center text-xs text-notice-fg" data-testid="synthetic-banner">
          <strong>Synthetic demo data.</strong> Every number on this site comes from simulated returns, not real markets.
          Live data is not connected yet.
        </div>
      )}

      <main id="main" className={`mx-auto w-full max-w-[640px] flex-1 px-4 pt-6 ${detail ? "pb-32" : "pb-36"}`}>
        <Outlet />

        <footer className="mt-12 space-y-2 border-t border-line pt-6 text-xs text-muted">
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
        </footer>
      </main>

      {!detail && (
        <nav
          aria-label="Main"
          className="glass fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-line p-2"
        >
          {BAR.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              aria-label={n.label}
              title={n.label}
              className={({ isActive }) =>
                `grid h-12 w-14 place-items-center rounded-full ${isActive ? "bg-primary text-on-primary" : "text-muted hover:text-fg"}`
              }
            >
              <Icon name={n.icon} />
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
