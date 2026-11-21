/**
 * Citations for a claim, ready to paste into a paper: a plain reference and a BibTeX entry. They name
 * the exact claim version, when it was frozen, the scoring rules and engine it is graded by, and the
 * commit of the code and data, so a reader can reproduce every number.
 */
export interface CiteInput {
  id: string;
  title: string;
  author: string;
  registeredAt: string | null; // ISO date-time, or null for a draft
  url: string;
  repo: string;
  commit: string;
  rulesVersion: string;
  engineVersion: string;
}

const day = (iso: string | null) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : null);

export function citeText(i: CiteInput): string {
  const d = day(i.registeredAt);
  const year = d ? d.slice(0, 4) : "n.d.";
  return [
    `${i.author} (${year}). ${i.title.replace(/\.$/, "")}. Spillover claim ${i.id}`,
    d ? `, registered and frozen ${d}` : " (draft, not yet registered)",
    `. Scoring rules ${i.rulesVersion}, engine ${i.engineVersion}. ${i.url}`,
    ` (code and data: https://github.com/${i.repo}, commit ${i.commit}).`,
  ].join("");
}

/** BibTeX special characters escaped, so titles with $, %, & or _ compile. */
function tex(s: string): string {
  return s.replace(/([\\{}&%$#_])/g, "\\$1").replace(/~/g, "\\textasciitilde{}").replace(/\^/g, "\\textasciicircum{}");
}

export function citeBibtex(i: CiteInput): string {
  const d = day(i.registeredAt);
  const key = `spillover_${i.id}`.replace(/[^A-Za-z0-9_]/g, "_");
  return [
    `@misc{${key},`,
    `  author       = {${tex(i.author)}},`,
    `  title        = {{${tex(i.title.replace(/\.$/, ""))}}},`,
    `  year         = {${d ? d.slice(0, 4) : "n.d."}},`,
    `  howpublished = {Spillover claim ${tex(i.id)}},`,
    `  note         = {${d ? `Registered and frozen ${d}` : "Draft, not yet registered"}; scoring rules ${tex(i.rulesVersion)}; engine ${tex(i.engineVersion)}; code and data at commit ${tex(i.commit)} of https://github.com/${i.repo}},`,
    `  url          = {${i.url}}`,
    `}`,
  ].join("\n");
}
