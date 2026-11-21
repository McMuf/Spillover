import * as Tabs from "@radix-ui/react-tabs";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Discussion } from "../components/Discussion";
import { Logo } from "../components/Logo";
import { commentsOn, discussionTerm } from "../lib/community";
import { Ready } from "../components/Ready";
import { BackButton, Card, TAB_CLASS, Tag, TickerChip } from "../components/ui";
import type { SiteData } from "../generated/site";
import { NAME_BY_SYMBOL } from "../lib/brands";
import {
  claimsAboutType,
  claimsFor,
  findStory,
  measuredValue,
  measurements,
  ORIGIN_TAG,
  originNote,
  pastEvents,
  storySentence,
  storyTitle,
  type Story,
} from "../lib/news";
import { eventLabel, shortHeadline, shortName, whatPastDataSays } from "../lib/plain";

const LINK = "text-accent underline underline-offset-2";
const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

function About({ story }: { story: Story }) {
  return (
    <div className="space-y-6">
      <Card title="What happened" id="about-what" kicker={{ icon: "news", label: "About" }}>
        <p className="text-[15px] leading-relaxed">{storySentence(story)}</p>
        <p className="mt-3 text-sm leading-relaxed text-muted">{originNote(story.origin)}</p>
      </Card>
      <Card title="Sources" id="about-sources" kicker={{ icon: "external", label: "Linked, never copied" }}>
        <ul className="space-y-3">
          {story.sources.map((s, i) => (
            <li key={`${s.url ?? s.source}-${i}`} className="text-sm">
              {s.url ? (
                <a href={s.url} target="_blank" rel="noopener noreferrer" className={LINK}>
                  {s.title ?? s.url}
                </a>
              ) : (
                <span>{s.title ?? s.source}</span>
              )}
              <span className="block text-xs text-muted">
                {s.source}
                {s.published_at && <>, {new Date(s.published_at).toUTCString().replace(":00 GMT", " UTC")}</>}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-muted">Spillover links to sources and never copies articles.</p>
      </Card>
    </div>
  );
}

function Implications({ story, site }: { story: Story; site: SiteData }) {
  const claims = claimsAboutType(site, story.event_type);
  if (claims.length === 0) {
    return (
      <Card title="No claim tests events like this yet" id="impl-none">
        <p className="text-sm leading-relaxed text-muted">
          Nobody has registered a testable claim about what happens to markets when {eventLabel(story.event_type)}. A
          claim says which market moves, which way and how fast, before the next event happens; it is then graded on
          every new one.
        </p>
        <Link
          to={`/submit?eventType=${encodeURIComponent(story.event_type)}`}
          className="btn mt-4 inline-block bg-fg px-5 py-2 text-sm font-semibold text-bg"
        >
          Write a claim about events like this
        </Link>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-muted">
        What past events like this one did to markets, according to each registered claim. History is practice: a claim
        only counts once it holds up on new events.
      </p>
      {claims.map((c) => {
        const v = whatPastDataSays(c);
        const triggered = story.claim_ids.includes(c.claim.id);
        return (
          <article key={c.claim.id} className="bg-surface p-5">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <TickerChip symbol={c.claim.instrument.symbol} to={`/claims/${c.claim.id}`} />
              <Tag>{c.status}</Tag>
              {!triggered && <span className="text-xs text-muted">Not triggered by this event</span>}
            </div>
            <h2 className="text-[17px] font-bold leading-snug">
              <Link to={`/claims/${c.claim.id}`} className="hover:underline">
                {shortHeadline(c)}
              </Link>
            </h2>
            <p className="mt-2 text-sm leading-relaxed">{v.headline}.</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">{v.detail}</p>
          </article>
        );
      })}
    </div>
  );
}

function Stakeholders({ story, site }: { story: Story; site: SiteData }) {
  const markets = [...new Set(claimsFor(site, story).map((c) => c.claim.instrument.symbol))];
  const priced = new Set(site.meta.priced_symbols);
  return (
    <div className="space-y-6">
      <Card title="Who it is about" id="who" kicker={{ icon: "people", label: "Stakeholders" }}>
        {story.entities.length === 0 ? (
          <p className="text-sm text-muted">No single company or institution is named.</p>
        ) : (
          <ul className="space-y-3">
            {story.entities.map((e) => (
              <li key={e} className="flex items-center gap-3">
                <Logo symbol={e} size={36} />
                <div className="min-w-0">
                  <p className="font-semibold">{NAME_BY_SYMBOL[e] ?? e}</p>
                  <p className="text-xs text-muted">
                    <span className="font-mono">{e}</span>
                    {priced.has(e) ? ", priced daily" : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Markets being watched" id="markets-watched" kicker={{ icon: "trend", label: "From registered claims" }}>
        {markets.length === 0 ? (
          <p className="text-sm text-muted">No registered claim watches a market for this kind of event yet.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {markets.map((m) => (
                <TickerChip key={m} symbol={m} />
              ))}
            </div>
            <p className="mt-3 text-xs text-muted">Markets that a registered claim says this event should move.</p>
          </>
        )}
      </Card>
    </div>
  );
}

const STATUS_WORDS = { open: "window still open", closed: "window closed, waiting to be graded", graded: "graded" } as const;

function Data({ story, site }: { story: Story; site: SiteData }) {
  const rows = measurements(site, story);
  if (rows.length === 0) {
    return (
      <Card title="No measurements" id="data-none">
        <p className="text-sm text-muted">No registered claim measures this event, so there is nothing to show yet.</p>
      </Card>
    );
  }
  return (
    <div className="space-y-6">
      {rows.map(({ claim, forward, value, counted }) => {
        const past = pastEvents(site, claim, story.date);
        return (
          <section key={claim.claim.id} aria-labelledby={`data-${claim.claim.id}`} className="bg-surface p-5">
            <h2 id={`data-${claim.claim.id}`} className="text-[17px] font-bold leading-snug">
              {capitalize(shortName(claim.claim.instrument.symbol))}:{" "}
              <Link to={`/claims/${claim.claim.id}`} className="font-normal text-muted hover:underline">
                {shortHeadline(claim)}
              </Link>
            </h2>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted">This event</dt>
                <dd className={`text-xl font-bold ${counted ? measuredValue(claim, value).cls : "text-muted"}`}>
                  {counted ? measuredValue(claim, value).text : "Not measured yet"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Forward prediction</dt>
                <dd>
                  {forward ? (
                    <>
                      Frozen {forward.created_at.slice(0, 10)}, {STATUS_WORDS[forward.status]}
                      {forward.proof === "present" ? ", with its timestamp proof" : ""}
                    </>
                  ) : (
                    <span className="text-muted">None: the event came before the claim was registered</span>
                  )}
                </dd>
              </div>
            </dl>
            {past.length > 0 && (
              <div className="mt-5">
                <h3 className="mb-2 text-[13px] font-medium text-muted">Earlier events like this</h3>
                <table className="w-full text-sm">
                  <caption className="sr-only">Measured value for earlier events of the same type</caption>
                  <thead>
                    <tr className="text-left text-xs text-muted">
                      <th scope="col" className="py-1 font-medium">Date</th>
                      <th scope="col" className="py-1 text-right font-medium">Measured</th>
                    </tr>
                  </thead>
                  <tbody>
                    {past.map(({ event, value: v }) => (
                      <tr key={event.event_id} className="border-t border-line">
                        <td className="py-1.5">
                          <Link to={`/events/${event.event_id}`} className="hover:underline">
                            {event.date}
                          </Link>
                        </td>
                        <td className={`py-1.5 text-right font-mono ${measuredValue(claim, v).cls}`}>
                          {measuredValue(claim, v).text}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function StoryPage({ story, site }: { story: Story; site: SiteData }) {
  const [tab, setTab] = useState("about");
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <BackButton to="/news" label="Back to the news" />
      <header>
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted">
          <Tag>{ORIGIN_TAG[story.origin]}</Tag>
          <time dateTime={story.date}>{story.date}</time>
        </div>
        <h1 className="text-[28px] font-extrabold leading-tight md:text-[34px]">{storyTitle(story)}</h1>
      </header>
      <Tabs.Root value={tab} onValueChange={setTab} className="min-w-0">
        <Tabs.List aria-label="Story sections" className="no-scrollbar mb-6 flex gap-7 overflow-x-auto border-b border-line">
          <Tabs.Trigger value="about" className={TAB_CLASS}>About</Tabs.Trigger>
          <Tabs.Trigger value="implications" className={TAB_CLASS}>Market implications</Tabs.Trigger>
          <Tabs.Trigger value="stakeholders" className={TAB_CLASS}>Stakeholders</Tabs.Trigger>
          <Tabs.Trigger value="data" className={TAB_CLASS}>Data</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="about"><About story={story} /></Tabs.Content>
        <Tabs.Content value="implications"><Implications story={story} site={site} /></Tabs.Content>
        <Tabs.Content value="stakeholders"><Stakeholders story={story} site={site} /></Tabs.Content>
        <Tabs.Content value="data"><Data story={story} site={site} /></Tabs.Content>
      </Tabs.Root>
      <Discussion term={discussionTerm("event", story.event_id)} label="story" comments={commentsOn(site.community, discussionTerm("event", story.event_id))} />
    </div>
  );
}

export default function EventPage() {
  const { id } = useParams();
  return (
    <Ready>
      {(site) => {
        const story = findStory(site, id);
        if (!story) {
          return (
            <p>
              No event named <code className="font-mono">{id}</code>. <Link className="underline" to="/news">Back to the news</Link>.
            </p>
          );
        }
        return <StoryPage story={story} site={site} />;
      }}
    </Ready>
  );
}
