import { personIcon, useIcons } from "../lib/icons";

/** A deterministic 5x5 mirrored avatar from a handle, so every contributor has a face with no upload. */
function hash(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}

export function identiconCells(handle: string): boolean[][] {
  let h = hash(handle);
  const rows: boolean[][] = [];
  for (let r = 0; r < 5; r++) {
    const left = [0, 1, 2].map(() => {
      h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
      return (h & 3) !== 0;
    });
    rows.push([left[0] ?? false, left[1] ?? false, left[2] ?? false, left[1] ?? false, left[0] ?? false]);
  }
  return rows;
}

export function Identicon({ handle, size = 44 }: { handle: string; size?: number }) {
  // The person's own GitHub profile picture, stored with the site at build time.
  const photo = personIcon(useIcons(), handle);
  if (photo) {
    return <img src={photo} alt="" aria-hidden="true" width={size} height={size} className="shrink-0 bg-surface-alt object-cover" loading="lazy" decoding="async" />;
  }
  const hue = hash(handle) % 360;
  const cell = size / 7;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" focusable="false" className="shrink-0 bg-surface-alt">
      {identiconCells(handle).flatMap((row, r) =>
        row.map((on, c) =>
          on ? <rect key={`${r}-${c}`} x={cell * (c + 1)} y={cell * (r + 1)} width={cell - 1} height={cell - 1} style={{ fill: `hsl(${hue} 55% var(--identicon-l, 46%))` }} /> : null,
        ),
      )}
    </svg>
  );
}
