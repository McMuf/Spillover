import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { Icon } from "./Icon";

/** A rounded surface with a large heading and an optional freshness stamp, as on the overview cards. */
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
    <section aria-labelledby={headingId} className="rounded-[22px] border border-line bg-surface p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <h2 id={headingId} className="text-[26px] font-extrabold leading-tight">
          {title}
        </h2>
        {stamp && <Stamp>{stamp}</Stamp>}
      </div>
      {children}
    </section>
  );
}

/** "⚡ AS OF …": data without a visible age cannot be trusted. */
export function Stamp({ children }: { children: ReactNode }) {
  return (
    <span className="mt-2 inline-flex shrink-0 items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted">
      <Icon name="bolt" size={13} />
      {children}
    </span>
  );
}

/** A small rounded tag next to a name, such as the venue or a status. */
export function Tag({ children }: { children: ReactNode }) {
  return <span className="shrink-0 rounded-lg bg-surface-alt px-2 py-0.5 text-xs font-semibold text-muted">{children}</span>;
}

/** The rounded value badge. Neutral unless it states an outcome that already happened. */
export function ValuePill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "positive" | "negative" }) {
  const cls = {
    neutral: "bg-surface-alt text-fg",
    positive: "bg-positive text-on-accent",
    negative: "bg-negative text-on-accent",
  }[tone];
  return <span className={`inline-flex min-w-[88px] justify-center rounded-xl px-3 py-2 text-[15px] font-bold ${cls}`}>{children}</span>;
}

/** A selectable pill, used for filters and range selectors. */
export function PillButton({
  active,
  onClick,
  children,
  label,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  label?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-[15px] font-semibold ${
        active ? "border-primary bg-primary text-on-primary" : "border-line bg-surface text-muted hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}

/** Large underlined section tabs, like News / Feed / Markets. */
export function SectionTabs() {
  const items = [
    { to: "/", label: "Claims", end: true },
    { to: "/feed", label: "Feed", end: false },
    { to: "/scoreboard", label: "Scoreboard", end: false },
  ];
  return (
    <nav aria-label="Sections" className="mb-5 grid grid-cols-3 border-b border-line">
      {items.map((i) => (
        <NavLink
          key={i.to}
          to={i.to}
          end={i.end}
          className={({ isActive }) =>
            `border-b-[3px] py-3.5 text-center text-lg font-bold ${isActive ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg"}`
          }
        >
          {i.label}
        </NavLink>
      ))}
    </nav>
  );
}

/** A circular icon button for back arrows and similar. */
export function BackButton({ to, label = "Back" }: { to: string; label?: string }) {
  return (
    <Link to={to} aria-label={label} className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line bg-surface text-fg hover:bg-surface-alt">
      <Icon name="back" />
    </Link>
  );
}
