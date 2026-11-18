import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useRef } from "react";
import type { SiteData } from "../generated/site";
import { useSiteState } from "../lib/data";
import { categoryOf } from "../lib/plain";
import { Icon, type IconName } from "./Icon";

const NAV: { to: string; label: string; end: boolean; icon: IconName }[] = [
  { to: "/", label: "Feed", end: true, icon: "home" },
  { to: "/explore", label: "Explore", end: false, icon: "explore" },
  { to: "/news", label: "News", end: false, icon: "news" },
  { to: "/scoreboard", label: "Scoreboard", end: false, icon: "scoreboard" },
  { to: "/people", label: "People", end: false, icon: "people" },
  { to: "/method", label: "How it works", end: false, icon: "method" },
];

const CONTRIBUTE: { to: string; label: string; icon: IconName }[] = [
  { to: "/submit", label: "Write a claim", icon: "pen" },
  { to: "/label", label: "Label headlines", icon: "tag" },
];

/** Topics that have claims, most claims first. */
function topicCounts(site: SiteData): [string, number][] {
  const n = new Map<string, number>();
  for (const c of site.claims) {
    const t = categoryOf(c.claim.event_type);
    if (t !== "Control test") n.set(t, (n.get(t) ?? 0) + 1);
  }
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

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
  const wide = ["/", "/explore", "/news", "/scoreboard"].includes(pathname) || pathname.startsWith("/claims/");

  const topics = site ? topicCounts(site) : [];
  const search = (
    <label className="relative block w-full">
      <span className="sr-only">Search claims</span>
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted">
        <Icon name="search" size={17} />
      </span>
      <input
        ref={searchRef}
        type="search"
        value={pathname === "/explore" ? (params.get("q") ?? "") : ""}
        onChange={(e) => {
          const q = e.target.value;
          void navigate(q ? `/explore?q=${encodeURIComponent(q)}` : "/explore", { replace: pathname === "/explore" });
        }}
        placeholder="Search claims, markets or kinds of news"
        className="w-full rounded-full bg-surface-alt py-2.5 pl-11 pr-10 text-sm text-fg placeholder:text-muted focus:bg-surface"
      />
      <kbd aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-line px-1.5 text-xs text-muted xl:block">
        /
      </kbd>
    </label>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-accent focus:px-3 focus:py-1 focus:text-on-accent">
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-line bg-bg">
        <div className="mx-auto flex max-w-[1440px] items-center gap-4 px-4 py-3 md:px-6 xl:gap-8">
          <Link to="/" className="flex shrink-0 items-center gap-2 text-[19px] font-extrabold tracking-tight xl:w-[208px]">
            <Icon name="layers" size={22} />
            Spillover
          </Link>
          <div className="hidden max-w-xl flex-1 md:block">{search}</div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Link to="/submit" className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-fg px-4 py-2 text-sm font-semibold text-bg hover:opacity-90">
              <Icon name="submit" size={16} />
              Submit a claim
            </Link>
            <a href={`https://github.com/${repo}`} aria-label="Source on GitHub" className="grid h-9 w-9 place-items-center rounded-full border border-line text-muted hover:text-fg">
              <Icon name="source" size={16} />
            </a>
          </div>
        </div>
        {/* Below the wide layout: the sections as a tab row (swipe on a phone), then search. */}
        <div className="mx-auto max-w-[1440px] px-4 md:px-6 xl:hidden">
          <nav aria-label="Main" className="no-scrollbar -mx-4 flex gap-6 overflow-x-auto px-4 md:-mx-6 md:px-6">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 pb-2.5 pt-1 text-[15px] font-medium ${
                    isActive ? "border-fg text-fg" : "border-transparent text-muted hover:text-fg"
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="pb-3 pt-1 md:hidden">{search}</div>
        </div>
      </header>

      {site?.meta.data_synthetic && (
        <div role="note" className="border-b border-line bg-notice-bg px-4 py-2 text-center text-xs text-notice-fg" data-testid="synthetic-banner">
          <strong className="text-fg">Synthetic demo data.</strong> Every number on this site comes from simulated returns, not
          real markets. Live data is not connected yet.
        </div>
      )}

      <div className="mx-auto flex w-full max-w-[1440px] flex-1">
        {/* Wide screens: a sidebar with the sections, ways to contribute and topics. */}
        <aside aria-label="Sections" className="hidden w-[240px] shrink-0 border-r border-line xl:block">
          <div className="no-scrollbar sticky top-[65px] max-h-[calc(100vh-65px)] overflow-y-auto px-4 py-6">
            <nav aria-label="Main">
              <ul className="space-y-1">
                {NAV.map((n) => (
                  <li key={n.to}>
                    <NavLink
                      to={n.to}
                      end={n.end}
                      className={({ isActive }) =>
                        `flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium ${
                          isActive ? "bg-surface-alt text-fg" : "text-muted hover:bg-surface hover:text-fg"
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <span className={isActive ? "text-fg" : ""}>
                            <Icon name={n.icon} size={19} />
                          </span>
                          {n.label}
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </nav>
            <h2 className="mb-2 mt-6 border-t border-line px-3 pt-5 text-xs font-semibold uppercase tracking-wider text-muted">Contribute</h2>
            <ul className="space-y-1">
              {CONTRIBUTE.map((n) => (
                <li key={n.to}>
                  <Link to={n.to} className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted hover:bg-surface hover:text-fg">
                    <Icon name={n.icon} size={17} />
                    {n.label}
                  </Link>
                </li>
              ))}
            </ul>
            {topics.length > 0 && (
              <>
                <h2 className="mb-2 mt-6 border-t border-line px-3 pt-5 text-xs font-semibold uppercase tracking-wider text-muted">Topics</h2>
                <ul className="space-y-1">
                  {topics.map(([topic, n]) => (
                    <li key={topic}>
                      <Link
                        to={`/explore?topic=${encodeURIComponent(topic)}`}
                        className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm text-muted hover:bg-surface hover:text-fg"
                      >
                        <span className="flex items-center gap-3">
                          <span aria-hidden="true" className="grid h-6 w-6 place-items-center rounded-full bg-surface-alt text-[10px] font-bold text-fg">
                            {topic.charAt(0)}
                          </span>
                          {topic}
                        </span>
                        <span className="text-xs">{n}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </aside>

        <main id="main" className="min-w-0 flex-1 px-4 py-8 md:px-6 xl:px-10">
          <div className={`mx-auto w-full ${wide ? "max-w-[1180px]" : "max-w-3xl"}`}>
            <Outlet />
          </div>
        </main>
      </div>

      <footer className="border-t border-line py-8 text-xs text-muted">
        <div className="mx-auto max-w-[1440px] space-y-2 px-4 md:px-6">
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
            {" · "}Headlines via the{" "}
            <a className="underline hover:text-fg" href="https://www.gdeltproject.org/" rel="noopener noreferrer">
              GDELT Project
            </a>
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
