import { useEffect, useRef, useState } from "react";

const DIGITS = "0123456789";

function parse(text: string): number | null {
  const n = Number(text.replace(/[^\d.−-]/g, "").replace("−", "-"));
  return Number.isFinite(n) && /\d/.test(text) ? n : null;
}

/**
 * A number whose digits roll into place, like a live quote. It rolls up from zero when it first
 * appears and rolls to the new value when the number changes (the site refreshes its data while
 * open), flashing green or red for a moment in the direction of the change. Screen readers get the
 * plain text; people who prefer reduced motion see the number settle at once.
 */
export function Ticker({ text, className = "" }: { text: string; className?: string }) {
  const [shown, setShown] = useState(() => text.replace(/\d/g, "0"));
  const [flash, setFlash] = useState<"" | "flash-up" | "flash-down">("");
  const prev = useRef<string | null>(null);

  useEffect(() => {
    // Next frame, so the strips start from their current position and transition to the new one.
    const id = requestAnimationFrame(() => setShown(text));
    const before = prev.current === null ? null : parse(prev.current);
    const after = parse(text);
    if (before !== null && after !== null && before !== after) {
      setFlash(after > before ? "flash-up" : "flash-down");
      const t = setTimeout(() => setFlash(""), 1200);
      prev.current = text;
      return () => {
        cancelAnimationFrame(id);
        clearTimeout(t);
      };
    }
    prev.current = text;
    return () => cancelAnimationFrame(id);
  }, [text]);

  // Digits that only exist in the new text start from 0 too, so lengths may differ during a roll.
  const chars = text.split("");
  return (
    <span className={`inline-flex items-baseline rounded ${flash} ${className}`}>
      <span className="sr-only">{text}</span>
      {chars.map((ch, i) => {
        const target = shown[i] ?? "0";
        if (!DIGITS.includes(ch)) {
          return (
            <span key={i} aria-hidden="true">
              {ch}
            </span>
          );
        }
        const d = DIGITS.includes(target) ? Number(target) : 0;
        return (
          <span key={i} className="ticker-digit" aria-hidden="true">
            <span className="ticker-strip" style={{ transform: `translateY(-${d}em)` }}>
              {DIGITS.split("").map((x) => (
                <span key={x} style={{ height: "1em", lineHeight: 1 }}>
                  {x}
                </span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}
