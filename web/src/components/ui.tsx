import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";
import type { CategoryHue } from "../design/tokens";
import { Icon, type IconName } from "./Icon";
import { Logo } from "./Logo";

const cssVar = (hue: CategoryHue) => `var(--c-${hue.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())})`;

/** A tinted style from a category hue: colored text on a faint wash of the same color. */
export function tint(hue: CategoryHue, strength = 16): CSSProperties {
  return {
    color: cssVar(hue),
    background: `color-mix(in srgb, ${cssVar(hue)} ${strength}%, transparent)`,
    borderColor: `color-mix(in srgb, ${cssVar(hue)} 35%, transparent)`,
  };
}

/** A rounded surface with a large heading and an optional freshness stamp. */
export function Card({
  title,
  stamp,
  children,
  id,
}: {
  title: string;
  stamp?: string;
  children: ReactNode;
  id?: string;
}) {
  const headingId = id ?? `card-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section aria-labelledby={headingId} className="rounded-xl border border-line bg-surface p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <h2 id={headingId} className="text-2xl font-bold leading-tight">
          {title}
        </h2>
        {stamp && <Stamp>{stamp}</Stamp>}
      </div>
      {children}
    </section>
  );
}

/** A section heading with an optional note, like "Top News Today". */
export function SectionHead({ id, title, note, right }: { id: string; title: string; note?: string; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h2 id={id} className="text-2xl font-bold leading-tight">
          {title}
        </h2>
        {note && <p className="mt-0.5 text-sm text-muted">{note}</p>}
      </div>
      {right}
    </div>
  );
}

/** "⚡ AS OF …": data without a visible age cannot be trusted. */
export function Stamp({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted">
      <Icon name="bolt" size={13} />
      {children}
    </span>
  );
}

/** A small rounded tag. Colored by category when given a hue, with an optional icon. */
export function Tag({ children, hue, icon }: { children: ReactNode; hue?: CategoryHue; icon?: IconName }) {
  return (
    <span
      style={hue ? tint(hue) : undefined}
      className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold ${
        hue ? "" : "border-transparent bg-surface-alt text-muted"
      }`}
    >
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  );
}

/** A company pill: logo, symbol and an optional neutral value, like the tickers under a news story. */
export function TickerChip({ symbol, value, hue = "catBlue" }: { symbol: string; value?: string; hue?: CategoryHue }) {
  return (
    <span style={tint(hue, 12)} className="inline-flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-3 text-xs font-bold">
      <Logo symbol={symbol} size={20} />
      <span className="font-mono text-fg">{symbol}</span>
      {value && <span className="font-semibold">{value}</span>}
    </span>
  );
}

/** The rounded value badge. Neutral unless it states an outcome that already happened. */
export function ValuePill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "positive" | "negative" }) {
  const cls = {
    neutral: "bg-surface-alt text-fg",
    positive: "bg-positive text-on-accent",
    negative: "bg-negative text-on-accent",
  }[tone];
  return <span className={`inline-flex min-w-[88px] justify-center rounded-lg px-3 py-2 text-[15px] font-bold ${cls}`}>{children}</span>;
}

/** A selectable pill, used for filters and range selectors. Active pills glow in the primary blue. */
export function PillButton({
  active,
  onClick,
  children,
  label,
  hue,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  label?: string;
  hue?: CategoryHue;
  icon?: IconName;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      onClick={onClick}
      style={!active && hue ? { borderColor: `color-mix(in srgb, ${cssVar(hue)} 45%, transparent)` } : undefined}
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
        active
          ? "border-primary bg-primary text-on-primary shadow-[0_0_0_3px_color-mix(in_srgb,var(--c-primary)_30%,transparent)]"
          : "border-line bg-surface text-muted hover:border-accent hover:text-fg"
      }`}
    >
      {icon && <Icon name={icon} size={15} />}
      {children}
    </button>
  );
}

/** A circular icon button for back arrows and similar. */
export function BackButton({ to, label = "Back" }: { to: string; label?: string }) {
  return (
    <Link to={to} aria-label={label} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line bg-surface text-fg hover:bg-surface-alt">
      <Icon name="back" />
    </Link>
  );
}

/** Underlined text tabs for filtering, like the category row on a market list. */
export function FilterTabs<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex gap-6 overflow-x-auto border-b border-line">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          aria-pressed={value === o}
          onClick={() => onChange(o)}
          className={`-mb-px shrink-0 whitespace-nowrap border-b-2 py-3 text-[15px] font-semibold ${
            value === o ? "border-primary text-fg" : "border-transparent text-muted hover:text-fg"
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}
