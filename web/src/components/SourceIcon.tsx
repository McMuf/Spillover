import { outletIcon, useIcons } from "../lib/icons";

/** A news outlet's own site icon, on a white tile like an app icon. Nothing when it has none. */
export function SourceIcon({ domain, size = 40 }: { domain: string; size?: number }) {
  const src = outletIcon(useIcons(), domain);
  if (!src) return null;
  return (
    <span aria-hidden="true" style={{ width: size, height: size }} className="grid shrink-0 place-items-center overflow-hidden bg-white ring-1 ring-line">
      <img src={src} alt="" width={Math.round(size * 0.62)} height={Math.round(size * 0.62)} className="object-contain" loading="lazy" decoding="async" />
    </span>
  );
}
