/**
 * Words a page shows from what a build wrote, made a reader's (round eighty-four; outside review A's 6e, review S's 7). A
 * dossier built before this round says of a merged page's key "the key of a page merged here by the owner's decision
 * (scripts/merged-pages.txt)", twice on Ferocactus hamatacanthus: a path in the repository, and an owner the reader does not
 * know. Said here as the build now writes it (`extraWhy`, `$dossier/extra-keys`), so the live corpus reads right before it is
 * derived again; and no parenthesis naming a file of the repository reaches a page.
 */
const MERGED_OLD = /the (key of a )?page merged here by the owner's decision(?: \(scripts\/merged-pages\.txt\))?/g;
const REPO_PATH = /\s*\((?:scripts|src|docs|tests|static)\/[^()\s]*\)/g;
/** The same file named after a colon, as a page built before round eighty-four says its default points ("…with no year: scripts/default-points.txt; …", every page with records; the merge). */
const REPO_PATH_AFTER = /:\s*(?:scripts|src|docs|tests|static)\/[^\s;,()]+/g;

export function readerWords(t: string): string;
export function readerWords(t: string | undefined): string | undefined;
export function readerWords(t: string | undefined): string | undefined {
  if (t == null) return t;
  return t.replace(MERGED_OLD, (_, key) => `the ${key ?? ''}page merged into this one`).replace(REPO_PATH, '').replace(REPO_PATH_AFTER, ', as the reference lists them');
}

/**
 * A map's SVG tied to its caption (round eighty-four; outside review B's 8): both maps are named (`aria-label`) and their
 * captions are the text beside them; `aria-describedby` gives a screen reader that caption as the map's description. Put
 * on the drawn markup's first `<svg>`, so it holds whichever way the map was drawn (the server's HTML or the browser's).
 */
export function describedBy(svg: string, id: string): string {
  const tag = /<svg\b[^>]*>/.exec(svg)?.[0];
  // Added as the tag's last attribute, so the markup still begins as it always has (`<svg class="map …"`).
  return tag && !/\saria-describedby=/.test(tag) ? svg.replace(tag, `${tag.slice(0, -1)} aria-describedby="${id}">`) : svg;
}
