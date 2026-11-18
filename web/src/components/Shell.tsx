import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useRef } from "react";
import { useSiteState } from "../lib/data";
import { Icon } from "./Icon";

const NAV = [
  { to: "/", label: "Trending", end: true },
  { to: "/explore", label: "Explore", end: false },
  { to: "/news", label: "News", end: false },
  { to: "/scoreboard", label: "Scoreboard", end: false },
  { to: "/method", label: "How it works", end: false },
];

export function Shell() {
  const state = useSiteState();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    window.scrollTo(0, 0); // braces: an effect must not return scrollTo's result
  }, [pathname]);

  useEffect(() => {
    // "/" jumps to search, unless you are already typing somewhere.
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const site = state.phase === "ready" ? state.site : null;
  const repo = site?.meta.repo ?? "McMuf/Spillover";
  // Listing and claim pages use the full width; reading pages stay at a readable measure.
  const wide = ["/", "/explore"].includes(pathname) || pathname.startsWith("/claims/");

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-accent focus:px-3 focus:py-1 focus:text-on-accent">
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-line bg-bg">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-8 px-4 md:h-16 md:flex-nowrap md:px-6">
          <Link to="/" className="flex h-14 items-center gap-2 text-[19px] font-extrabold tracking-tight md:h-auto">
            <Icon name="layers" size={22} />
            Spillover
          </Link>

          <nav aria-label="Main" className="no-scrollbar order-last -mx-4 flex w-[calc(100%+2rem)] gap-7 overflow-x-auto px-4 md:order-none md:mx-0 md:h-full md:w-auto md:px-0">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `flex shrink-0 items-center whitespace-nowrap border-b-2 py-3 text-[15px] font-medium md:py-0 ${
                    isActive ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg"
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>

          <label className="relative order-last mb-3 w-full md:order-none md:mb-0 md:ml-auto md:w-72 lg:w-96">
            <span className="sr-only">Search claims</span>
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">
              <Icon name="search" size={16} />
            </span>
            <input
              ref={searchRef}
              type="search"
              value={pathname === "/explore" ? (params.get("q") ?? "") : ""}
              onChange={(e) => {
                const q = e.target.value;
                void navigate(q ? `/explore?q=${encodeURIComponent(q)}` : "/explore", { replace: pathname === "/explore" });
              }}
              placeholder="Search claims"
              className="w-full rounded-full border border-line bg-surface py-2 pl-10 pr-10 text-sm text-fg placeholder:text-muted focus:border-muted"
            />
            <kbd aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded-md border border-line px-1.5 text-xs text-muted md:block">
              /
            </kbd>
          </label>

          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <Link to="/submit" className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-primary px-3.5 py-1.5 text-sm font-semibold text-on-primary hover:brightness-110">
              <Icon name="submit" size={16} />
              Submit a claim
            </Link>
            <a href={`https://github.com/${repo}`} aria-label="Source on GitHub" className="grid h-9 w-9 place-items-center rounded-full border border-line text-muted hover:text-fg">
              <Icon name="source" size={16} />
            </a>
          </div>
        </div>
      </header>

      {site?.meta.data_synthetic && (
        <div role="note" className="border-b border-line bg-notice-bg px-4 py-2 text-center text-xs text-notice-fg" data-testid="synthetic-banner">
          <strong className="text-fg">Synthetic demo data.</strong> Every number on this site comes from simulated returns, not
          real markets. Live data is not connected yet.
        </div>
      )}

      <main id="main" className={`mx-auto w-full flex-1 px-4 py-8 md:px-6 ${wide ? "max-w-[1280px]" : "max-w-3xl"}`}>
        <Outlet />
      </main>

      <footer className="border-t border-line py-8 text-xs text-muted">
        <div className="mx-auto max-w-[1280px] space-y-2 px-4 md:px-6">
          <p>
            <strong className="text-fg">Research, not investment advice.</strong> Spillover never places trades and holds no
            funds. Nothing here is a recommendation to buy or sell anything.
          </p>
          <p>
            Open source (Apache-2.0 code, CC-BY-4.0 data).{" "}
            <a className="underline hover:text-fg" href={`https://github.com/${repo}`}>
              Source on GitHub
            </a>
            {" · "}Market data via FRED, Federal Reserve Bank of St. Louis: dollar and yen series from the
            Board of Governors of the Federal Reserve System and oil prices from the US Energy Information
            Administration (public domain). S&amp;P 500 © S&amp;P Dow Jones Indices LLC; Nasdaq Composite © Nasdaq,
            Inc.; used for non-commercial educational research. Only statistics derived from them are shown.
            {" · "}build {__COMMIT__}
            {" · "}Charts powered by{" "}
            <a className="underline hover:text-fg" href="https://www.tradingview.com/" rel="noopener noreferrer">
              TradingView Lightweight Charts
            </a>
            .
          </p>
        </div>
      </footer>
    </div>
  );
}
