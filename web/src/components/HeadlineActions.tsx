import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ideasFor } from "../lib/claimIdeas";
import type { Headline } from "../lib/liveNews";
import { Icon } from "./Icon";

/**
 * A headline with a choice: read the article, or turn it into a claim. Hovering the headline (with a
 * mouse) opens the choices; on touch screens and with a keyboard, the "Claim ideas" button does. The
 * headline itself still links to the article, as before.
 */
export function HeadlineActions({ h, children, className = "" }: { h: Headline; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const box = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const ideas = ideasFor(h);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  const hoverOpen = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(true), 280);
  };
  const hoverClose = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(false), 220);
  };

  return (
    <div ref={box} className={`relative ${className}`} onPointerEnter={hoverOpen} onPointerLeave={hoverClose}>
      <a href={h.url} target="_blank" rel="noopener noreferrer nofollow" className="hover:underline">
        {children}
      </a>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="ml-2 inline-flex translate-y-[-1px] items-center gap-1 border border-line px-2 py-0.5 align-middle text-[11px] font-semibold text-muted hover:bg-surface hover:text-fg"
      >
        <Icon name="bulb" size={12} />
        Claim ideas
      </button>
      {open && (
        <div
          id={panelId}
          role="region"
          aria-label={`What to do with: ${h.title}`}
          className="absolute left-0 top-full z-30 mt-2 w-[min(26rem,calc(100vw-2rem))] border border-line bg-bg p-2 shadow-[0_12px_32px_-12px_rgba(20,20,19,0.25)]"
        >
          <a
            href={h.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm font-semibold hover:bg-surface"
          >
            Read the article on {h.domain.replace(/^www\./, "")}
            <Icon name="external" size={15} />
          </a>
          <p className="px-3 pb-1 pt-2 text-[13px] font-medium text-muted">Turn it into a claim</p>
          <ul>
            {ideas.map((i) => (
              <li key={i.href}>
                <Link to={i.href} className="block px-3 py-2 hover:bg-accent-soft">
                  <span className="block text-sm font-semibold leading-snug">{i.title}</span>
                  <span className="block text-xs text-muted">{i.why}</span>
                </Link>
              </li>
            ))}
            <li>
              <Link
                to={`/submit?${new URLSearchParams({ statement: h.title, ...(h.event_type !== "NONE" ? { eventType: h.event_type } : {}) }).toString()}`}
                className="flex items-center justify-between gap-3 px-3 py-2 text-sm font-semibold hover:bg-accent-soft"
              >
                Start from this headline
              </Link>
            </li>
          </ul>
          <p className="px-3 pb-1 pt-2 text-[11px] leading-snug text-muted">
            Ideas come from fixed rules (the company, its suppliers and peers, named backers), not an AI. You choose what to claim.
          </p>
        </div>
      )}
    </div>
  );
}
