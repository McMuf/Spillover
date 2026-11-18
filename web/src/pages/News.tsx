import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Logo } from "../components/Logo";
import { Ready } from "../components/Ready";
import { Segmented, Tag, TickerChip } from "../components/ui";
import type { SiteData } from "../generated/site";
import { claimsFor, ORIGIN_TAG, storySentence, storyTitle, type Origin, type Story } from "../lib/news";

type Filter = "all" | Origin;
const ORDER: Origin[] = ["calendar", "filings", "headlines", "prices"];
const FILTER_LABEL: Record<Origin, string> = {
  calendar: "Fed & macro",
  filings: "Company filings",
  headlines: "Headlines",
  prices: "Price moves",
  control: "Control",
};

function StoryItem({ story, site }: { story: Story; site: SiteData }) {
  const entity = story.entities[0];
  const claims = claimsFor(site, story);
  return (
    <li className="border-t border-line py-5 first:border-t-0 first:pt-0">
      <div className="flex gap-3">
        {entity ? (
          <Logo symbol={entity} size={40} />
        ) : (
          <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-alt text-muted">
            <Icon name="calendar" size={18} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted">
            <Tag>{ORIGIN_TAG[story.origin]}</Tag>
            <time dateTime={story.date}>{story.date}</time>
          </div>
          <h2 className="text-[17px] font-bold leading-snug">
            <Link to={`/events/${story.event_id}`} className="hover:underline">
              {storyTitle(story)}
            </Link>
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">{storySentence(story)}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {claims.length > 0 ? (
              <>
                <span className="text-xs text-muted">
                  Tests {claims.length} claim{claims.length === 1 ? "" : "s"}:
                </span>
                {claims.map((c) => (
                  <TickerChip key={c.claim.id} symbol={c.claim.instrument.symbol} to={`/claims/${c.claim.id}`} />
                ))}
              </>
            ) : (
              <span className="text-xs text-muted">No claim tests events like this yet</span>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

function News({ site }: { site: SiteData }) {
  const [filter, setFilter] = useState<Filter>("all");
  const present = useMemo(() => ORDER.filter((o) => site.news.some((s) => s.origin === o)), [site]);
  const shown = useMemo(() => site.news.filter((s) => filter === "all" || s.origin === filter), [site, filter]);
  const options = [{ value: "all" as Filter, label: "All" }, ...present.map((o) => ({ value: o as Filter, label: FILTER_LABEL[o] }))];

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-3xl font-extrabold tracking-tight">News</h1>
      <p className="mb-6 text-[15px] leading-relaxed text-muted">
        Real events from official calendars, company SEC filings and news headlines. Each one opens to what happened, what
        past events like it did to markets, who is involved, and the measured data. Spillover links to sources and never
        copies articles.{" "}
        <Link to="/label" className="text-accent underline underline-offset-2">
          Help check the headline labels
        </Link>
      </p>
      {options.length > 2 && (
        <div className="mb-6 overflow-x-auto">
          <Segmented label="Show news from" value={filter} onChange={setFilter} options={options} />
        </div>
      )}
      {shown.length > 0 ? (
        <ul>
          {shown.map((s) => (
            <StoryItem key={s.event_id} story={s} site={site} />
          ))}
        </ul>
      ) : (
        <p className="text-muted">No events in the last few months yet.</p>
      )}
    </div>
  );
}

export default function NewsPage() {
  return <Ready>{(site) => <News site={site} />}</Ready>;
}
