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
    <section aria-labelledby="upcoming-strip-h" className="mb-8">
      <h2 id="upcoming-strip-h" className="mb-2 text-[13px] font-medium text-muted">
        Coming up
      </h2>
      <ul className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
        {site.upcoming.slice(0, 8).map((s) => {
          const soon = countdown(s.date);
          return (
            <li key={s.event_id} className="w-[180px] shrink-0">
              <Link to={`/events/${s.event_id}`} className="group block bg-surface px-4 py-3 hover:bg-surface-alt">
                <span className="block text-xs text-muted">{categoryOf(s.event_type)}</span>
                <span className="mt-0.5 block truncate text-sm font-semibold text-fg group-hover:underline">{SHORT[s.event_type] ?? storyTitle(s)}</span>
                <span className="mt-0.5 block text-xs">
                  <time dateTime={s.date} className="text-fg">
                    {s.date}
                  </time>
                  {soon && <span className="text-muted">, {soon}</span>}
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
