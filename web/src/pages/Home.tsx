import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AreaChart } from "../components/AreaChart";
import { ClaimPost } from "../components/ClaimPost";
import { HowItWorks } from "../components/HowItWorks";
import { Icon, type IconName } from "../components/Icon";
import { Logo } from "../components/Logo";
import { Ready } from "../components/Ready";
import { UpcomingStrip } from "../components/UpcomingStrip";
import { ActionLink, StatRow } from "../components/ui";
import type { SiteClaim, SiteData } from "../generated/site";
import { instrumentName } from "../lib/brands";
import { claimStat } from "../lib/format";
import { storyTitle } from "../lib/news";
import { people } from "../lib/people";
import { byTrending } from "../lib/plain";

type Feed = "foryou" | "latest" | "tested";
const FEEDS: { value: Feed; label: string }[] = [
  { value: "foryou", label: "For you" },
  { value: "latest", label: "Latest" },
  { value: "tested", label: "Most tested" },
];

function ordered(claims: SiteClaim[], feed: Feed): SiteClaim[] {
  if (feed === "latest") return [...claims].sort((a, b) => b.claim.registered_at.localeCompare(a.claim.registered_at) || a.claim.id.localeCompare(b.claim.id));
  if (feed === "tested") return [...claims].sort((a, b) => (b.backtest?.n_effective ?? 0) - (a.backtest?.n_effective ?? 0) || a.claim.id.localeCompare(b.claim.id));
  return byTrending(claims);
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
  const actions: { to: string; icon: IconName; label: string }[] = [
    { to: "/news", icon: "news", label: "Browse the news" },
    { to: "/explore", icon: "explore", label: "See existing claims" },
    { to: "/method", icon: "method", label: "How claims are graded" },
  ];
  return (
    <section aria-labelledby="composer-h" className="rounded-[20px] bg-surface p-4">
      <h2 id="composer-h" className="sr-only">
        Write a claim
      </h2>
      <form onSubmit={go} className="flex gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Saw something in the news? Say what you think it does to markets.</span>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Saw something in the news? Say what you think it does to markets…"
            className="w-full rounded-xl bg-surface-alt px-4 py-3 text-[15px] text-fg placeholder:text-muted"
          />
        </label>
        <button type="submit" className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-fg px-4 text-sm font-semibold text-bg hover:opacity-90">
          Start
          <Icon name="arrowRight" size={16} />
        </button>
      </form>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 px-1">
        {actions.map((a) => (
          <Link key={a.to} to={a.to} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
            <span className="text-accent">
              <Icon name={a.icon} size={17} />
            </span>
            {a.label}
          </Link>
        ))}
      </div>
    </section>
  );
}

function FeedTabs({ value, onChange }: { value: Feed; onChange: (f: Feed) => void }) {
  return (
    <div role="group" aria-label="Order the claims" className="flex gap-6 border-b border-line">
      {FEEDS.map((f) => (
        <button
          key={f.value}
          type="button"
          aria-pressed={value === f.value}
          onClick={() => onChange(f.value)}
          className={`-mb-px border-b-2 pb-2.5 text-[15px] font-semibold ${value === f.value ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg"}`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

/** Each market claims are about: how many claims, the lead claim's number, and its average event path. */
function Markets({ site }: { site: SiteData }) {
  const rows = useMemo(() => {
    const by = new Map<string, SiteClaim[]>();
    for (const c of byTrending(site.claims)) {
      if (c.claim.event_type === "RANDOM_DATE") continue;
      const s = c.claim.instrument.symbol;
      by.set(s, [...(by.get(s) ?? []), c]);
    }
    return [...by.entries()].slice(0, 6);
  }, [site]);
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby="markets-h" className="rounded-[20px] bg-surface p-4">
      <h2 id="markets-h" className="mb-2 px-1 text-[17px] font-bold">
        Markets being tested
      </h2>
      <ul>
        {rows.map(([symbol, claims]) => {
          const lead = claims[0]!;
          const stat = claimStat(lead.claim.measure, lead.backtest?.mean);
          return (
            <li key={symbol} className="border-t border-line first:border-t-0">
              <Link to={`/claims/${lead.claim.id}`} className="grid grid-cols-[auto_minmax(0,1fr)_56px_auto] items-center gap-3 rounded-lg px-1 py-2.5 hover:bg-surface-alt">
                <Logo symbol={symbol} size={28} />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-accent">{symbol}</span>
                  <span className="block truncate text-xs text-muted" title={instrumentName(symbol)}>
                    {instrumentName(symbol)}
                  </span>
                  <span className="block text-[11px] text-muted">
                    {claims.length} claim{claims.length === 1 ? "" : "s"}
                  </span>
                </span>
                <AreaChart values={lead.chart?.mean ?? []} height={28} tone={({ up: "up", down: "down", flat: "accent" } as const)[stat.dir]} />
                <span className={`text-right text-sm font-semibold tabular-nums ${stat.cls}`}>
                  {stat.value}
                  {stat.note && <span className="block text-[11px] font-normal text-muted">{stat.note.replace(" than usual", "")}</span>}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

/** The latest market headlines (or, without them, the latest events on record), text only. */
function Latest({ site }: { site: SiteData }) {
  const live = site.headlines.slice(0, 6);
  const record = site.news.slice(0, 6);
  if (live.length === 0 && record.length === 0) return null;
  return (
    <section aria-labelledby="latest-h" className="rounded-[20px] bg-surface p-4">
      <h2 id="latest-h" className="mb-2 px-1 text-[17px] font-bold">
        Latest
      </h2>
      <ul>
        {live.length > 0
          ? live.map((h) => (
              <li key={h.headline_id} className="border-t border-line px-1 py-2.5 first:border-t-0">
                <a href={h.url} target="_blank" rel="noopener noreferrer nofollow" className="text-sm font-semibold leading-snug hover:underline">
                  {h.title}
                </a>
                <p className="mt-0.5 text-xs text-muted">
                  {h.domain} · {ago(h.seen_at)}
                </p>
              </li>
            ))
          : record.map((s) => (
              <li key={s.event_id} className="border-t border-line px-1 py-2.5 first:border-t-0">
                <Link to={`/events/${s.event_id}`} className="text-sm font-semibold leading-snug hover:underline">
                  {storyTitle(s)}
                </Link>
                <p className="mt-0.5 text-xs text-muted">{s.date}</p>
              </li>
            ))}
      </ul>
      <Link to="/news" className="mt-2 inline-flex items-center gap-1 px-1 text-sm font-semibold text-accent hover:underline">
        Open the news <Icon name="chevronRight" size={14} />
      </Link>
    </section>
  );
}

function NewHere() {
  return (
    <section aria-labelledby="newhere-h" className="overflow-hidden rounded-[20px] bg-surface">
      <div className="bg-surface-alt px-5 py-4">
        <h2 id="newhere-h" className="text-[17px] font-bold leading-snug">
          New here? Test what you think the news does to markets.
        </h2>
      </div>
      <div className="space-y-4 p-5">
        <ul className="space-y-2 text-sm leading-relaxed">
          <li className="flex gap-2">
            <span className="text-accent">
              <Icon name="pen" size={16} />
            </span>
            Write a claim about a kind of news, not one story.
          </li>
          <li className="flex gap-2">
            <span className="text-accent">
              <Icon name="lock" size={16} />
            </span>
            It is frozen and time-stamped before new events happen.
          </li>
          <li className="flex gap-2">
            <span className="text-accent">
              <Icon name="scale" size={16} />
            </span>
            The market grades it, in public, by rules nobody can bend.
          </li>
        </ul>
        <div className="flex flex-wrap gap-2">
          <ActionLink to="/submit">Write a claim</ActionLink>
          <ActionLink to="/method" variant="secondary" icon={null}>
            How it works
          </ActionLink>
        </div>
      </div>
    </section>
  );
}

function HomeBody({ site }: { site: SiteData }) {
  const [feed, setFeed] = useState<Feed>("foryou");
  const claims = useMemo(() => ordered(site.claims, feed), [site, feed]);
  const frozen = site.claims.reduce((n, c) => n + c.forward_log.length, 0);
  const onRecord = site.events.filter((e) => e.event_type !== "RANDOM_DATE").length;
  return (
    <>
      <header className="mb-6">
        <h1 className="max-w-3xl text-3xl font-extrabold leading-[1.1] tracking-tight md:text-[44px]">
          Does news really move markets? Spillover tests it in public.
        </h1>
        <div className="mt-4">
          <StatRow
            label="Spillover so far"
            items={[
              { value: String(site.claims.length), label: site.claims.length === 1 ? "claim" : "claims" },
              { value: String(frozen), label: "predictions frozen" },
              { value: String(onRecord), label: "events on record" },
              { value: String(people(site).length), label: people(site).length === 1 ? "contributor" : "contributors" },
            ]}
          />
        </div>
      </header>

      <UpcomingStrip site={site} />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          <Composer />
          <section aria-labelledby="trending-h" className="space-y-5">
            <h2 id="trending-h" className="sr-only">
              Trending claims
            </h2>
            <FeedTabs value={feed} onChange={setFeed} />
            {claims.map((c) => (
              <ClaimPost key={c.claim.id} item={c} />
            ))}
            {claims.length === 0 && <p className="text-muted">No claims yet. Be the first to submit one.</p>}
          </section>
          <div className="pt-6">
            <HowItWorks />
          </div>
        </div>
        <aside aria-label="Markets and news" className="min-w-0 space-y-5 lg:sticky lg:top-24 lg:self-start">
          <Markets site={site} />
          <Latest site={site} />
          <NewHere />
        </aside>
      </div>
    </>
  );
}

export default function Home() {
  return <Ready>{(site) => <HomeBody site={site} />}</Ready>;
}
