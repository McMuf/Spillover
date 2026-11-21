import { useId } from "react";

/**
 * Spillover's mark: a hexagonal basin with water inside and a stream spilling over its edge, in ink on
 * a lime tile. The same drawing is the browser-tab icon (public/favicon.svg, generated from markSvg and
 * checked by a test). Decorative: the word "Spillover" beside it is the name.
 */
export const MARK = { tile: "#c5ef4a", ink: "#141413" };

// Geometry on a 32 x 32 grid: a pointy-top hexagon centred at (15, 16), radius 10.5.
export const MARK_PATHS = {
  hex: "M15 5.5 L24.09 10.75 L24.09 21.25 L15 26.5 L5.91 21.25 L5.91 10.75 Z",
  water: "M3 17 C6.5 14.6 9.5 19.4 15 17 C20.5 14.6 23.5 19.4 27 17 L27 30 L3 30 Z",
  spill: "M24.6 15.2 C27.4 15.6 28 18.6 27.4 22.4",
};

export function BrandMark({ size = 28 }: { size?: number }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false" className="shrink-0">
      <defs>
        <clipPath id={`${id}-basin`}>
          <path d={MARK_PATHS.hex} />
        </clipPath>
      </defs>
      <rect width="32" height="32" rx="8" fill={MARK.tile} />
      <path d={MARK_PATHS.water} fill={MARK.ink} clipPath={`url(#${id}-basin)`} />
      <path d={MARK_PATHS.hex} fill="none" stroke={MARK.ink} strokeWidth="2.2" strokeLinejoin="round" />
      <path d={MARK_PATHS.spill} fill="none" stroke={MARK.ink} strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

/** The same mark as a standalone SVG document, for the browser-tab icon. */
export function markSvg(): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">`,
    `<defs><clipPath id="b"><path d="${MARK_PATHS.hex}"/></clipPath></defs>`,
    `<rect width="32" height="32" rx="8" fill="${MARK.tile}"/>`,
    `<path d="${MARK_PATHS.water}" fill="${MARK.ink}" clip-path="url(#b)"/>`,
    `<path d="${MARK_PATHS.hex}" fill="none" stroke="${MARK.ink}" stroke-width="2.2" stroke-linejoin="round"/>`,
    `<path d="${MARK_PATHS.spill}" fill="none" stroke="${MARK.ink}" stroke-width="2.2" stroke-linecap="round"/>`,
    `</svg>`,
  ].join("");
}
