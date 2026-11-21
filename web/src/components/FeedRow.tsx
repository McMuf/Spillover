import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { SiteData } from "../generated/site";
import { commentsOn, discussionTerm, isOwnDiscussion } from "../lib/community";
import type { FeedItem } from "../lib/feed";
import { claimStat } from "../lib/format";
import { ORIGIN_TAG, storySentence, storyTitle } from "../lib/news";
import { entityName, eventLabel, highlightTerms, shortHeadline, whatWeTest } from "../lib/plain";
import { BrandMark } from "./BrandMark";
import { HeadlineActions } from "./HeadlineActions";
import { Highlight } from "./Highlight";
import { Icon } from "./Icon";
import { Identicon } from "./Identicon";
import { Logo } from "./Logo";
import { NewsImage } from "./NewsImage";
import { SourceIcon } from "./SourceIcon";
import { PersonLink } from "./PersonLink";
import { Ticker } from "./Ticker";
import { TickerChip } from "./ui";

export function ago(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const mins = Math.round((now - t) / 60000);
  if (mins < 0) return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** The label at the right of a row, like "Briefing" or "Testable". */
function Label({ children }: { children: ReactNode }) {
  return <span className="shrink-0 bg-surface-alt px-2.5 py-0.5 text-xs font-medium text-muted">{children}</span>;
}

function Row({
  avatar,
  name,
  when,
  label,
  children,
  chips,
  fresh,
}: {
  avatar: ReactNode | null;
  name: ReactNode;
  when: string;
  label: string;
  children: ReactNode;
  chips?: ReactNode;
  fresh?: boolean;
}) {
  return (
    <li className={`flex gap-3 border-b border-line py-5 ${fresh ? "arrive" : ""}`}>
      {avatar && <div className="w-10 shrink-0">{avatar}</div>}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="min-w-0 truncate text-[15px]">
            <span className="font-bold">{name}</span> <span className="text-sm text-muted">{when}</span>
          </p>
          <Label>{label}</Label>
        </div>
        <div className="mt-1">{children}</div>
        {chips && <div className="no-scrollbar -mr-4 mt-3 flex gap-2 overflow-x-auto pr-4">{chips}</div>}
      </div>
    </li>
  );
}


function SeeMore({ children, more }: { children: ReactNode; more: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {children}
      {open ? (
        more
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="mt-1 text-[15px] font-semibold text-accent hover:underline">
          See more
        </button>
      )}
    </>
  );
}

export function FeedRow({ item, site, fresh }: { item: FeedItem; site: SiteData; fresh?: boolean }) {
  switch (item.kind) {
    case "briefing":
      return (
        <Row
          avatar={
            <span aria-hidden="true" className="block overflow-hidden">
              <BrandMark size={40} />
            </span>
          }
          name="Spillover"
          when="today"
          label="Briefing"
          chips={item.symbols.map((s) => (
            <TickerChip key={s} symbol={s} />
          ))}
        >
          <SeeMore
            more={
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed">
                {item.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            }
          >
            <p className="text-[16px] leading-relaxed">{item.lead}</p>
          </SeeMore>
        </Row>
      );
    case "claim": {
      const it = item.claim;
      const c = it.claim;
      const b = it.backtest;
      const stat = claimStat(c.measure, b?.mean);
      const comments = commentsOn(site.community, discussionTerm("claim", c.id));
      return (
        <Row
          avatar={<Identicon handle={c.registered_by} size={40} />}
          name={<PersonLink handle={c.registered_by} className="hover:underline" />}
          when={ago(c.registered_at)}
          label="Claim"
          chips={
            <>
              <TickerChip symbol={c.instrument.symbol} to={`/claims/${c.id}`} dir={stat.dir} />
              {c.trigger_entities
                .filter((e) => e !== "NONE" && e !== c.instrument.symbol)
                .slice(0, 3)
                .map((e) => (
                  <TickerChip key={e} symbol={e} />
                ))}
            </>
          }
        >
          <Link to={`/claims/${c.id}`} className="text-[16px] font-semibold leading-snug hover:underline">
            <Highlight text={shortHeadline(it)} terms={highlightTerms(it)} />
          </Link>
          {b && (
            <p className="mt-1 text-sm text-muted">
              <span className={`font-bold ${stat.cls}`}>
                <Ticker text={stat.value} />
              </span>{" "}
              {stat.note ? `${stat.note},` : "abnormal move"} across {b.n_effective} past events. {it.forward_log.length} predictions frozen
              {comments > 0 && (
                <>
                  {", "}
                  <Link to={`/claims/${c.id}`} className="hover:text-fg hover:underline">
                    {comments} comment{comments === 1 ? "" : "s"}
                  </Link>
                </>
              )}
            </p>
          )}
          <SeeMore more={<p className="mt-1 text-[15px] leading-relaxed text-muted">{whatWeTest(it)}</p>}>{null}</SeeMore>
        </Row>
      );
    }
    case "event": {
      const s = item.story;
      const entity = s.entities[0];
      const claims = s.claim_ids.map((id) => site.claims.find((c) => c.claim.id === id)).filter((c): c is NonNullable<typeof c> => !!c);
      return (
        <Row
          avatar={entity ? <Logo symbol={entity} size={40} /> : null}
          name={entityName({ entities: s.entities, event_type: s.event_type })}
          when={ago(`${s.date}T21:00:00Z`)}
          label={ORIGIN_TAG[s.origin]}
          chips={claims.map((c) => (
            <TickerChip key={c.claim.id} symbol={c.claim.instrument.symbol} to={`/claims/${c.claim.id}`} dir={claimStat(c.claim.measure, c.backtest?.mean).dir} />
          ))}
        >
          <Link to={`/events/${s.event_id}`} className="text-[16px] leading-snug hover:underline">
            {storyTitle(s)}
          </Link>
          <p className="mt-1 text-sm text-muted">{claims.length ? `Tests ${claims.length} claim${claims.length === 1 ? "" : "s"}.` : storySentence(s)}</p>
        </Row>
      );
    }
    case "question": {
      const q = item.question;
      if (!isOwnDiscussion(q.url)) return null;
      return (
        <Row
          avatar={q.author ? <Identicon handle={q.author} size={40} /> : null}
          name={q.author ?? "Someone"}
          when={ago(q.created_at)}
          label={q.answered ? "Answered" : "Question"}
          chips={
            <>
              <a
                href={q.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center gap-1 border border-line px-3 py-1 text-[13px] font-semibold hover:bg-surface-alt"
              >
                <Icon name="message" size={14} />
                {q.comments ? `${q.comments} repl${q.comments === 1 ? "y" : "ies"}` : "Answer"}
              </a>
              <Link
                to={`/submit?statement=${encodeURIComponent(q.title)}`}
                className="inline-flex shrink-0 items-center gap-1 border border-line px-3 py-1 text-[13px] font-semibold hover:bg-surface-alt"
              >
                <Icon name="pen" size={14} />
                Shape into a claim
              </Link>
            </>
          }
        >
          <a href={q.url} target="_blank" rel="noopener noreferrer" className="text-[16px] font-semibold leading-snug hover:underline">
            {q.title}
          </a>
          {q.excerpt && <p className="mt-1 line-clamp-2 text-[15px] leading-relaxed text-muted">{q.excerpt}</p>}
        </Row>
      );
    }
    case "headline": {
      const h = item.headline;
      return (
        <Row
          avatar={<SourceIcon domain={h.domain} size={40} />}
          name={h.domain.replace(/^www\./, "")}
          when={ago(h.seen_at)}
          label={h.event_type === "NONE" ? "Headline" : "Testable"}
          fresh={fresh}
          chips={
            h.entities.length > 0 || h.event_type !== "NONE" ? (
              <>
                {h.entities.map((e) => (
                  <TickerChip key={e} symbol={e} />
                ))}
                {h.event_type !== "NONE" && (
                  <Link
                    to={`/submit?eventType=${encodeURIComponent(h.event_type)}`}
                    className="inline-flex shrink-0 items-center gap-1 border border-line px-3 py-1 text-[13px] font-semibold hover:bg-surface-alt"
                  >
                    <Icon name="pen" size={14} />
                    Claim: {eventLabel(h.event_type)}
                  </Link>
                )}
              </>
            ) : undefined
          }
        >
          <div className="flex gap-3">
            <HeadlineActions h={h} className="min-w-0 flex-1 text-[16px] leading-snug">
              {h.title}
            </HeadlineActions>
            {h.image && (
              <a href={h.url} target="_blank" rel="noopener noreferrer nofollow" tabIndex={-1} aria-hidden="true" className="shrink-0">
                <NewsImage src={h.image} domain={h.domain} className="h-20 w-28 md:h-24 md:w-36" />
              </a>
            )}
          </div>
        </Row>
      );
    }
  }
}
