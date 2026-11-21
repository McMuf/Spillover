import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { SiteData } from "../generated/site";
import { latestFreeze, stampTime } from "../lib/ledger";
import { shortHeadline } from "../lib/plain";

const HEX = "0123456789abcdef";

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * The hash settles from noise into its real value once, on first view: the page's one moment of
 * motion, showing what "frozen" means. With reduced motion it is simply shown.
 */
export function useSettle(text: string, ms = 700): string {
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? text : text.replace(/[0-9a-f]/g, "0")));
  useEffect(() => {
    if (prefersReducedMotion()) {
      setShown(text);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const done = Math.min(1, (now - start) / ms);
      const fixed = Math.floor(done * text.length);
      setShown(
        text
          .split("")
          .map((ch, i) => (i < fixed || !HEX.includes(ch) ? ch : HEX[Math.floor(Math.random() * 16)]))
          .join(""),
      );
      if (done < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [text, ms]);
  return shown;
}

/** The latest thing the ledger froze, shown as the entry it is: number, statement, receipt. */
export function FrozenEntry({ site }: { site: SiteData }) {
  const latest = latestFreeze(site);
  const hash = latest?.prediction?.sha256 ?? "";
  const settled = useSettle(hash.slice(0, 24));
  if (!latest) return null;
  const { item, prediction, no, at } = latest;
  return (
    <article aria-labelledby="frozen-h" className="relative flex h-full flex-col rounded-3xl border border-line bg-bg p-6 md:p-7">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm font-semibold text-muted">{no ? `Entry no. ${no}` : "Latest entry"}</p>
        <p className="stamp-land -mr-1 -mt-1 rotate-[-4deg] rounded-lg border-2 border-accent px-2.5 py-1 text-center text-accent">
          <span className="block text-[15px] font-extrabold leading-none">Frozen</span>
          <span className="mt-1 block text-[11px] font-semibold leading-none">{stampTime(at).replace(", ", " ")}</span>
        </p>
      </div>
      <h2 id="frozen-h" className="mt-4 font-serif text-[27px] font-medium leading-[1.15] md:text-[32px]">
        <Link to={`/claims/${item.claim.id}`} className="hover:underline">
          &ldquo;{shortHeadline(item)}&rdquo;
        </Link>
      </h2>
      <p className="mt-2 text-sm text-muted">
        Registered by {item.claim.registered_by}
        {item.superseded_by && (
          <>
            . This version was later replaced by{" "}
            <Link to={`/claims/${item.superseded_by}`} className="text-accent underline">
              a new one
            </Link>
            ; its predictions stay on the record.
          </>
        )}
      </p>

      <dl className="mt-auto grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-2 border-t border-line pt-4 text-sm">
        {prediction ? (
          <>
            <dt className="text-muted">Latest prediction</dt>
            <dd>{stampTime(prediction.created_at)}</dd>
            <dt className="text-muted">For the event</dt>
            <dd className="truncate">
              <Link to={`/events/${prediction.event_id}`} className="text-accent hover:underline">
                {prediction.event_id}
              </Link>
            </dd>
            <dt className="text-muted">SHA-256</dt>
            <dd className="truncate font-mono text-[13px]" title={hash} aria-label={hash}>
              {settled}…
            </dd>
            <dt className="text-muted">Timestamp proof</dt>
            <dd>{prediction.proof === "present" ? "OpenTimestamps proof attached" : "Not attached yet"}</dd>
          </>
        ) : (
          <>
            <dt className="text-muted">Predictions</dt>
            <dd>None yet. The first qualifying event after registration creates one.</dd>
          </>
        )}
      </dl>
    </article>
  );
}
