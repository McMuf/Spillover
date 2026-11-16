import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { EventCard } from "../components/EventCard";
import { FeedItem } from "../components/FeedItem";
import { HowItWorks } from "../components/HowItWorks";
import { Icon } from "../components/Icon";
import { NodeLegend } from "../components/NodeLegend";
import { Ready } from "../components/Ready";
import { TrendingCard } from "../components/TrendingCard";
import { IconButton, SectionHead, Segmented } from "../components/ui";
import type { SiteData, SiteEvent } from "../generated/site";
import { byTrending, categoryOf } from "../lib/plain";

/** Horizontal carousel with arrow buttons that switch off at either end. */
function useCarousel() {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ prev: false, next: false });
  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdges({ prev: el.scrollLeft > 4, next: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    el.addEventListener("scroll", update, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", update);
    };
  }, [update]);
  const go = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth, behavior: "smooth" });
  return { ref, edges, go };
}


function Trending({ site }: { site: SiteData }) {
  const ranked = useMemo(() => byTrending(site.claims), [site]);
  const { ref, edges, go } = useCarousel();
  return (
    <section aria-labelledby="trending-h">
      <SectionHead
        id="trending-h"
        title="Trending claims"
        right={
          (edges.prev || edges.next) && (
            <div className="flex gap-2">
              <IconButton icon="back" label="Previous claims" onClick={() => go(-1)} disabled={!edges.prev} />
              <IconButton icon="chevronRight" label="More claims" onClick={() => go(1)} disabled={!edges.next} />
            </div>
          )
        }
      />
      <div ref={ref} className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-4 px-4 md:mx-0 md:scroll-px-0 md:px-0">
        {ranked.map((c) => (
          <div key={c.claim.id} className="w-[85%] shrink-0 snap-start sm:w-[calc(50%-8px)] lg:w-[calc((100%-32px)/3)]">
            <TrendingCard item={c} />
          </div>
        ))}
        {ranked.length === 0 && <p className="text-muted">No claims yet. Be the first to submit one.</p>}
      </div>
    </section>
  );
}

function Recent({ site }: { site: SiteData }) {
  // Control days are bookkeeping for the placebo, not news, so they stay out of this row.
  const events = useMemo(
    () => [...site.events].filter((e) => e.event_type !== "RANDOM_DATE").sort((a, b) => b.date.localeCompare(a.date) || a.event_id.localeCompare(b.event_id)).slice(0, 9),
    [site],
  );
  const { ref, edges, go } = useCarousel();
  if (events.length === 0) return null;
  return (
    <section aria-labelledby="recent-h">
      <SectionHead
        id="recent-h"
        title="Recent events"
        right={
          (edges.prev || edges.next) && (
            <div className="flex gap-2">
              <IconButton icon="back" label="Earlier events" onClick={() => go(-1)} disabled={!edges.prev} />
              <IconButton icon="chevronRight" label="More events" onClick={() => go(1)} disabled={!edges.next} />
            </div>
          )
        }
      />
      <div ref={ref} className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-4 px-4 md:mx-0 md:scroll-px-0 md:px-0">
        {events.map((e) => (
          <div key={e.event_id} className="w-[85%] shrink-0 snap-start sm:w-[calc(50%-8px)] lg:w-[calc((100%-32px)/3)]">
            <EventCard event={e} site={site} />
          </div>
        ))}
      </div>
    </section>
  );
}

function Rail({ site }: { site: SiteData }) {
  const [topic, setTopic] = useState("All");
  const [mode, setMode] = useState<"trending" | "latest">("trending");
  const topics = useMemo(() => ["All", ...new Set(site.events.map((e) => categoryOf(e.event_type)))], [site]);
  const items = useMemo(() => {
    // "All" means news: control days only appear when their own topic is picked.
    const pool = site.events.filter((e) => (topic === "All" ? e.event_type !== "RANDOM_DATE" : categoryOf(e.event_type) === topic));
    const latest = (a: SiteEvent, b: SiteEvent) => b.date.localeCompare(a.date) || a.event_id.localeCompare(b.event_id);
    // "Trending" here means the events that feed the most claims, newest first among equals.
    const trending = (a: SiteEvent, b: SiteEvent) => b.claims.filter((c) => c.effective).length - a.claims.filter((c) => c.effective).length || latest(a, b);
    return [...pool].sort(mode === "latest" ? latest : trending).slice(0, 8);
  }, [site, topic, mode]);
  return (
    <section aria-labelledby="feed-h">
      <h2 id="feed-h" className="sr-only">Feed</h2>
      <div className="mb-4 flex items-center justify-between gap-2">
        <label className="relative">
          <span className="sr-only">Topic</span>
          <select
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="appearance-none bg-transparent pr-6 text-[15px] font-bold text-fg"
          >
            {topics.map((t) => (
              <option key={t} value={t} className="bg-surface">
                {t}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-muted">
            <Icon name="chevronDown" size={16} />
          </span>
        </label>
        <Segmented
          label="Order"
          value={mode}
          onChange={setMode}
          options={[
            { value: "trending", label: "Trending" },
            { value: "latest", label: "Latest" },
          ]}
        />
      </div>
      <ul>
        {items.map((e) => (
          <FeedItem key={e.event_id} event={e} site={site} />
        ))}
        {items.length === 0 && <li className="text-sm text-muted">No events yet.</li>}
      </ul>
      <Link to="/feed" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline">
        Open the full feed <Icon name="chevronRight" size={14} />
      </Link>
    </section>
  );
}

function HomeBody({ site }: { site: SiteData }) {
  return (
    <>
      <h1 className="mb-8 max-w-3xl text-3xl font-extrabold leading-[1.1] tracking-tight md:text-[44px]">
        Does news really move markets? Spillover tests it in public.
      </h1>
      <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-12">
          <Trending site={site} />
          <Recent site={site} />
          <HowItWorks />
          <NodeLegend />
        </div>
        <aside aria-label="Feed" className="min-w-0 border-line xl:sticky xl:top-20 xl:self-start xl:border-l xl:pl-6">
          <Rail site={site} />
        </aside>
      </div>
    </>
  );
}

export default function Home() {
  return <Ready>{(site) => <HomeBody site={site} />}</Ready>;
}
