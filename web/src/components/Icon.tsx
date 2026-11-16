/** Spillover's own line icons: 24px grid, 2px round strokes. Decorative unless given a label. */

const PATHS = {
  explore: "M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM8 9h8M8 13h8M8 17h5",
  scoreboard: "M12 3a9 9 0 1 0 9 9h-9zM15 3.6A9 9 0 0 1 20.4 9H15z",
  method: "M4 5.5C4 4.7 4.7 4 5.5 4H11v15H5.5C4.7 19 4 18.3 4 17.5zM20 5.5c0-.8-.7-1.5-1.5-1.5H13v15h5.5c.8 0 1.5-.7 1.5-1.5z",
  submit: "M12 5v14M5 12h14",
  source: "M9 6.5 4 12l5 5.5M15 6.5l5 5.5-5 5.5",
  back: "M15 5l-7 7 7 7",
  external: "M7 17 17 7M9 7h8v8",
  bolt: "M13 3 5 13.5h6L10 21l8-10.5h-6z",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4",
  chevronUp: "M6 14l6-6 6 6",
  chevronDown: "M6 10l6 6 6-6",
  copy: "M9 9h10v11H9zM5 15V4h10",
  flag: "M6 21V4M6 5h11l-2 4 2 4H6",
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
      strokeWidth="2"
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
