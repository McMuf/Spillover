import { lazy, Suspense, useState } from "react";
import { discussionsEnabled, GISCUS, type GiscusConfig } from "../lib/community";

// Loaded only when someone opens the discussion, so pages stay light and nothing is requested from
// giscus.app until then. The widget's code is bundled with the site; giscus.app only serves the
// framed comment box (allowed by the site's Content-Security-Policy as frame-src).
const Giscus = lazy(() => import("@giscus/react"));

export function Discussion({
  term,
  label,
  comments = 0,
  config = GISCUS,
}: {
  term: string;
  label: string;
  /** Comments counted when the site was built (0 when unknown). */
  comments?: number;
  config?: GiscusConfig;
}) {
  const [open, setOpen] = useState(false);
  if (!discussionsEnabled(config)) return null;
  return (
    <section aria-labelledby={`discussion-${term}`} className="bg-surface p-5">
      <h2 id={`discussion-${term}`} className="text-xl font-bold">
        Discussion
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        Talk about this {label} with others: questions, doubts, ideas for a better version. Comments live in this
        project&apos;s GitHub Discussions, and posting needs a GitHub account. Discussion never changes a result: only
        the market grades claims.
      </p>
      {open ? (
        <div className="mt-4">
          <Suspense fallback={<p className="text-sm text-muted">Loading the discussion…</p>}>
            <Giscus
              repo={config.repo}
              repoId={config.repoId}
              category={config.category}
              categoryId={config.categoryId}
              mapping="specific"
              term={term}
              strict="1"
              reactionsEnabled="1"
              emitMetadata="0"
              inputPosition="top"
              theme="dark"
              lang="en"
              loading="lazy"
            />
          </Suspense>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 bg-surface-alt px-5 py-2 text-sm font-semibold text-fg hover:bg-line"
        >
          {comments > 0 ? `Show discussion (${comments} comment${comments === 1 ? "" : "s"})` : "Show discussion"}
        </button>
      )}
    </section>
  );
}
