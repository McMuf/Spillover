import { useId } from "react";

/**
 * Spillover's mark: two peaks with a river spilling out of the valley between them, under a
 * lavender-to-peach dawn sky. The same drawing is the browser-tab icon (index.html). Decorative:
 * the word "Spillover" beside it is the name.
 */
export const MARK = {
  skyTop: "#d8ccf3",
  skyMid: "#efd9ea",
  skyBottom: "#fbd8c3",
  far: "#6a4bc9",
  near: "#2b1d47",
  snow: "#ffffff",
  snowNear: "#e6dcfa",
  river: "#f8f2ff",
};

// Geometry on a 32 x 32 grid; the valley between the peaks is at (13.6, 19.6).
export const MARK_PATHS = {
  far: "M6 33 L21 6.5 L36 33 Z",
  farSnow: "M21 6.5 L18.3 11.3 L19.9 10.5 L21.2 11.9 L22.6 10.6 L23.8 11.4 Z",
  near: "M-2 33 L9.5 11 L20 33 Z",
  nearSnow: "M9.5 11 L7.6 14.6 L9 13.8 L10.2 14.9 L11.3 14.2 Z",
  river: "M13.6 19.8 C15 22.5 12.6 24.6 14.4 27 C15.8 29 14.6 30.6 13.6 33 L19.8 33 C20 30.4 18.2 28.6 17 26.6 C15.8 24.6 16.4 22.2 13.6 19.8 Z",
};

export function BrandMark({ size = 28 }: { size?: number }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false" className="shrink-0">
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={MARK.skyTop} />
          <stop offset="0.55" stopColor={MARK.skyMid} />
          <stop offset="1" stopColor={MARK.skyBottom} />
        </linearGradient>
        <clipPath id={`${id}-tile`}>
          <rect width="32" height="32" rx="8" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}-tile)`}>
        <rect width="32" height="32" fill={`url(#${id}-sky)`} />
        <path d={MARK_PATHS.far} fill={MARK.far} />
        <path d={MARK_PATHS.farSnow} fill={MARK.snow} />
        <path d={MARK_PATHS.near} fill={MARK.near} />
        <path d={MARK_PATHS.nearSnow} fill={MARK.snowNear} />
        <path d={MARK_PATHS.river} fill={MARK.river} />
      </g>
    </svg>
  );
}

/** The same mark as a standalone SVG document, for the browser-tab icon. */
export function markSvg(): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">`,
    `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1">`,
    `<stop offset="0" stop-color="${MARK.skyTop}"/><stop offset=".55" stop-color="${MARK.skyMid}"/><stop offset="1" stop-color="${MARK.skyBottom}"/>`,
    `</linearGradient><clipPath id="t"><rect width="32" height="32" rx="8"/></clipPath></defs>`,
    `<g clip-path="url(#t)"><rect width="32" height="32" fill="url(#s)"/>`,
    `<path d="${MARK_PATHS.far}" fill="${MARK.far}"/><path d="${MARK_PATHS.farSnow}" fill="${MARK.snow}"/>`,
    `<path d="${MARK_PATHS.near}" fill="${MARK.near}"/><path d="${MARK_PATHS.nearSnow}" fill="${MARK.snowNear}"/>`,
    `<path d="${MARK_PATHS.river}" fill="${MARK.river}"/></g></svg>`,
  ].join("");
}
