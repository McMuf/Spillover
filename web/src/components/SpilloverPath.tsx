import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { NODE_BY_KEY, type NodeTypeKey } from "../design/nodes";
import type { SiteClaim, SiteData } from "../generated/site";
import { dirText } from "../lib/format";
import { claimPath } from "../lib/paths";
import { shortName } from "../lib/plain";
import { Icon } from "./Icon";
import { Logo } from "./Logo";
import { NodeShape } from "./NodeShape";

/** One step in the chain, labeled with its role and its node type, so no legend is needed to read it. */
function Step({ type, role, children }: { type: NodeTypeKey; role: string; children: ReactNode }) {
  return (
    <li className="min-w-0 rounded-2xl bg-surface p-4">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
        <NodeShape type={type} size={14} />
        {role}
        <span className="font-mono font-normal normal-case tracking-normal">· {NODE_BY_KEY[type].tag}</span>
      </p>
      {children}
    </li>
  );
}

/** The arrow between steps: across on wide screens, down on phones. Dashed while the sample is small. */
function Arrow({ dashed, label }: { dashed: boolean; label: string }) {
  const line = dashed ? "border-dashed" : "border-solid";
  return (
    <li aria-hidden="true" className="flex items-center justify-center gap-2 py-1 text-muted md:flex-col md:gap-1 md:px-2 md:py-0">
      <span className="flex flex-col items-center md:flex-row">
        <span className={`h-4 border-l-2 md:h-0 md:w-8 md:border-l-0 md:border-t-2 ${line} border-muted`} />
        <span className="-mt-1.5 rotate-90 md:-ml-2 md:mt-0 md:rotate-0">
          <Icon name="chevronRight" size={16} />
        </span>
      </span>
      <span className="text-[11px] md:max-w-[6rem] md:text-center">{label}</span>
    </li>
  );
}

export function SpilloverPath({ item, site }: { item: SiteClaim; site: SiteData }) {
  const p = claimPath(item, site);
  const name = shortName(p.market.symbol);
  const trigger = p.triggers.map((t) => t.name).join(", ") || "No one in particular";
  const triggerInSentence = /^(Federal|US |European|Bank of)/.test(trigger) ? `the ${trigger}` : trigger;
  const dashed = !p.effect || p.effect.lowSample;

  return (
    <figure data-testid="spillover-path" aria-labelledby="path-caption">
      <ol className="grid items-stretch md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1.2fr)]">
        <Step type="entity" role="Who">
          <p className="text-lg font-bold leading-snug">{trigger}</p>
          <p className="mt-1 text-sm text-muted">{p.triggers.length ? "triggers the event" : "a control: dates are picked at random"}</p>
        </Step>
        <Arrow dashed={false} label={p.triggers.length ? "announces" : "picks a day"} />
        <Step type="event" role="What happens">
          <p className="text-lg font-bold leading-snug">{p.event.title}</p>
          <p className="mt-1 text-sm text-muted">
            {p.event.count} on record
            {p.event.latest && (
              <>
                {", latest "}
                <Link to={`/events/${p.event.latest.id}`} className="whitespace-nowrap text-accent underline underline-offset-2">
                  {p.event.latest.date}
                </Link>
              </>
            )}
          </p>
        </Step>
        <Arrow dashed={dashed} label={p.effect ? `within ${p.effect.days} trading day${p.effect.days === 1 ? "" : "s"}` : "not tested"} />
        <Step type="instrument" role="Which market">
          <div className="flex items-center gap-2.5">
            <Logo symbol={p.market.symbol} size={32} />
            <div className="min-w-0">
              <p className="text-lg font-bold leading-tight">{p.market.name}</p>
              <p className="text-xs text-muted">
                {p.market.symbol} · {p.market.venue}
              </p>
            </div>
          </div>
          {p.market.basket.length > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 text-xs text-muted">Equal-weighted basket of {p.market.basket.length}:</p>
              <ul className="flex flex-wrap gap-1.5" aria-label="Basket members">
                {p.market.basket.map((m) => (
                  <li key={m} className="flex items-center gap-1 rounded-full bg-surface-alt py-0.5 pl-0.5 pr-2 text-xs font-semibold">
                    <Logo symbol={m} size={16} />
                    {m}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {p.effect ? (
            <div className="mt-3 border-t border-line pt-3">
              <p className={`text-2xl font-extrabold tabular-nums ${dirText(item.backtest?.mean)}`}>{p.effect.estimate}</p>
              <p className="text-xs text-muted">
                {p.effect.interval} · n={p.effect.n} counted · {p.effect.window} · <span className="whitespace-nowrap">as of {p.effect.asOf}</span> · backtest
              </p>
            </div>
          ) : (
            <p className="mt-3 border-t border-line pt-3 text-sm text-muted">No backtest yet.</p>
          )}
        </Step>
      </ol>

      <dl className="mt-3 divide-y divide-line rounded-2xl bg-surface px-4">
        <div className="grid gap-1 py-3 sm:grid-cols-[13rem_1fr]">
          <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
            <NodeShape type="factor" size={14} /> Measured against <span className="font-mono font-normal normal-case tracking-normal">· FAC</span>
          </dt>
          <dd className="text-sm">
            {p.controls.length > 0 ? (
              <>
                {p.controls.map((f, i) => (
                  <span key={f.symbol}>
                    {i > 0 && (i === p.controls.length - 1 ? " and " : ", ")}
                    <strong>{f.name}</strong> ({f.symbol})
                  </span>
                ))}
                . {p.controls.length > 1 ? "Their" : "Its"} moves are subtracted, so only the part {p.controls.length > 1 ? "they do" : "the overall market does"} not
                explain counts.
              </>
            ) : (
              <>{name.charAt(0).toUpperCase() + name.slice(1)}&apos;s own normal day-to-day movement. There is no separate market to subtract.</>
            )}
          </dd>
        </div>
        <div className="grid gap-1 py-3 sm:grid-cols-[13rem_1fr]">
          <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
            <NodeShape type="condition" size={14} /> Rules applied <span className="font-mono font-normal normal-case tracking-normal">· CON</span>
          </dt>
          <dd>
            <ul className="list-disc space-y-1 pl-4 text-sm marker:text-muted">
              {p.rules.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </dd>
        </div>
        <div className="grid gap-1 py-3 sm:grid-cols-[13rem_1fr]">
          <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
            <NodeShape type="prediction" size={14} /> Frozen predictions <span className="font-mono font-normal normal-case tracking-normal">· PRD</span>
          </dt>
          <dd className="text-sm">
            {p.predictions.total === 0 ? (
              <>None yet. Each event after registration adds one, sealed with a hash before the outcome is known ({p.predictions.needed} needed for a verdict).</>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span>
                  {p.predictions.total} of {p.predictions.needed} needed. Latest:
                </span>
                {p.predictions.recent.map((r) => (
                  <span
                    key={r.eventId}
                    className={`rounded-md bg-surface-alt px-2 py-0.5 text-xs font-semibold ${r.outcome === "hit" ? "text-positive" : r.outcome === "miss" ? "text-negative" : "text-muted"}`}
                  >
                    {r.date} {r.outcome === "hit" ? "✓ hit" : r.outcome === "miss" ? "✕ miss" : "open"}
                  </span>
                ))}
              </div>
            )}
          </dd>
        </div>
      </dl>

      <figcaption id="path-caption" className="mt-3 text-sm text-muted">
        Read it left to right: when {trigger === "No one in particular" ? "a random day comes up" : `${triggerInSentence} ${p.event.title.toLowerCase().startsWith("fomc") ? "makes a rate decision" : "acts"}`}, does{" "}
        {name} move more than it otherwise would? A dashed arrow means fewer past events than the claim requires.
      </figcaption>
    </figure>
  );
}
