import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Logo } from "../components/Logo";
import { Ready } from "../components/Ready";
import { NewsImage } from "../components/NewsImage";
import { UpcomingStrip } from "../components/UpcomingStrip";
import { ActionLink, Segmented, Tag, TickerChip } from "../components/ui";
import type { SiteData } from "../generated/site";
import { claimsFor, ORIGIN_TAG, storySentence, storyTitle, type Origin, type Story } from "../lib/news";
import { HeadlineActions } from "../components/HeadlineActions";
import { SourceIcon } from "../components/SourceIcon";
import { useLiveNews, type LiveNews } from "../lib/liveNews";
import { eventLabel } from "../lib/plain";

type Filter = "all" | Origin;
type Headline = SiteData["headlines"][number];
const ORDER: Origin[] = ["calendar", "filings", "headlines", "prices"];
const FILTER_LABEL: Record<Origin, string> = {
  calendar: "Fed & macro",
  filings: "Company filings",
  headlines: "Headlines",
  prices: "Price moves",
  control: "Control",
};

function ago(iso: string, now: number): string {
  const mins = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

// --- Latest headlines ---------------------------------------------------------------------------

/** "Testable · a CEO or CFO leaves · NVDA" plus a way to start a claim, when the labeler matched a type. */
function Testable({ h }: { h: Headline }) {
  if (h.event_type === "NONE") return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <Tag>Testable</Tag>
      <span className="text-xs text-muted">{eventLabel(h.event_type)}</span>
      {h.entities.map((e) => (
        <TickerChip key={e} symbol={e} />
      ))}
      <Link to={`/submit?eventType=${encodeURIComponent(h.event_type)}`} className="text-xs font-semibold text-accent hover:underline">
        Write a claim about events like this
      </Link>
    </div>
  );
}

/** The headline links to the article; hovering it, or its "Claim ideas" button, offers to make a claim. */
function HeadlineLink({ h, className = "" }: { h: Headline; className?: string }) {
  return (
    <HeadlineActions h={h} className={className}>
      {h.title}
    </HeadlineActions>
  );
}

function Meta({ h, now }: { h: Headline; now: number }) {
  return (
    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
      <SourceIcon domain={h.domain} size={16} />
      <span className="min-w-0 truncate">
        {h.domain.replace(/^www\./, "")} · <time dateTime={h.seen_at}>{ago(h.seen_at, now)}</time>
      </span>
    </p>
  );
}

function Headlines({ live }: { live: LiveNews }) {
  const now = live.updatedAt ?? Date.now();
  const list = live.headlines;
  const newest = list.reduce((m, h) => (h.seen_at > m ? h.seen_at : m), "");
  const testable = list.filter((h) => h.event_type !== "NONE").length;
  // Pictures that failed to load; the lead moves on to a story whose picture works.
  const [broken, setBroken] = useState<Set<string>>(() => new Set());
  const markBroken = useCallback((src: string) => setBroken((b) => (b.has(src) ? b : new Set(b).add(src))), []);
  // The lead is the newest headline with a working picture and a readable title, testable ones
  // first; else any with a picture; else simply the newest.
  const pictured = list.filter((h) => h.image && !broken.has(h.image));
  const readable = pictured.filter((h) => h.title.length <= 110);
  const lead =
    readable.find((h) => h.event_type !== "NONE") ?? readable[0] ?? pictured[0] ?? list[0];
  const rest = list.filter((h) => h !== lead);
  const cut = Math.ceil(rest.length * 0.6);
  const [main, side] = [rest.slice(0, cut), rest.slice(cut)];
  return (
    <div>
      <p className="mb-6 max-w-3xl text-sm leading-relaxed text-muted">
        <span className="mr-2 inline-flex items-center gap-1.5 font-semibold text-fg">
          <span className="relative inline-block h-2 w-2">
            {live.source === "live" && <span className="live-halo absolute inset-0 rounded-full bg-positive" />}
            <span className={`absolute inset-0 rounded-full ${live.source === "live" ? "bg-positive" : "bg-muted"}`} />
          </span>
          {live.source === "live" ? "Live" : newest ? `Updated ${ago(newest, Date.now())}` : "From the last build"}
        </span>
        The last hour of market news from outlets worldwide, picked by topic, refreshed every hour
        {live.source === "live" ? " and every few minutes while this page is open" : ""}. Pictures load from
        each publisher. A headline marked <span className="font-semibold text-fg">testable</span> matches a kind of event that claims can be tested on (
        {testable} of {list.length} right now). Tags come from a free automatic labeler and can be wrong;{" "}
        <Link to="/label" className="text-accent underline underline-offset-2">
          help check them
        </Link>
        .
      </p>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          {lead && (
            <article className={`border-b border-line pb-6 ${live.fresh.has(lead.headline_id) ? "arrive" : ""}`}>
              {lead.image && (
                <a href={lead.url} target="_blank" rel="noopener noreferrer nofollow" tabIndex={-1} aria-hidden="true">
                  <NewsImage key={lead.image} src={lead.image} domain={lead.domain} onFail={markBroken} className="mb-4 aspect-[2/1] max-h-[380px] w-full rounded-2xl" />
                </a>
              )}
              <h2 className="text-[26px] font-extrabold leading-tight md:text-[30px]">
                <HeadlineLink h={lead} />
              </h2>
              <Meta h={lead} now={now} />
              <Testable h={lead} />
            </article>
          )}
          <ul>
            {main.map((h) => (
              <li key={h.headline_id} className={`flex gap-4 border-b border-line py-4 ${live.fresh.has(h.headline_id) ? "arrive" : ""}`}>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[17px] font-bold leading-snug">
                    <HeadlineLink h={h} />
                  </h3>
                  <Meta h={h} now={now} />
                  <Testable h={h} />
                </div>
                {h.image && (
                  <a href={h.url} target="_blank" rel="noopener noreferrer nofollow" tabIndex={-1} aria-hidden="true" className="shrink-0">
                    <NewsImage src={h.image} domain={h.domain} className="h-20 w-28 rounded-xl md:h-24 md:w-36" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
        {side.length > 0 && (
          <aside aria-label="More headlines" className="min-w-0">
            <h2 className="mb-1 text-[17px] font-bold">More news</h2>
            <ul>
              {side.map((h) => (
                <li key={h.headline_id} className={`flex gap-3 border-b border-line py-3 ${live.fresh.has(h.headline_id) ? "arrive" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <HeadlineLink h={h} className="text-sm font-semibold leading-snug" />
                    <Meta h={h} now={now} />
                    <Testable h={h} />
                  </div>
                  {h.image && (
                    <a href={h.url} target="_blank" rel="noopener noreferrer nofollow" tabIndex={-1} aria-hidden="true" className="shrink-0">
                      <NewsImage src={h.image} domain={h.domain} className="h-14 w-20 rounded-lg" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>
      <p className="mt-6 text-xs text-muted">
        Headlines via the{" "}
        <a href="https://www.gdeltproject.org/" className="underline" rel="noopener noreferrer">
          GDELT Project
        </a>
        . Spillover links to articles and never copies them; pictures are each article's own preview image, shown from the
        publisher's site. These headlines are shown only; they do not enter the record until the labeler's measured
        accuracy on general news holds up.
      </p>
    </div>
  );
}

// --- On the record ------------------------------------------------------------------------------

function StoryItem({ story, site }: { story: Story; site: SiteData }) {
  const entity = story.entities[0];
  const claims = claimsFor(site, story);
  return (
    <li className="border-b border-line py-5">
      <div className="flex gap-4">
        <div className="min-w-0 flex-1">
          <p className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted">
            <Tag>{ORIGIN_TAG[story.origin]}</Tag>
            <time dateTime={story.date}>{story.date}</time>
          </p>
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
        {/* Where a news site puts a thumbnail: who the story is about. */}
        <div aria-hidden="true" className="hidden shrink-0 sm:block">
          {entity && <Logo symbol={entity} size={56} />}
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
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0">
        <p className="mb-5 max-w-3xl text-sm leading-relaxed text-muted">
          Events in the record: from official calendars, company SEC filings and labeled headlines. These are what claims
          are tested on. Each opens to what happened, what past events like it did to markets, who is involved, and the
          measured data.
        </p>
        {options.length > 2 && (
          <div className="no-scrollbar mb-2 overflow-x-auto">
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
      <aside aria-label="About the record" className="min-w-0 lg:sticky lg:top-24 lg:self-start">
        <section aria-labelledby="record-about-h" className="rounded-[20px] bg-surface p-5">
          <h2 id="record-about-h" className="text-[17px] font-bold">
            Where these come from
          </h2>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted">
            <li>
              <span className="font-semibold text-fg">Scheduled:</span> Fed decisions, inflation and jobs reports, known in
              advance.
            </li>
            <li>
              <span className="font-semibold text-fg">SEC filing:</span> company 8-Ks whose item number says what happened.
            </li>
            <li>
              <span className="font-semibold text-fg">Headline:</span> labeled automatically; a sample is checked by people.
            </li>
          </ul>
          <div className="mt-4">
            <ActionLink to="/label" variant="secondary" icon={null}>
              Help check the labels
            </ActionLink>
          </div>
        </section>
      </aside>
    </div>
  );
}

type View = "headlines" | "record";

function News({ site }: { site: SiteData }) {
  const live = useLiveNews(site);
  const [view, setView] = useState<View>("headlines");
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl font-extrabold tracking-tight">News</h1>
        <Segmented
          label="Which news"
          value={view}
          onChange={setView}
          options={[
            { value: "headlines", label: `Latest headlines (${live.headlines.length})` },
            { value: "record", label: `On the record (${site.news.length})` },
          ]}
        />
      </div>
      <UpcomingStrip site={site} />
      {view === "headlines" ? (
        live.headlines.length > 0 ? (
          <Headlines live={live} />
        ) : (
          <p className="text-muted" role="status">
            {live.checked ? "No headlines right now. They are fetched live while this page is open." : "Loading the latest headlines…"}
          </p>
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
