import { Link } from "react-router-dom";
import type { SiteData, SiteEvent } from "../generated/site";
import { claimStat } from "../lib/format";
import { categoryOf, eventHeadline, eventSentence } from "../lib/plain";
import { Stamp, TickerChip } from "./ui";

/** One event in the calendar row: what happened and which claims it counted toward. */
export function EventCard({ event, site }: { event: SiteEvent; site: SiteData }) {
  return (
    <article className="relative flex h-full flex-col rounded-2xl bg-surface p-5 transition-colors hover:bg-surface-alt">
      <Stamp>
        {event.date} · {categoryOf(event.event_type)}
      </Stamp>
      <h3 className="mt-2 text-lg font-bold leading-snug">
        <Link to={`/events/${event.event_id}`} className="after:absolute after:inset-0 after:content-['']">
          {eventHeadline(event)}
        </Link>
      </h3>
      <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-muted">{eventSentence(event)}</p>
      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        {event.claims.map((ec) => {
          const claim = site.claims.find((x) => x.claim.id === ec.claim_id)?.claim;
          if (!claim) return null;
          return (
            <TickerChip
              key={ec.claim_id}
              symbol={claim.instrument.symbol}
              value={ec.effective ? claimStat(claim.measure, ec.value).text : "not counted"}
              dir={ec.effective ? claimStat(claim.measure, ec.value).dir : "flat"}
              to={`/claims/${ec.claim_id}`}
            />
          );
        })}
      </div>
    </article>
  );
}
