import { Link } from "react-router-dom";
import { NODE_BY_KEY, type NodeTypeKey } from "../design/nodes";
import type { SiteClaim } from "../generated/site";
import { whatWeTest, categoryOf } from "../lib/plain";
import { instrumentName } from "../lib/brands";
import { pct } from "../lib/format";
import { NodeShape } from "./NodeShape";
import { StatusBadge } from "./StatusBadge";
import { Icon } from "./Icon";
import { Tag, TickerChip, tint } from "./ui";

const ART: NodeTypeKey[] = ["event", "entity", "instrument", "factor", "condition", "prediction"];

/** A story card in the style of a news tile: category art, headline, plain-English line, affected tickers. */
export function TrendingCard({ item }: { item: SiteClaim }) {
  const c = item.claim;
  const b = item.backtest;
  const cat = categoryOf(c.event_type);
  const shape = ART[(c.event_type.length + c.instrument.symbol.length) % ART.length] ?? "event";
  const hueVar = `var(--c-${cat.hue.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())})`;
  return (
    <article className="relative flex min-h-[26rem] flex-col justify-end overflow-hidden rounded-xl border border-line bg-surface">
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{ background: `radial-gradient(120% 90% at 85% 0%, color-mix(in srgb, ${hueVar} 55%, transparent), transparent 62%), linear-gradient(180deg, transparent 30%, var(--c-surface) 78%)` }}
      />
      <div aria-hidden="true" className="absolute right-4 top-4 opacity-30" style={{ color: hueVar }}>
        <NodeShape type={shape} size={120} />
      </div>
      <div className="absolute left-4 top-4 flex flex-wrap items-center gap-2">
        <Tag hue={cat.hue}>{cat.name}</Tag>
        <StatusBadge status={item.status} />
      </div>

      <div className="relative p-5 pt-40">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
          <Icon name="bolt" size={13} />
          {b ? `${b.n_effective} past events tested` : "not tested yet"}
          {b && ` · as of ${b.as_of}`}
        </p>
        <h3 className="text-lg font-extrabold leading-snug">
          <Link to={`/claims/${c.id}`} className="line-clamp-4 after:absolute after:inset-0 after:content-['']">
            {c.statement.replace(/\s+/g, " ").trim()}
          </Link>
        </h3>
        <p className="mt-2 line-clamp-3 text-sm text-muted">{whatWeTest(item)}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <TickerChip symbol={c.instrument.symbol} value={b ? pct(b.mean) : undefined} hue={cat.hue} />
          <span style={tint(cat.hue, 10)} className="rounded-full border px-3 py-1 text-xs font-semibold">
            {instrumentName(c.instrument.symbol)}
          </span>
          <span className="sr-only">{NODE_BY_KEY[shape].name}</span>
        </div>
      </div>
    </article>
  );
}
