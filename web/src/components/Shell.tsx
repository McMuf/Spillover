import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useEffect } from "react";
import { useSiteState } from "../lib/data";
import { Icon } from "./Icon";

const NAV = [
  { to: "/", label: "Claims", end: true },
  { to: "/feed", label: "Feed", end: false },
  { to: "/scoreboard", label: "Scoreboard", end: false },
  { to: "/method", label: "How it works", end: false },
];

export function Shell() {
  const state = useSiteState();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  useEffect(() => {
    window.scrollTo(0, 0); // braces: an effect must not return scrollTo's result
  }, [pathname]);
  const site = state.phase === "ready" ? state.site : null;
  // Listing pages and claim pages use the full width; reading pages stay at a readable measure.
  const wide = pathname === "/" || pathname.startsWith("/claims/");

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

      <header className="sticky top-0 z-40 border-b border-line bg-bg">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3">
          <Link to="/" className="text-2xl font-extrabold tracking-tight">
            Spillover
          </Link>

          <label className="relative order-2 min-w-0 flex-1 md:order-none md:max-w-md">
            <span className="sr-only">Search claims</span>
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">
              <Icon name="search" size={18} />
            </span>
            <input
              type="search"
              value={pathname === "/" ? (params.get("q") ?? "") : ""}
              onChange={(e) => {
                const q = e.target.value;
                void navigate(q ? `/?q=${encodeURIComponent(q)}` : "/", { replace: pathname === "/" });
              }}
              placeholder="Search claims, symbols, events"
              className="w-full rounded-full border border-line bg-surface-alt py-2.5 pl-10 pr-4 text-[15px] text-fg placeholder:text-muted"
            />
          </label>

          <nav aria-label="Main" className="order-last flex w-full gap-5 overflow-x-auto md:order-none md:w-auto">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `shrink-0 whitespace-nowrap py-2 text-[15px] font-semibold ${isActive ? "text-fg" : "text-muted hover:text-fg"}`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>

          <Link
            to="/submit"
            className="order-1 ml-auto whitespace-nowrap rounded-full bg-primary px-5 py-2.5 text-[15px] font-bold text-on-primary hover:brightness-110 md:order-none"
          >
            Submit a claim
          </Link>
        </div>
      </header>

      <main id="main" className={`mx-auto w-full flex-1 px-4 py-8 ${wide ? "max-w-6xl" : "max-w-3xl"}`}>
        <Outlet />
      </main>

      <footer className="border-t border-line py-8 text-xs text-muted">
        <div className="mx-auto max-w-6xl space-y-2 px-4">
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
