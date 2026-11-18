import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Logo } from "../components/Logo";
import { Ready } from "../components/Ready";
import { Segmented, Tag, TickerChip } from "../components/ui";
import type { SiteData } from "../generated/site";
import { claimsFor, ORIGIN_TAG, storySentence, storyTitle, type Origin, type Story } from "../lib/news";
import { eventLabel } from "../lib/plain";

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

function OnRecord({ site }: { site: SiteData }) {
  const [filter, setFilter] = useState<Filter>("all");
  const present = useMemo(() => ORDER.filter((o) => site.news.some((s) => s.origin === o)), [site]);
  const shown = useMemo(() => site.news.filter((s) => filter === "all" || s.origin === filter), [site, filter]);
  const options = [{ value: "all" as Filter, label: "All" }, ...present.map((o) => ({ value: o as Filter, label: FILTER_LABEL[o] }))];

  return (
    <div>
      <p className="mb-6 text-sm leading-relaxed text-muted">
        Events in the record: from official calendars, company SEC filings and labeled headlines. These are what claims
        are tested on. Each opens to what happened, what past events like it did to markets, who is involved, and the
        measured data.
      </p>
      {options.length > 2 && (
        <div className="mb-6 overflow-x-auto">
          <Segmented label="Show news from" value={filter} onChange={setFilter} options={options} />
        </div>
      )}
      {site.upcoming.length > 0 && (
        <section aria-labelledby="upcoming-h" className="mb-8 rounded-2xl bg-surface p-5">
          <h2 id="upcoming-h" className="mb-3 text-[17px] font-bold">Coming up</h2>
          <ul className="space-y-2 text-sm">
            {site.upcoming.map((s) => (
              <li key={s.event_id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <Link to={`/events/${s.event_id}`} className="hover:underline">
                  {storyTitle(s)}
                </Link>
                <span className="text-xs text-muted">
                  <time dateTime={s.date}>{s.date}</time>
                  {s.claim_ids.length > 0 && ` · ${s.claim_ids.length} claim${s.claim_ids.length === 1 ? "" : "s"} waiting`}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">
            Scheduled in advance. Predictions for these are frozen and timestamped before they happen.
          </p>
        </section>
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


function ago(iso: string, now: number): string {
  const mins = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

function Headlines({ site }: { site: SiteData }) {
  const now = useMemo(() => Date.now(), []);
  const testable = site.headlines.filter((h) => h.event_type !== "NONE").length;
  return (
    <div>
      <p className="mb-6 text-sm leading-relaxed text-muted">
        The latest market news from outlets worldwide, refreshed every time the site rebuilds. A headline marked{" "}
        <span className="font-semibold text-fg">testable</span> matches a kind of event that claims can be tested on
        ({testable} of {site.headlines.length} right now). Tags come from a free automatic labeler and can be wrong;{" "}
        <Link to="/label" className="text-accent underline underline-offset-2">
          help check them
        </Link>
        .
      </p>
      <ul>
        {site.headlines.map((h) => (
          <li key={h.headline_id} className="border-t border-line py-4 first:border-t-0 first:pt-0">
            <p className="mb-1 text-xs text-muted">
              {h.domain} · <time dateTime={h.seen_at}>{ago(h.seen_at, now)}</time>
            </p>
            <h2 className="text-[16px] font-semibold leading-snug">
              <a href={h.url} target="_blank" rel="noopener noreferrer nofollow" className="hover:underline">
                {h.title}
              </a>
            </h2>
            {h.event_type !== "NONE" && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Tag>Testable</Tag>
                <span className="text-xs text-muted">{eventLabel(h.event_type)}</span>
                {h.entities.map((e) => (
                  <TickerChip key={e} symbol={e} />
                ))}
                <Link
                  to={`/submit?eventType=${encodeURIComponent(h.event_type)}`}
                  className="text-xs font-semibold text-accent hover:underline"
                >
                  Write a claim about events like this
                </Link>
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-6 text-xs text-muted">
        Headlines via the{" "}
        <a href="https://www.gdeltproject.org/" className="underline" rel="noopener noreferrer">
          GDELT Project
        </a>
        . Spillover links to articles and never copies them. These headlines are shown only; they do not enter the record
        until the labeler's measured accuracy on general news holds up.
      </p>
    </div>
  );
}

type View = "headlines" | "record";

function News({ site }: { site: SiteData }) {
  const [view, setView] = useState<View>(site.headlines.length > 0 ? "headlines" : "record");
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-4 text-3xl font-extrabold tracking-tight">News</h1>
      <div className="mb-6">
        <Segmented
          label="Which news"
          value={view}
          onChange={setView}
          options={[
            { value: "headlines", label: `Latest headlines (${site.headlines.length})` },
            { value: "record", label: `On the record (${site.news.length})` },
          ]}
        />
      </div>
      {view === "headlines" ? (
        site.headlines.length > 0 ? (
          <Headlines site={site} />
        ) : (
          <p className="text-muted">No live headlines in this build. They are fetched each time the site rebuilds.</p>
        )
      ) : (
        <OnRecord site={site} />
      )}
    </div>
  );
}

export default function NewsPage() {
  return <Ready>{(site) => <News site={site} />}</Ready>;
}
