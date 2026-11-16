import { luminance } from "../design/tokens";
import { Icon, type IconName } from "./Icon";
import { brandFor } from "../lib/brands";

/**
 * The company mark for a symbol. Lookup order: a file in `src/assets/logos/SYMBOL.(svg|png|webp)`,
 * then the bundled brand set, then colored initials. Always bundled; never fetched at runtime.
 */
const FILES = import.meta.glob<string>("../assets/logos/*.{svg,png,webp}", {
  eager: true,
  query: "?url",
  import: "default",
});

const BY_SYMBOL = new Map<string, string>(
  Object.entries(FILES).map(([path, url]) => [(path.split("/").pop() ?? "").replace(/\.[^.]+$/, "").toUpperCase(), url]),
);

export function logoFor(symbol: string): string | undefined {
  return BY_SYMBOL.get(symbol.toUpperCase());
}

/** Marks that sit better on a dark tile than on white (the rest get a white tile, like an app icon). */
const TILE: Record<string, string> = { AMZN: "#232f3e" };

/** Symbols that are a concept rather than a company: drawn with an icon, never as initials. */
const CONCEPT: Record<string, IconName> = {
  MKT: "trend",
  NONE: "calendar",
  USD: "currency",
  USDJPY: "currency",
  WTI: "drop",
  BLS: "calendar", // the Bureau of Labor Statistics appears as the source of release dates
};

export function Logo({ symbol, size = 40 }: { symbol: string; size?: number }) {
  const box = { width: size, height: size };
  const key = symbol.toUpperCase();
  const url = logoFor(key);
  if (url) {
    return (
      <span aria-hidden="true" style={{ ...box, background: TILE[key] ?? "#ffffff" }} className="grid shrink-0 place-items-center overflow-hidden rounded-full">
        <img src={url} alt="" style={{ width: "62%", height: "62%" }} className="object-contain" />
      </span>
    );
  }
  const concept = CONCEPT[key];
  if (concept) {
    return (
      <span aria-hidden="true" style={box} className="grid shrink-0 place-items-center rounded-full bg-surface-alt text-accent">
        <Icon name={concept} size={Math.round(size * 0.5)} />
      </span>
    );
  }
  const brand = brandFor(symbol);
  if (brand) {
    const bg = `#${brand.hex}`;
    // White glyph on dark brand colors, near-black glyph on light ones.
    const glyph = luminance(bg) > 0.4 ? "#111111" : "#ffffff";
    return (
      <span aria-hidden="true" style={{ ...box, background: bg }} className="grid shrink-0 place-items-center rounded-full">
        <svg viewBox="0 0 24 24" width={size * 0.56} height={size * 0.56} focusable="false">
          <path d={brand.path} fill={glyph} />
        </svg>
      </span>
    );
  }
  // No mark on file for this symbol: quiet initials. Add a file to src/assets/logos/ to replace them.
  return (
    <span
      aria-hidden="true"
      style={{ ...box, fontSize: Math.max(9, size * 0.3) }}
      className="grid shrink-0 place-items-center rounded-full bg-surface-alt font-bold tracking-tight text-fg"
    >
      {symbol.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase()}
    </span>
  );
}
