import { useId } from "react";
import { MARK } from "./BrandMark";

/**
 * The brand landscape for hero bands: two peaks lit by a dawn sun, and a river spilling out of the
 * valley between them toward the viewer. The logo's drawing, at a larger scale. Decorative only.
 */
export function Landscape({ className = "" }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 600 400" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false" className={className}>
      <defs>
        <linearGradient id={`${id}-lit`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe3cf" />
          <stop offset="0.6" stopColor="#d9c6f4" />
          <stop offset="1" stopColor="#b7a0ea" />
        </linearGradient>
        <linearGradient id={`${id}-shade`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7d5fd6" />
          <stop offset="1" stopColor={MARK.far} />
        </linearGradient>
        <linearGradient id={`${id}-river`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.7" />
          <stop offset="1" stopColor={MARK.river} />
        </linearGradient>
      </defs>
      <circle cx="455" cy="110" r="52" fill="#fff1e6" opacity="0.9" />
      {/* the far range */}
      <path d="M0 290 L70 230 L130 262 L205 205 L260 240 L330 195 L400 250 L470 215 L540 255 L600 225 L600 400 L0 400 Z" fill="#c8b8f0" opacity="0.55" />
      {/* the big peak: a sunlit face and a face in shadow */}
      <path d="M430 60 L215 400 L395 400 Z" fill={`url(#${id}-lit)`} />
      <path d="M430 60 L395 400 L660 400 Z" fill={`url(#${id}-shade)`} />
      <path d="M430 60 L404 104 L419 97 L432 112 L447 99 L460 108 Z" fill="#ffffff" />
      {/* the near peak */}
      <path d="M-40 400 L165 150 L300 400 Z" fill="#3b2a66" />
      <path d="M165 150 L60 278 L300 400 L300 400 Z" fill={MARK.near} opacity="0.55" />
      <path d="M165 150 L146 176 L158 171 L168 182 L180 172 L190 178 Z" fill={MARK.snowNear} />
      {/* the river, spilling out of the valley toward the viewer */}
      <path
        d="M272 318 C 290 336, 258 350, 276 368 C 288 382, 276 392, 268 400 L 340 400 C 340 386, 318 376, 306 362 C 292 346, 300 332, 280 316 Z"
        fill={`url(#${id}-river)`}
      />
    </svg>
  );
}
