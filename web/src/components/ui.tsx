import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon, type IconName } from "./Icon";
import { Logo } from "./Logo";
import type { Direction } from "../lib/format";

/** A flat panel with a heading and an optional freshness stamp. No border: the fill separates it. */
export function Card({
  title,
  stamp,
  children,
  id,
  kicker,
}: {
  title: string;
  stamp?: string;
  children: ReactNode;
  id?: string;
  /** A small icon and label above the heading, naming what kind of panel this is. */
  kicker?: { icon: IconName; label: string };
}) {
  const headingId = id ?? `card-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section aria-labelledby={headingId} className="rounded-[20px] bg-surface p-5 md:p-6">
      {kicker && <Kicker icon={kicker.icon}>{kicker.label}</Kicker>}
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

/** "◇ Market implications": a small icon and label that names a section, above its heading. */
export function Kicker({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <p className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-muted">
      <Icon name={icon} size={14} />
      {children}
    </p>
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
export function TickerChip({ symbol, value, to, dir = "flat" }: { symbol: string; value?: string; to?: string; dir?: Direction }) {
  const body = (
    <>
      <Logo symbol={symbol} size={18} />
      <span className="font-semibold text-accent">{symbol}</span>
      {value && <span className={`font-medium ${{ up: "text-positive", down: "text-negative", flat: "text-fg" }[dir]}`}>{value}</span>}
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
  // Like the ticker pills under a news story: a hairline outline, the symbol in blue and the number
  // in green or red only when it is a move. No fill, so a row of them stays quiet.
  const cls = "inline-flex items-center gap-1.5 rounded-full border border-line py-0.5 pl-0.5 pr-2.5 text-xs";
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
        active ? "bg-surface-alt text-fg" : "text-muted hover:bg-surface hover:text-fg"
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
    <div role="group" aria-label={label} className="inline-flex gap-0.5 rounded-xl bg-surface p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold ${value === o.value ? "bg-surface-alt text-fg" : "text-muted hover:text-fg"}`}
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
  "-mb-px shrink-0 whitespace-nowrap border-b-2 border-transparent pb-3 text-[17px] font-semibold text-muted hover:text-fg data-[state=active]:border-accent data-[state=active]:text-fg";

/** A call to action. Primary is a solid white button with an arrow; secondary is an outlined pill. */
export function ActionLink({
  to,
  children,
  variant = "primary",
  icon = "arrowRight",
}: {
  to: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
  icon?: IconName | null;
}) {
  const cls =
    variant === "primary"
      ? "bg-fg text-bg hover:opacity-90"
      : "border border-line text-fg hover:bg-surface";
  return (
    <Link to={to} className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold ${cls}`}>
      {children}
      {icon && <Icon name={icon} size={16} />}
    </Link>
  );
}

/** "7 claims | 53 predictions frozen": a row of headline numbers split by hairlines. */
export function StatRow({ items, label }: { items: { value: string; label: string }[]; label: string }) {
  return (
    <dl aria-label={label} className="grid grid-cols-2 gap-y-2 text-sm sm:flex sm:flex-wrap sm:items-center">
      {items.map((it, i) => (
        // dt before dd for screen readers; shown number-first. Hairline dividers once it is one row.
        <div key={it.label} className={`flex flex-row-reverse items-baseline justify-end gap-1.5 ${i > 0 ? "sm:ml-4 sm:border-l sm:border-line sm:pl-4" : ""}`}>
          <dt className="text-muted">{it.label}</dt>
          <dd className="font-bold text-fg">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A headline number with its unit set smaller ("0.83" large, "%" small). */
export function BigNumber({ text, className = "" }: { text: string; className?: string }) {
  const m = /^([+−-]?[\d,.]+)(.*)$/.exec(text);
  if (!m) return <span className={className}>{text}</span>;
  return (
    <span className={className}>
      {m[1]}
      <span className="ml-0.5 text-[0.55em] font-bold">{m[2]}</span>
    </span>
  );
}
