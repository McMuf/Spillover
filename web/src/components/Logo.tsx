import { CATEGORY_HUES } from "../design/tokens";
import { luminance } from "../design/tokens";
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

function hueIndex(symbol: string): number {
  let h = 0;
  for (const ch of symbol) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % CATEGORY_HUES.length;
}

export function Logo({ symbol, size = 40 }: { symbol: string; size?: number }) {
  const box = { width: size, height: size };
  const url = logoFor(symbol);
  if (url) {
    return <img src={url} alt="" aria-hidden="true" style={box} className="shrink-0 rounded-full bg-white object-contain p-1" />;
  }
  const brand = brandFor(symbol);
  if (brand) {
    const bg = `#${brand.hex}`;
    // White glyph on dark brand colors, near-black glyph on light ones.
    const glyph = luminance(bg) > 0.4 ? "#111111" : "#ffffff";
    return (
      <span aria-hidden="true" style={{ ...box, background: bg }} className="grid shrink-0 place-items-center rounded-full">
        <svg viewBox="0 0 24 24" width={size * 0.58} height={size * 0.58} focusable="false">
          <path d={brand.path} fill={glyph} />
        </svg>
      </span>
    );
  }
  const hue = CATEGORY_HUES[hueIndex(symbol)] ?? "catBlue";
  return (
    <span
      aria-hidden="true"
      style={{
        ...box,
        fontSize: size * 0.3,
        color: `var(--c-${hue.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())})`,
        background: `color-mix(in srgb, var(--c-${hue.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())}) 18%, var(--c-surface-alt))`,
      }}
      className="grid shrink-0 place-items-center rounded-full font-extrabold tracking-tight"
    >
      {symbol.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase()}
    </span>
  );
}
