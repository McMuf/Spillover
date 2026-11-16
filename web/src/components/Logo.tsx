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
        <svg viewBox="0 0 24 24" width={size * 0.56} height={size * 0.56} focusable="false">
          <path d={brand.path} fill={glyph} />
        </svg>
      </span>
    );
  }
  // No mark available (indices, ETFs, unknown names): quiet initials, never a made-up color.
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
