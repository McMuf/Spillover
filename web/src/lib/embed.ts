/** The one-line snippet a blogger pastes to show a live claim card. */

const escapeAttr = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** `base` is this site's address without a hash, e.g. https://owner.github.io/Spillover/ */
export function embedUrl(base: string, claimId: string): string {
  return `${base.replace(/#.*$/, "")}#/embed/claims/${encodeURIComponent(claimId)}`;
}

export function embedSnippet(base: string, claimId: string): string {
  const src = embedUrl(base, claimId);
  return (
    `<iframe src="${escapeAttr(src)}" title="Spillover claim ${escapeAttr(claimId)}" ` +
    `width="100%" height="300" style="border:0;max-width:640px" loading="lazy"></iframe>`
  );
}
