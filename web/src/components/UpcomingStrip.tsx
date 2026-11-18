import { Link } from "react-router-dom";
import type { SiteData } from "../generated/site";
import { storyTitle } from "../lib/news";
import { categoryOf } from "../lib/plain";

// Short names so a tile never truncates the event it is about.
const SHORT: Record<string, string> = {
  FOMC_DECISION: "Fed rate decision",
  CPI_RELEASE: "Inflation report (CPI)",
  JOBS_REPORT: "Jobs report",
};

function countdown(date: string): string | null {
  const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.now()) / 86_400_000);
  if (days < 0) return null;
  if (days === 0) return "today";
  return days === 1 ? "tomorrow" : `in ${days} days`;
}

/**
 * The next scheduled events, as a strip of tiles across the top of a page, the way a markets site
 * shows its indexes. Each tile says when, and how many registered claims are waiting for it.
 */
export function UpcomingStrip({ site }: { site: SiteData }) {
  if (site.upcoming.length === 0) return null;
  return (
    <section aria-labelledby="upcoming-strip-h" className="mb-8 rounded-[20px] bg-surface">
      <h2 id="upcoming-strip-h" className="px-5 pt-4 text-xs font-semibold uppercase tracking-wider text-muted">
        Coming up
      </h2>
      <ul className="no-scrollbar flex overflow-x-auto px-2 pb-3 pt-2">
        {site.upcoming.slice(0, 8).map((s, i) => {
          const soon = countdown(s.date);
          return (
            <li key={s.event_id} className={`w-[190px] shrink-0 px-3 py-1 ${i > 0 ? "border-l border-line" : ""}`}>
              <Link to={`/events/${s.event_id}`} className="group block">
                <span className="block text-xs text-muted">{categoryOf(s.event_type)}</span>
                <span className="mt-0.5 block truncate text-sm font-semibold text-accent group-hover:underline">{SHORT[s.event_type] ?? storyTitle(s)}</span>
                <span className="mt-0.5 block text-xs">
                  <time dateTime={s.date} className="text-fg">
                    {s.date}
                  </time>
                  {soon && <span className="text-muted"> · {soon}</span>}
                </span>
                <span className="mt-0.5 block text-xs text-muted">
                  {s.claim_ids.length} claim{s.claim_ids.length === 1 ? "" : "s"} waiting
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
