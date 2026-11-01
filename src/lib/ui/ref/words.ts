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
  return carried(shapesSource(t))
    .replace(MERGED_OLD, (_, key) => `the ${key ?? ''}page merged into this one`)
    .replace(REPO_PATH, '')
    .replace(REPO_PATH_AFTER, ', as the reference lists them')
    .replace(BUILD_FLAG, '')
    .replace(OPENALEX_PROMISE, OPENALEX_NOW)
    .replace(TWO_ITEMS, (_, a, b, so) => `two Wikidata items carry Kew's identifier for this plant (${a}, ${b})${so ? ', so neither was taken' : ''}`);
}

/** Wikidata's two items for one plant, as the build wrote it ("two items carry Kew's IPNI identifier 676585-1, POWO 676585-1 (Q14952100, Q95967444), so no item was taken"; A16d). */
const TWO_ITEMS = /two items carry Kew's IPNI identifier [^()]*?\((Q\d+), (Q\d+)\)(, so no item was taken)?/g;

/**
 * A build's flags in parentheses, "(--fill inat)", on 170 of the reviewers' 528 pages (round eighty-five; outside review
 * A's 22): the command the owner types, not a word for a reader.
 */
const BUILD_FLAG = /\s*\((?:[^()]*\s)?--[a-z][a-z-]*(?:\s[a-z-]+)?\)/g;
/**
 * The promise a page built from round seventy-eight wrote of its papers (round eighty-five; outside review A's 9f): "a later
 * fill takes the papers from OpenAlex's snapshot", while /about/how says OpenAlex is not asked. What is true of every
 * page: the reference does not ask OpenAlex.
 */
const OPENALEX_PROMISE = /not yet asked for this reference; a later fill takes the papers from OpenAlex's snapshot/g;
export const OPENALEX_NOW = 'the reference does not ask OpenAlex for papers';

/**
 * A row kept from an earlier build of the page (round eighty-five; outside review A's 16d, W13): "carried from build of
 * 2026-10-22 (rederive); that build: not asked: …" is the builder's log. Said as what it is: the reason, then where it
 * was kept from, "(kept from this page's build of 2026-10-22)". Read after the parser's `unchain`, which leaves one origin
 * and one reason.
 */
export function carried(t: string): string {
  const m = /^carried from build of (\d{4}-\d{2}-\d{2})(?:\s*\([^)]*\))?(?:; (that|this) build: (.*))?$/s.exec(t);
  if (!m) return t;
  const [, day, which, reason] = m;
  if (!reason) return `kept from this page's build of ${day}`;
  if (which === 'that') return `${reason} (kept from this page's build of ${day})`;
  // What the later build did: a bare status word said as a reader's words.
  const again = reason === 'skipped' ? 'not asked again' : reason === 'refused' ? 'asked again, and refused' : reason === 'error' ? 'asked again, with no answer' : `asked again: ${reason}`;
  return `kept from this page's build of ${day}; ${again}`;
}

/**
 * The shapes the records are tested against, said in a reader's words (round eighty-five; review D's 10): every
 * range-tested page printed the file's metadata, "…by TDWG's tblLevel3.txt, tblLevel4.txt and tblGazetteer.txt (WGSRPD
 * second edition); Douglas-Peucker 0.02 degrees; coordinates in thousandths of a degree, [lon, lat]; shapes rule r84".
 * The parenthesis that opens with "Natural Earth" becomes what it is, and keeps the rule's name; any other is left.
 */
export function shapesSource(t: string): string {
  const at = t.indexOf('(Natural Earth');
  if (at < 0) return t;
  let depth = 0, end = -1;
  for (let i = at; i < t.length; i++) {
    if (t[i] === '(') depth++;
    else if (t[i] === ')' && --depth === 0) { end = i; break; }
  }
  if (end < 0) return t;
  const inner = t.slice(at + 1, end);
  const rule = /shapes rule (\w+)/.exec(inner)?.[1];
  const islands = /minor islands/i.test(inner);
  const plain = `Natural Earth's provinces${islands ? ' and minor islands' : ''}, placed in TDWG's regions${rule ? `; shapes rule ${rule}` : ''}`;
  return `${t.slice(0, at)}(${plain})${shapesSource(t.slice(end + 1))}`;
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
