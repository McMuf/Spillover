import { Link } from "react-router-dom";
import { Ready } from "../components/Ready";
import { Card, SectionTabs, Tag } from "../components/ui";
import { NodeShape } from "../components/NodeShape";
import type { SiteData } from "../generated/site";

function Feed({ site }: { site: SiteData }) {
  const events = [...site.events].sort((a, b) => b.date.localeCompare(a.date) || a.event_id.localeCompare(b.event_id));
  const shown = events.slice(0, 40);
  return (
    <>
      <SectionTabs />
      <Card title="Feed" stamp={`As of ${site.meta.data_as_of}`}>
        <p className="mb-2 text-sm text-muted">
          Dated, sourced events the claims are tested on, newest first. Each links to the claims that use it.
        </p>
        <ul>
          {shown.map((e) => (
            <li key={e.event_id} className="border-t border-line first:border-t-0">
              <Link to={`/events/${e.event_id}`} className="flex items-center gap-3 py-4 hover:bg-surface-alt/40">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface-alt text-accent" aria-hidden="true">
                  <NodeShape type="event" size={22} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{e.event_type.replace(/_/g, " ").toLowerCase()}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    <span>{e.date}</span>
                    {e.entities.slice(0, 2).map((en) => (
                      <Tag key={en}>{en}</Tag>
                    ))}
                    {e.scheduled && <Tag>scheduled</Tag>}
                    <span>
                      {e.claims.length} claim{e.claims.length === 1 ? "" : "s"}
                    </span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
          {shown.length === 0 && <li className="py-4 text-muted">No events yet.</li>}
        </ul>
        {events.length > shown.length && (
          <p className="mt-2 text-xs text-muted">Showing the latest {shown.length} of {events.length} events.</p>
        )}
      </Card>
    </>
  );
}

export default function FeedPage() {
  return <Ready>{(site) => <Feed site={site} />}</Ready>;
}
