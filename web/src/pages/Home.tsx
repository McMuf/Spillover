import { useMemo, useState, type FormEvent } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { AreaChart } from "../components/AreaChart";
import { FeedRow } from "../components/FeedRow";
import { HowItWorks } from "../components/HowItWorks";
import { Icon } from "../components/Icon";
import { PourField } from "../components/PourField";
import { LedgerList } from "../components/LedgerList";
import { Logo } from "../components/Logo";
import { Ready } from "../components/Ready";
import { Ticker } from "../components/Ticker";
import { UpcomingStrip } from "../components/UpcomingStrip";
import { ActionLink, StatRow } from "../components/ui";
import type { SiteClaim, SiteData } from "../generated/site";
import { instrumentName } from "../lib/brands";
import { briefing, feedItems, ordered, topics } from "../lib/feed";
import { claimStat } from "../lib/format";
import { useLiveNews } from "../lib/liveNews";
import { people } from "../lib/people";
import { byTrending, liveClaims } from "../lib/plain";

const CHIP = "shrink-0 whitespace-nowrap px-3.5 py-1.5 text-[13px] font-semibold";
const chip = (on: boolean) => `${CHIP} ${on ? "bg-fg text-bg" : "border border-line text-muted hover:text-fg"}`;

/** Feed, News and Markets: the three ways in, as on a markets app's home. */
function TopTabs() {
  const tabs = [
    { to: "/", label: "Feed", end: true },
    { to: "/news", label: "News", end: false },
    { to: "/explore", label: "Markets", end: false },
  ];
  return (
    <nav aria-label="Home sections" className="grid grid-cols-3 border-b border-line">
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) =>
            `-mb-px border-b-2 pb-3 text-center text-[17px] font-semibold ${isActive ? "border-fg text-fg" : "border-transparent text-muted hover:text-fg"}`
          }
        >
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}

/** Start from the news: one line, then the guided claim form takes over. */
function Composer() {
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const go = (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    void navigate(t ? `/submit?statement=${encodeURIComponent(t)}` : "/submit");
  };
  return (
    <form onSubmit={go} aria-label="Write a claim" className="flex gap-2 bg-surface p-2">
      <label className="min-w-0 flex-1">
        <span className="sr-only">Saw something in the news? Say what you think it does to markets.</span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Saw something in the news? Say what you think it does to markets…"
          className="w-full bg-transparent px-3 py-2.5 text-[15px] text-fg placeholder:text-muted"
        />
      </label>
      <button type="submit" className="inline-flex shrink-0 items-center gap-1.5 bg-fg px-4 text-sm font-semibold text-bg hover:opacity-90">
        Start
      </button>
    </form>
  );
}

function Feed({ site }: { site: SiteData }) {
  const live = useLiveNews(site);
  const [mode, setMode] = useState<"trending" | "latest">("trending");
  const [topic, setTopic] = useState("All");
  const all = useMemo(() => feedItems(site, live.headlines), [site, live.headlines]);
  const brief = useMemo(() => briefing(site, live.headlines, new Date()), [site, live.headlines]);
  const shown = useMemo(() => {
    const pool = topic === "All" ? all : all.filter((it) => it.kind !== "briefing" && it.topic === topic);
    const list = ordered(pool, mode, site);
    return brief && topic === "All" && mode === "trending" ? [brief, ...list] : list;
  }, [all, brief, mode, topic, site]);
  const topicList = useMemo(() => topics(all), [all]);
  return (
    <section aria-labelledby="feed-h">
      <h2 id="feed-h" className="sr-only">
        Feed
      </h2>
      <div className="no-scrollbar -mx-4 flex items-center gap-2 overflow-x-auto px-4 py-4 md:mx-0 md:px-0" role="group" aria-label="Filter the feed">
        <button type="button" aria-pressed={mode === "trending"} onClick={() => setMode("trending")} className={chip(mode === "trending")}>
          Mixed
        </button>
        <button type="button" aria-pressed={mode === "latest"} onClick={() => setMode("latest")} className={chip(mode === "latest")}>
          Latest
        </button>
        <span aria-hidden="true" className="mx-1 h-6 w-px shrink-0 bg-line" />
        {["All", ...topicList].map((t) => (
          <button key={t} type="button" aria-pressed={topic === t} onClick={() => setTopic(t)} className={chip(topic === t)}>
            {t}
          </button>
        ))}
      </div>
      <p className="-mt-2 mb-1 text-xs text-muted">
        {mode === "trending"
          ? "Mixed: news, claims, questions and the record take turns; claims with the most evidence first. No votes or popularity."
          : "Latest: everything, newest first."}
      </p>
      <ul>
        {shown.map((it) => (
          <FeedRow key={it.id} item={it} site={site} fresh={it.kind === "headline" && live.fresh.has(it.headline.headline_id)} />
        ))}
        {shown.length === 0 && <li className="py-8 text-muted">Nothing here yet.</li>}
      </ul>
      <p className="py-4 text-xs text-muted">
        {live.source === "live" ? "Headlines are live from" : "Headlines are from the last build, via"} the{" "}
        <a href="https://www.gdeltproject.org/" className="underline" rel="noopener noreferrer">
          GDELT Project
        </a>
        ; claims, events and predictions come from the public record.
      </p>
    </section>
  );
}

/** Each market claims are about, as a markets list: logo, symbol, line, and the lead claim's number. */
function Markets({ site }: { site: SiteData }) {
  const rows = useMemo(() => {
    const by = new Map<string, SiteClaim[]>();
    for (const c of byTrending(liveClaims(site))) {
      if (c.claim.event_type === "RANDOM_DATE") continue;
      const s = c.claim.instrument.symbol;
      by.set(s, [...(by.get(s) ?? []), c]);
    }
    return [...by.entries()].slice(0, 6);
  }, [site]);
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby="markets-h" className="lift bg-bg p-4">
      <div className="flex items-baseline justify-between">
        <h2 id="markets-h" className="text-[17px] font-bold">
          Markets
        </h2>
        <Link to="/explore" className="text-sm text-muted hover:text-fg">
          See all
        </Link>
      </div>
      <ul className="mt-2">
        {rows.map(([symbol, claims]) => {
          const lead = claims[0]!;
          const stat = claimStat(lead.claim.measure, lead.backtest?.mean);
          return (
            <li key={symbol} className="border-b border-line last:border-b-0">
              <Link to={`/claims/${lead.claim.id}`} className="grid grid-cols-[auto_minmax(0,1fr)_64px_auto] items-center gap-3 py-3 hover:bg-surface">
                <Logo symbol={symbol} size={36} />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-x-1.5">
                    <span className="text-[15px] font-bold">{symbol}</span>
                    <span className="whitespace-nowrap bg-surface-alt px-1 text-[11px] text-muted">
                      {claims.length} claim{claims.length === 1 ? "" : "s"}
                    </span>
                  </span>
                  <span className="block truncate text-sm text-muted">{instrumentName(symbol)}</span>
                </span>
                <AreaChart values={lead.chart?.mean ?? []} height={30} tone={({ up: "up", down: "down", flat: "neutral" } as const)[stat.dir]} />
                <span className="text-right">
                  <span className={`block text-[15px] font-bold tabular-nums ${stat.cls}`}>
                    <Ticker text={stat.value} />
                  </span>
                  <span className="block text-[11px] text-muted">{stat.short ?? "backtest"}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function NewHere() {
  return (
    <section aria-labelledby="newhere-h" className="hex-bg lift bg-surface p-5">
      <h2 id="newhere-h" className="text-[17px] font-bold leading-snug">
        New here? Test what you think the news does to markets.
      </h2>
      <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted">
        <li>Not sure yet? Ask a question first; others help shape it.</li>
        <li>Write a claim about a kind of news, not one story.</li>
        <li>It is frozen and time-stamped before new events happen.</li>
        <li>Once enough new events happen, market data grades it in public, by published rules.</li>
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        <ActionLink to="/submit">Write a claim</ActionLink>
        <ActionLink to="/questions" variant="secondary" icon={null}>
          Ask a question
        </ActionLink>
      </div>
    </section>
  );
}

function HomeBody({ site }: { site: SiteData }) {
  const frozen = site.claims.reduce((n, c) => n + c.forward_log.length, 0);
  const onRecord = site.events.filter((e) => e.event_type !== "RANDOM_DATE").length;
  const contributors = people(site).length;
  return (
    <>
      <header className="relative isolate mb-8 grid items-stretch gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
        {/* Barely visible hexagons behind the hero, fading out: depth, not decoration. */}
        <div aria-hidden="true" className="hex-bg hex-fade pointer-events-none absolute -inset-x-4 -top-6 bottom-0 -z-10 md:-inset-x-6" />
        <div className="py-2 md:py-8">
          <h1 className="text-[56px] font-extrabold leading-none tracking-[-0.045em] md:text-[88px]">Spillover</h1>
          <p className="mt-5 max-w-xl text-[18px] leading-relaxed text-muted">
            An open ledger for how news spills over into markets. Write a claim, it is timestamped before new
            events happen, and the market grades it in public.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link to="/submit" className="lift-press inline-flex items-center gap-2 bg-pop px-5 py-2.5 text-[15px] font-semibold text-on-pop">
              Write a claim
            </Link>
            <Link to="/method" className="lift-press inline-flex items-center gap-2 bg-bg px-5 py-2.5 text-[15px] font-semibold">
              How it works
            </Link>
          </div>
          <div className="mt-6">
            <StatRow
              label="Spillover so far"
              items={[
                { value: String(liveClaims(site).length), label: liveClaims(site).length === 1 ? "claim" : "claims" },
                { value: String(frozen), label: "predictions frozen" },
                { value: String(onRecord), label: "events on record" },
                { value: String(contributors), label: contributors === 1 ? "contributor" : "contributors" },
              ]}
            />
          </div>
        </div>
        {/* A glass filled by a pour of stock ticks until it spills over. */}
        <div className="lift relative min-h-[260px] overflow-hidden bg-bg md:min-h-[340px]">
          <PourField className="absolute inset-0" />
        </div>
      </header>

      <LedgerList site={site} />

      <UpcomingStrip site={site} />

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <TopTabs />
          <div className="mt-4">
            <Composer />
          </div>
          <Feed site={site} />
          <div className="pt-8">
            <HowItWorks />
          </div>
        </div>
        <aside aria-label="Markets" className="min-w-0 space-y-8 lg:sticky lg:top-24 lg:self-start">
          <Markets site={site} />
          <NewHere />
        </aside>
      </div>
    </>
  );
}

export default function Home() {
  return <Ready>{(site) => <HomeBody site={site} />}</Ready>;
}
