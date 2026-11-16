import { useMemo, useState, type CSSProperties } from "react";
import { FeedItem } from "../components/FeedItem";
import { Ready } from "../components/Ready";
import { Segmented } from "../components/ui";
import type { SiteData, SiteEvent } from "../generated/site";
import { categoryOf } from "../lib/plain";

const latest = (a: SiteEvent, b: SiteEvent) => b.date.localeCompare(a.date) || a.event_id.localeCompare(b.event_id);
const trending = (a: SiteEvent, b: SiteEvent) => b.claims.filter((c) => c.effective).length - a.claims.filter((c) => c.effective).length || latest(a, b);

function Column({ topic, events, site }: { topic: string; events: SiteEvent[]; site: SiteData }) {
  const [mode, setMode] = useState<"trending" | "latest">("latest");
  const items = useMemo(() => [...events].sort(mode === "latest" ? latest : trending).slice(0, 12), [events, mode]);
  return (
    <section aria-label={topic} className="min-w-0 py-2 lg:px-6 lg:first:pl-0 lg:last:pr-0">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-bold">
          {topic} <span className="font-normal text-muted">{events.length}</span>
        </h2>
        <Segmented
          label={`Order of ${topic}`}
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
      </ul>
    </section>
  );
}

function Feed({ site }: { site: SiteData }) {
  const columns = useMemo(() => {
    const by = new Map<string, SiteEvent[]>();
    for (const e of site.events) {
      const t = categoryOf(e.event_type);
      by.set(t, [...(by.get(t) ?? []), e]);
    }
    // News topics first; the placebo control days go last.
    return [...by.entries()].sort((a, b) => Number(a[0] === "Control test") - Number(b[0] === "Control test") || b[1].length - a[1].length);
  }, [site]);

  return (
    <>
      <h1 className="mb-1 text-3xl font-extrabold tracking-tight">Feed</h1>
      <p className="mb-8 max-w-2xl text-[15px] text-muted">
        Dated, sourced events the claims are tested on, grouped by topic. Each one links to the markets it touches.
      </p>
      <div
        style={{ "--cols": Math.max(columns.length, 1) } as CSSProperties}
        className="grid gap-8 lg:grid-cols-[repeat(var(--cols),minmax(0,1fr))] lg:gap-0 lg:divide-x lg:divide-line"
      >
        {columns.map(([topic, events]) => (
          <Column key={topic} topic={topic} events={events} site={site} />
        ))}
        {columns.length === 0 && <p className="text-muted">No events yet.</p>}
      </div>
    </>
  );
}

export default function FeedPage() {
  return <Ready>{(site) => <Feed site={site} />}</Ready>;
}
