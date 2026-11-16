/** Picks out names in a headline in the accent color, the way news sites highlight who a story is about. */
export function Highlight({ text, terms }: { text: string; terms: string[] }) {
  const usable = terms.filter((t) => t.trim().length > 1).sort((a, b) => b.length - a.length);
  if (usable.length === 0) return <>{text}</>;
  const escaped = usable.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(?<![\\w&])(${escaped.join("|")})(?![\\w&])`, "g");
  const parts = text.split(re);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <span key={i} className="text-accent">
            {p}
          </span>
        ) : (
          p
        ),
      )}
    </>
  );
}
