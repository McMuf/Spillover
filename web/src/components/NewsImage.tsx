import { useState } from "react";

/**
 * A news story's own preview image, loaded live from the publisher's site when it scrolls into view.
 * Nothing is stored or proxied; the page does not tell the publisher which page linked it. If the image
 * is missing or fails, nothing is shown (never a stand-in letter).
 */
export function NewsImage({
  src,
  domain,
  className = "",
  onFail,
}: {
  src: string | null | undefined;
  domain: string;
  className?: string;
  /** Told when the picture fails, so a page can give its spot to a story whose picture works. */
  onFail?: (src: string) => void;
}) {
  const [failed, setFailed] = useState(false);
  // No picture, or it failed to load: show nothing rather than a stand-in.
  if (!src || failed) return null;
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => {
        setFailed(true);
        onFail?.(src);
      }}
      className={`bg-surface-alt object-cover ${className}`}
    />
  );
}
