import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useRef } from "react";
import { useSiteState } from "../lib/data";
import { Icon } from "./Icon";

const NAV = [
  { to: "/", label: "Trending", end: true },
  { to: "/explore", label: "Explore", end: false },
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
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // "/" jumps to search, as on most market sites, unless you are already typing somewhere.
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === "/" && !(t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable))) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const site = state.phase === "ready" ? state.site : null;
  // Listing pages and claim pages use the full width; reading pages stay at a readable measure.
  const wide = ["/", "/explore", "/feed"].includes(pathname) || pathname.startsWith("/claims/");

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
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-0 px-4 pt-3 md:py-0">
          <Link to="/" className="flex items-center gap-2 text-xl font-extrabold tracking-tight">
            <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-on-primary">
              <Icon name="layers" size={18} />
            </span>
            Spillover
          </Link>

          <label className="relative order-2 my-2 min-w-0 flex-1 md:order-none md:my-3 md:max-w-md">
            <span className="sr-only">Search claims</span>
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">
              <Icon name="search" size={18} />
            </span>
            <input
              type="search"
              ref={searchRef}
              value={pathname === "/explore" ? (params.get("q") ?? "") : ""}
              onChange={(e) => {
                const q = e.target.value;
                void navigate(q ? `/explore?q=${encodeURIComponent(q)}` : "/explore", { replace: pathname === "/explore" });
              }}
              placeholder="Search claims, symbols, events"
              className="w-full rounded-full border border-line bg-surface py-2.5 pl-10 pr-10 text-[15px] text-fg placeholder:text-muted focus:border-primary"
            />
            <kbd aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-line px-1.5 text-xs text-muted md:block">/</kbd>
          </label>

          <nav aria-label="Main" className="order-last flex w-full gap-6 overflow-x-auto md:order-none md:w-auto">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `shrink-0 whitespace-nowrap border-b-2 py-3.5 text-[15px] font-semibold ${isActive ? "border-primary text-fg" : "border-transparent text-muted hover:text-fg"}`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>

          <Link
            to="/submit"
            className="order-1 ml-auto whitespace-nowrap rounded-full bg-primary px-5 py-2.5 md:ml-auto text-[15px] font-bold text-on-primary hover:brightness-110 md:order-none"
          >
            Submit a claim
          </Link>
          <a
            href={`https://github.com/${site?.meta.repo ?? "McMuf/Spillover"}`}
            aria-label="Source on GitHub"
            className="order-1 grid h-10 w-10 place-items-center rounded-full border border-line text-muted hover:text-fg md:order-none"
          >
            <Icon name="source" size={18} />
          </a>
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
