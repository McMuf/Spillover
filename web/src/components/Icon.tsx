/** Spillover's own line icons: 24px grid, 1.75px round strokes. Decorative unless given a label. */

const PATHS = {
  explore: "M4 5h16M4 12h16M4 19h10",
  scoreboard: "M5 20V10M12 20V4M19 20v-7",
  method: "M4 5.5C4 4.7 4.7 4 5.5 4H11v15H5.5C4.7 19 4 18.3 4 17.5zM20 5.5c0-.8-.7-1.5-1.5-1.5H13v15h5.5c.8 0 1.5-.7 1.5-1.5z",
  submit: "M12 5v14M5 12h14",
  source: "M9 6.5 4 12l5 5.5M15 6.5l5 5.5-5 5.5",
  back: "M15 5l-7 7 7 7",
  external: "M7 17 17 7M9 7h8v8",
  bolt: "M13 3 5 13.5h6L10 21l8-10.5h-6z",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4",
  chevronUp: "M6 14l6-6 6 6",
  chevronDown: "M6 10l6 6 6-6",
  chevronRight: "M9 5l7 7-7 7",
  copy: "M9 9h10v11H9zM5 15V4h10",
  flag: "M6 21V4M6 5h11l-2 4 2 4H6",
  bulb: "M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z",
  clock: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v4l3 2",
  trend: "M3 17l6-6 4 4 8-8M15 7h6v6",
  calendar: "M5 6h14v14H5zM5 10h14M9 3v4M15 3v4",
  layers: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5",
  shield: "M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6z",
  lock: "M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3",
  scale: "M12 4v16M5 20h14M5 8h14M5 8l-2 6a3 3 0 0 0 4 0zM19 8l-2 6a3 3 0 0 0 4 0z",
  close: "M6 6l12 12M18 6 6 18",
  star: "M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.2 6.5 20.2l1-6.2L3 9.6l6.2-.9z",
  currency: "M12 3v18M16 7.5c0-1.9-1.8-3-4-3s-4 1.1-4 3 1.8 2.6 4 3 4 1.1 4 3-1.8 3-4 3-4-1.1-4-3",
  drop: "M12 3c3 4 6 7.3 6 10.5a6 6 0 0 1-12 0C6 10.3 9 7 12 3z",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 22, label }: { name: IconName; size?: number; label?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
