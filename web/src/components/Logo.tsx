/**
 * A company or index mark for an instrument. Drop `SYMBOL.svg` (or .png/.webp) into
 * `src/assets/logos/` and it is bundled and shown everywhere that symbol appears; without a file
 * the symbol's initials are shown. Files are bundled, never fetched from a third party at runtime.
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

export function Logo({ symbol, size = 44 }: { symbol: string; size?: number }) {
  const url = logoFor(symbol);
  const box = { width: size, height: size };
  if (url) {
    return <img src={url} alt="" aria-hidden="true" style={box} className="shrink-0 rounded-lg bg-fg/95 object-contain p-1" />;
  }
  return (
    <span
      aria-hidden="true"
      style={{ ...box, fontSize: size * 0.32 }}
      className="grid shrink-0 place-items-center rounded-lg bg-surface-alt font-extrabold tracking-tight text-fg"
    >
      {symbol.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase()}
    </span>
  );
}
