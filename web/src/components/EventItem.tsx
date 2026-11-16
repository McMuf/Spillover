import { Link } from "react-router-dom";
import type { SiteData, SiteEvent } from "../generated/site";
import { categoryOf, eventTitle } from "../lib/plain";
import { Icon } from "./Icon";
import { Logo } from "./Logo";
import { tint } from "./ui";
import { Tag, TickerChip } from "./ui";

/** One event in a feed: who, what, when, and the markets (claims) it touches. */
export function EventItem({ event, site }: { event: SiteEvent; site: SiteData }) {
  const cat = categoryOf(event.event_type);
  const symbols = [...new Set(event.claims.map((c) => site.claims.find((x) => x.claim.id === c.claim_id)?.claim.instrument.symbol).filter((s): s is string => !!s))];
  const entity = event.entities[0] ?? "—";
  return (
    <li className="relative border-t border-line py-4 first:border-t-0">
      <div className="flex items-center gap-3">
        {entity === "NONE" ? (
          <span style={tint(cat.hue, 16)} aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border">
            <Icon name="calendar" size={18} />
          </span>
        ) : (
          <Logo symbol={entity} size={40} />
        )}
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <Link to={`/events/${event.event_id}`} className="font-bold after:absolute after:inset-0 after:content-['']">
              {eventTitle(event)}
            </Link>
            <Tag hue={cat.hue}>{cat.name}</Tag>
          </p>
          <p className="text-xs text-muted">
            {event.date} · {event.scheduled ? "scheduled" : "unscheduled"} · {event.source}
          </p>
        </div>
      </div>
      {symbols.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 pl-[52px]">
          {symbols.map((s) => (
            <TickerChip key={s} symbol={s} hue={cat.hue} />
          ))}
        </div>
      )}
    </li>
  );
}
