import { useMemo } from "react";
import { EventItem } from "../components/EventItem";
import { Ready } from "../components/Ready";
import { Tag } from "../components/ui";
import type { SiteData } from "../generated/site";
import { categoryOf } from "../lib/plain";

function Feed({ site }: { site: SiteData }) {
  const columns = useMemo(() => {
    const sorted = [...site.events].sort((a, b) => b.date.localeCompare(a.date) || a.event_id.localeCompare(b.event_id));
    const by = new Map<string, { cat: ReturnType<typeof categoryOf>; items: typeof sorted }>();
    for (const e of sorted) {
      const cat = categoryOf(e.event_type);
      const col = by.get(cat.name) ?? { cat, items: [] };
      col.items.push(e);
      by.set(cat.name, col);
    }
    return [...by.values()].sort((a, b) => b.items.length - a.items.length);
  }, [site]);

  return (
    <>
      <h1 className="mb-1 text-3xl font-extrabold">Feed</h1>
      <p className="mb-6 max-w-2xl text-sm text-muted">
        Dated, sourced events the claims are tested on, grouped by topic and newest first. Each one lists the markets it touches.
      </p>
      <div className="grid gap-4 lg:grid-cols-3">
        {columns.map(({ cat, items }) => (
          <section key={cat.name} aria-label={cat.name} className="rounded-xl border border-line bg-surface p-4">
            <h2 className="mb-1 flex items-center gap-2 text-lg font-bold">
              {cat.name}
              <Tag hue={cat.hue}>{items.length}</Tag>
            </h2>
            <ul>
              {items.slice(0, 12).map((e) => (
                <EventItem key={e.event_id} event={e} site={site} />
              ))}
            </ul>
            {items.length > 12 && <p className="mt-2 text-xs text-muted">Showing the latest 12 of {items.length}.</p>}
          </section>
        ))}
        {columns.length === 0 && <p className="text-muted">No events yet.</p>}
      </div>
    </>
  );
}

export default function FeedPage() {
  return <Ready>{(site) => <Feed site={site} />}</Ready>;
}
