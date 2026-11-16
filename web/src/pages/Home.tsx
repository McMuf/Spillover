import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ClaimCard } from "../components/ClaimCard";
import { EventItem } from "../components/EventItem";
import { HowItWorks } from "../components/HowItWorks";
import { Icon, type IconName } from "../components/Icon";
import { NodeLegend } from "../components/NodeLegend";
import { Ready } from "../components/Ready";
import { TrendingCard } from "../components/TrendingCard";
import { PillButton, SectionHead, Stamp, tint } from "../components/ui";
import type { CategoryHue } from "../design/tokens";
import type { SiteData } from "../generated/site";
import { byTrending } from "../lib/plain";

const TOP = 3;

function Stat({ icon, hue, label, value }: { icon: IconName; hue: CategoryHue; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4">
      <span style={tint(hue, 16)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border" aria-hidden="true">
        <Icon name={icon} size={20} />
      </span>
      <div>
        <p className="text-xl font-extrabold leading-none">{value}</p>
        <p className="mt-1 text-xs text-muted">{label}</p>
      </div>
    </div>
  );
}

function EventsRail({ site }: { site: SiteData }) {
  const [mode, setMode] = useState<"latest" | "scheduled">("latest");
  const events = useMemo(() => {
    const all = [...site.events].sort((a, b) => b.date.localeCompare(a.date) || a.event_id.localeCompare(b.event_id));
    return (mode === "scheduled" ? all.filter((e) => e.scheduled) : all).slice(0, 8);
  }, [site, mode]);
  return (
    <section aria-labelledby="rail-h" className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 id="rail-h" className="text-lg font-bold">
          Events
        </h2>
        <div role="group" aria-label="Events shown" className="flex gap-1.5">
          <PillButton active={mode === "latest"} onClick={() => setMode("latest")}>Latest</PillButton>
          <PillButton active={mode === "scheduled"} onClick={() => setMode("scheduled")}>Scheduled</PillButton>
        </div>
      </div>
      <ul>
        {events.map((e) => (
          <EventItem key={e.event_id} event={e} site={site} />
        ))}
        {events.length === 0 && <li className="py-4 text-sm text-muted">No events yet.</li>}
      </ul>
      <Link to="/feed" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline">
        See the full feed <Icon name="chevronRight" size={14} />
      </Link>
    </section>
  );
}

function HomeBody({ site }: { site: SiteData }) {
  const ranked = useMemo(() => byTrending(site.claims), [site]);
  const top = ranked.slice(0, TOP);
  const rest = ranked.slice(TOP);
  const eventsTested = site.claims.reduce((n, c) => n + (c.backtest?.n_effective ?? 0), 0);
  const forward = site.scoreboard.claims.reduce((n, r) => n + r.effective_events, 0);

  return (
    <>
      <h1 className="mb-6 max-w-4xl text-3xl font-extrabold leading-[1.1] md:text-5xl">
        Does news really move markets? Spillover tests it in public.
      </h1>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-10">
          <section aria-labelledby="trending-h">
            <SectionHead
              id="trending-h"
              title="Trending claims"
              note="Claims with the most evidence behind them so far, with the markets each one is about."
              right={<Stamp>As of {site.meta.data_as_of}</Stamp>}
            />
            <div className="grid gap-4 md:grid-cols-3">
              {top.map((c) => (
                <TrendingCard key={c.claim.id} item={c} />
              ))}
              {top.length === 0 && <p className="text-muted">No claims yet. Be the first to submit one.</p>}
            </div>
          </section>

          <section aria-label="Scoreboard at a glance" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat icon="layers" hue="catBlue" label="claims on the ledger" value={String(site.claims.length)} />
            <Stat icon="calendar" hue="catPurple" label="past events tested" value={String(eventsTested)} />
            <Stat icon="lock" hue="catOrange" label="forward events collected" value={String(forward)} />
            <Stat icon="shield" hue="catCyan" label="placebo check" value={site.scoreboard.placebo.alert ? "Alert" : "Clean"} />
          </section>

          {rest.length > 0 && (
            <section aria-labelledby="more-h">
              <SectionHead id="more-h" title="More claims" right={<Link to="/explore" className="text-sm font-semibold text-accent hover:underline">Explore all</Link>} />
              <div className="grid gap-4 md:grid-cols-2">
                {rest.map((c) => (
                  <ClaimCard key={c.claim.id} item={c} site={site} />
                ))}
              </div>
            </section>
          )}

          <HowItWorks />
          <NodeLegend />
        </div>

        <aside aria-label="Events" className="min-w-0 xl:sticky xl:top-20 xl:self-start">
          <EventsRail site={site} />
        </aside>
      </div>
    </>
  );
}

export default function Home() {
  return <Ready>{(site) => <HomeBody site={site} />}</Ready>;
}
