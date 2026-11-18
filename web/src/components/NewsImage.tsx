import { useState } from "react";

/**
 * A news story's own preview image, loaded live from the publisher's site when it scrolls into view.
 * Nothing is stored or proxied; the page does not tell the publisher which page linked it. If the image
 * is missing or fails, the outlet's initial stands in.
 */
export function NewsImage({ src, domain, className = "" }: { src: string | null | undefined; domain: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div aria-hidden="true" className={`grid place-items-center bg-surface-alt text-lg font-bold uppercase text-muted ${className}`}>
        {domain.replace(/^www\./, "").charAt(0)}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`bg-surface-alt object-cover ${className}`}
    />
  );
}
