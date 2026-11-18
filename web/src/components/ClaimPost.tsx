import { Link } from "react-router-dom";
import type { SiteClaim } from "../generated/site";
import { claimStat, intervalText } from "../lib/format";
import { categoryOf, highlightTerms, shortHeadline, whatWeTest } from "../lib/plain";
import { AreaChart } from "./AreaChart";
import { Highlight } from "./Highlight";
import { Icon, type IconName } from "./Icon";
import { Identicon } from "./Identicon";
import { PersonLink } from "./PersonLink";
import { StatusBadge } from "./StatusBadge";
import { BigNumber, Tag, TickerChip } from "./ui";

const when = (iso: string) =>
  /^\d{4}-\d{2}-\d{2}/.test(iso) ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : null;

function Count({ icon, n, label }: { icon: IconName; n: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon name={icon} size={16} />
      <span className="font-semibold text-fg">{n}</span>
      <span className="hidden sm:inline">{label}</span>
      <span className="sr-only sm:hidden">{label}</span>
    </span>
  );
}

/**
 * A claim shown as a post: who registered it and when, the claim in plain words, its result so far
 * in an embedded panel, the markets it is about, and its activity. Everything in it comes from the
 * record; nothing here is a popularity count.
 */
export function ClaimPost({ item }: { item: SiteClaim }) {
  const c = item.claim;
  const b = item.backtest;
  const stat = claimStat(c.measure, b?.mean);
  const tone = { up: "up", down: "down", flat: "accent" } as const;
  const registered = when(c.registered_at);
  const predictions = item.forward_log.length;
  const disputes = item.challenges.length + item.replications.length;
  const triggers = c.trigger_entities.filter((e) => e !== "NONE" && e !== c.instrument.symbol);
  return (
    <article className="rounded-[20px] bg-surface p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Identicon handle={c.registered_by} size={40} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              <PersonLink handle={c.registered_by} className="hover:underline" />
            </p>
            <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
              <span>{categoryOf(c.event_type)}</span>
              <span aria-hidden="true">·</span>
              <span>{registered ? `registered ${registered}` : "draft"}</span>
            </p>
          </div>
        </div>
        <StatusBadge status={item.status} />
      </header>

      <h3 className="mt-4 text-[19px] font-bold leading-snug">
        <Link to={`/claims/${c.id}`} className="hover:underline">
          <Highlight text={shortHeadline(item)} terms={highlightTerms(item)} />
        </Link>
      </h3>
      <p className="mt-1.5 line-clamp-3 text-[15px] leading-relaxed text-muted">{whatWeTest(item)}</p>

      {/* The embedded result panel: the number on the left, the average path around past events on the right. */}
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] items-center gap-4 rounded-2xl bg-surface-alt p-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{b ? `Backtest · ${b.n_effective} past events` : "Not tested yet"}</p>
          {b ? (
            <>
              <p className={`mt-1 text-[28px] font-extrabold leading-none tabular-nums ${stat.cls}`}>
                <BigNumber text={stat.value} />
              </p>
              <p className="mt-1 text-xs text-muted">{stat.note ?? intervalText(b.ci_lo, b.ci_hi)}</p>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted">{item.backtest_error ?? "Waiting for data."}</p>
          )}
        </div>
        <div className="min-w-0">
          <AreaChart values={item.chart?.mean ?? []} markIndex={item.chart?.days.indexOf(0)} height={72} tone={tone[stat.dir]} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <TickerChip symbol={c.instrument.symbol} to={`/claims/${c.id}`} />
        {triggers.slice(0, 3).map((e) => (
          <Tag key={e}>{e}</Tag>
        ))}
      </div>

      <footer className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-3 text-xs text-muted">
        <Count icon="bolt" n={b?.n_effective ?? 0} label="past events" />
        <Count icon="lock" n={predictions} label={predictions === 1 ? "prediction frozen" : "predictions frozen"} />
        <Count icon="flag" n={disputes} label={disputes === 1 ? "challenge or replication" : "challenges and replications"} />
        <Link to={`/claims/${c.id}`} className="ml-auto inline-flex items-center gap-1.5 font-semibold text-fg hover:underline">
          <Icon name="message" size={16} />
          Open
          <span className="sr-only"> {shortHeadline(item)}</span>
        </Link>
      </footer>
    </article>
  );
}
