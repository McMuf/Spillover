import { Link } from "react-router-dom";
import type { SiteData, SiteEvent } from "../generated/site";
import { entityName, eventSentence } from "../lib/plain";
import { Icon } from "./Icon";
import { Logo } from "./Logo";
import { TickerChip } from "./ui";

/** A feed post: who, when, one plain sentence, and the markets it touches. */
export function FeedItem({ event, site }: { event: SiteEvent; site: SiteData }) {
  const entity = event.entities[0];
  const claims = event.claims
    .map((ec) => site.claims.find((x) => x.claim.id === ec.claim_id)?.claim)
    .filter((c): c is NonNullable<typeof c> => !!c);
  return (
    <li className="border-t border-line py-4 first:border-t-0 first:pt-0">
      <div className="flex items-center gap-3">
        {entity && entity !== "NONE" ? (
          <Logo symbol={entity} size={36} />
        ) : (
          <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-alt text-muted">
            <Icon name="calendar" size={16} />
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-[15px] font-bold">{entityName(event)}</p>
          <p className="text-xs text-muted">{event.date}</p>
        </div>
      </div>
      <p className="mt-2 text-[15px] leading-relaxed">
        <Link to={`/events/${event.event_id}`} className="hover:underline">
          {eventSentence(event)}
        </Link>
      </p>
      {claims.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {claims.map((c) => (
            <TickerChip key={c.id} symbol={c.instrument.symbol} to={`/claims/${c.id}`} />
          ))}
        </div>
      )}
    </li>
  );
}
