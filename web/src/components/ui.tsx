import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon, type IconName } from "./Icon";
import { Logo } from "./Logo";

/** A flat panel with a heading and an optional freshness stamp. No border: the fill separates it. */
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
    <section aria-labelledby={headingId} className="rounded-2xl bg-surface p-5 md:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <h2 id={headingId} className="text-xl font-bold leading-tight">
          {title}
        </h2>
        {stamp && <Stamp>{stamp}</Stamp>}
      </div>
      {children}
    </section>
  );
}

/** A section heading, like "Top News Today", with optional controls on the right. */
export function SectionHead({ id, title, right }: { id: string; title: string; right?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 id={id} className="text-[22px] font-bold leading-tight">
        {title}
      </h2>
      {right}
    </div>
  );
}

/** "⚡ 36 EVENTS TESTED · FED & MACRO": small caps metadata above a headline. */
export function Stamp({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted">
      <Icon name="bolt" size={12} />
      {children}
    </span>
  );
}

/** A small grey label chip, like "AI & TECH". */
export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-md bg-surface-alt px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-muted">
      {children}
    </span>
  );
}

/** A hairline-outlined label next to a symbol, like "PERP". */
export function OutlineTag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-md border border-line px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
      {children}
    </span>
  );
}

/** A ticker pill: logo, symbol, an optional neutral number, and an arrow when it links somewhere. */
export function TickerChip({ symbol, value, to }: { symbol: string; value?: string; to?: string }) {
  const body = (
    <>
      <Logo symbol={symbol} size={20} />
      <span className="font-semibold text-fg">{symbol}</span>
      {value && <span className="text-muted">{value}</span>}
      {to && (
        <>
          <span className="text-muted">
            <Icon name="external" size={13} />
          </span>
          <span className="sr-only"> (open claim)</span>
        </>
      )}
    </>
  );
  const cls = "inline-flex items-center gap-1.5 rounded-full border border-line bg-surface py-1 pl-1 pr-2.5 text-xs";
  return to ? (
    <Link to={to} className={`${cls} relative z-10 hover:border-muted`}>
      {body}
    </Link>
  ) : (
    <span className={cls}>{body}</span>
  );
}

/** A filter pill. The active one takes the accent, the rest stay quiet. */
export function PillButton({
  active,
  onClick,
  children,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  label?: string;
  icon?: IconName;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold ${
        active ? "bg-accent text-on-accent" : "border border-line text-muted hover:text-fg"
      }`}
    >
      {icon && <Icon name={icon} size={14} />}
      {children}
    </button>
  );
}

/** A two- or three-way switch, like Trending | Latest. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-full bg-surface-alt p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-full px-3 py-1 text-xs font-semibold ${value === o.value ? "bg-accent/20 text-accent" : "text-muted hover:text-fg"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A round icon button, for carousel arrows and back links. */
export function IconButton({ icon, label, onClick, disabled }: { icon: IconName; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="grid h-9 w-9 place-items-center rounded-full bg-surface-alt text-fg hover:bg-line disabled:text-muted disabled:opacity-50"
    >
      <Icon name={icon} size={18} />
    </button>
  );
}

export function BackButton({ to, label = "Back" }: { to: string; label?: string }) {
  return (
    <Link to={to} aria-label={label} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-alt text-fg hover:bg-line">
      <Icon name="back" size={18} />
    </Link>
  );
}

export const TAB_CLASS =
  "-mb-px shrink-0 whitespace-nowrap border-b-2 border-transparent pb-3 text-[17px] font-semibold text-muted hover:text-fg data-[state=active]:border-fg data-[state=active]:text-fg";
