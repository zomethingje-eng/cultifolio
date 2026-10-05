/**
 * Species search over the index. A query is words; each word must begin some
 * word of the entry (its name, common names, family, origins), in any order,
 * so "cop cin", "cinerea copiapoa" and "silver cactus" all find Copiapoa
 * cinerea. When nothing matches at all, each query word of four letters or
 * more is allowed one typing error (a swapped, missing, extra or wrong
 * letter) against the start of a word, so "Conophitum" still finds
 * Conophytum; the relaxed pass is only ever a fallback, so a correct spelling
 * never sees near misses beside its hits. Ranking: name matches before
 * common-name, family or origin matches; among names, the genus first;
 * then alphabetical.
 */
export interface Searchable {
  name: string;
  common?: string;
  /** Every other English common name (round sixty): searched as `common` is. */
  commons?: string[];
  family?: string;
  origin?: string[];
  /** Older names for the same species, as binomials: a label's "Haworthia attenuata" finds Haworthiopsis attenuata (round thirty-one, 3). */
  syn?: string[];
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const words = (s: string) => fold(s).split(/[^a-z0-9]+/).filter(Boolean);

/** Damerau–Levenshtein distance capped at 2, on a prefix of `w` the length of `q` (plus or minus one). */
function nearPrefix(q: string, w: string): boolean {
  if (w.startsWith(q)) return true;
  if (q.length < 4) return false;
  for (const len of [q.length - 1, q.length, q.length + 1]) {
    if (len < 1 || len > w.length) continue;
    if (edit1(q, w.slice(0, len))) return true;
  }
  return false;
}
/** True when a and b are within one edit (insert, delete, replace, or adjacent swap). */
function edit1(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) {
    // one replacement, or one adjacent swap
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  // one insertion or deletion
  return a.length < b.length ? a.slice(i) === b.slice(i + 1) : a.slice(i + 1) === b.slice(i);
}

export interface Prepared<T> {
  item: T;
  nameWords: string[];
  otherWords: string[];
  /** Each older name's words, kept apart: the words of a query that fall to the synonyms must all sit in one of them. */
  synWords: string[][];
  sortKey: string;
}

/**
 * Words a grower writes between the parts of a name that are not themselves words of it: the rank markers in every
 * spelling growers use (var., v., subsp., ssp., subspecies, variety, f., fo., forma, cv.), and the hybrid sign written
 * "x" (the "×" is not a letter, so the tokeniser drops it already). "Aloe x nobilis" found nothing while "Aloe × nobilis"
 * found the species (round sixty; the corpus review, 3). Like the older ones, a marker is a word while it is the last
 * thing typed ("aloe v" is Aloe variegata on its way).
 */
export const RANK_MARKERS: ReadonlySet<string> = new Set(['var', 'v', 'variety', 'subsp', 'ssp', 'subspecies', 'f', 'fo', 'forma', 'cv', 'x']);
/** The markers that end a name's species part (all but the hybrid sign): what follows one is a variety, a form or a cultivar. */
const RANKS: ReadonlySet<string> = new Set([...RANK_MARKERS].filter((m) => m !== 'x'));

/**
 * A cultivar written in quotes, single or double, straight or curly ("Echeveria 'Perle von Nurnberg'", "Echeveria
 * elegans ‘Rainbow’", or still being typed with no closing quote): not words of any species' name, so dropped by the
 * retry (round sixty). Not by the first search: a phone writes "Copiapoa ’cinerea’" with curly quotes for no cultivar at
 * all, and found the species that way before. An apostrophe inside a word ("law's") is not a quote: an opening quote
 * follows a space or starts the text.
 */
const QUOTED = /(^|\s)['"‘’“”][^'"‘’“”]*(?:['"‘’“”](?=[\s.,;:)]|$)|$)/gu;
/** A pasted author citation's first token: a bracket, "&", "ex", "et" ("et al."), or a capitalised abbreviation ("Phil.", "N.E.Br.", "L."); after an epithet written in lower case, any capitalised word. */
const AUTHOR = /^(?:[(&]|ex$|et$|al\.?$|\p{Lu}[\p{L}\p{M}'’-]*\.[\p{L}\p{M}.'’-]*$)/u;
const bare = (t: string) => fold(t).replace(/[^a-z0-9]+/g, '');

/**
 * A query as a grower pastes it, with what is not a word of any name taken out (round sixty; the corpus review, 3; the
 * self-review, 15): an author citation after the epithet ("Copiapoa cinerea (Phil.) Britton & Rose", "Lithops lesliei
 * N.E.Br."), up to the next rank marker, whose epithet may carry its own; and, with `quotes` (the retry), a quoted
 * cultivar. Tokens, as written.
 */
export function cleanQuery(q: string, quotes = false): string[] {
  const tokens = (quotes ? q.replace(QUOTED, ' ') : q).split(/\s+/).filter(Boolean);
  const out: string[] = [];
  // `lower`: the word that completed the name was written in lower case, as an epithet is, so a capitalised word after
  // it is an author ("Copiapoa cinerea Britton & Rose"), where after "Cape Provinces" or "Aloe Vera" it is not.
  let names = 0, need = 2, author = false, lower = false;
  for (const t of tokens) {
    const b = bare(t);
    if (RANKS.has(b)) { author = false; names = 0; need = 1; out.push(t); continue; }
    if (author) continue;
    if (names >= need && (AUTHOR.test(t) || (lower && /^\p{Lu}/u.test(t)))) { author = true; continue; }
    out.push(t);
    if (b && b !== 'x') { names++; lower = /^\p{Ll}/u.test(t); }
  }
  return out;
}
/** The query's words as the search reads them: cleaned (`cleanQuery`), folded, split on anything but a letter or digit. Shared by the search and its postings, so the two read one query. */
export const queryTokens = (q: string): string[] => cleanQuery(q).flatMap(words);

/**
 * The query retried when nothing matches it: its first two words before any rank marker or quoted cultivar ("Copiapoa
 * cinerea var. columna-alba" is "Copiapoa cinerea", "Echeveria cv. Perle" and "Echeveria 'Perle von Nurnberg'" are
 * "Echeveria"), as written. Null when that is the query itself (round sixty; the corpus review, 3: the page then says
 * "Showing results for …").
 */
export function relaxedQuery(q: string): string | null {
  const kept: string[] = [];
  let n = 0;
  for (const t of cleanQuery(q, true)) {
    const b = bare(t);
    if (RANKS.has(b)) break;
    if (b === 'x' || !b) continue;
    const ws = words(t);
    if (n + ws.length <= 2) { kept.push(t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')); n += ws.length; }
    else { kept.push(ws.slice(0, 2 - n).join(' ')); n = 2; }
    if (n >= 2) break;
  }
  if (!kept.length) return null;
  const relaxed = kept.join(' ');
  const a = rankedWords(q), b = rankedWords(relaxed);
  return a.length === b.length && a.every((w, i) => w === b[i]) ? null : relaxed;
}

export function prepare<T extends Searchable>(items: T[]): Prepared<T>[] {
  return items.map((item) => ({
    item,
    nameWords: words(item.name),
    otherWords: [...words(item.common ?? ''), ...(item.commons ?? []).flatMap(words), ...words(item.family ?? ''), ...(item.origin ?? []).flatMap(words)],
    synWords: (item.syn ?? []).map((x) => words(x).filter((w) => !RANK_MARKERS.has(w))),
    sortKey: fold(item.name)
  }));
}

/**
 * Rank: 0 every query word starts a name word, the first one the genus; 1 name words only; 2 mixed; 3 other fields
 * only. A query word not in the name or the other fields may come from an older name, but every such word must come
 * from the same older name: "aloe margaritifera" found Tulista pumila through two of its synonyms, Aloe x and
 * Haworthia margaritifera, which is a name nobody wrote (round thirty-three, 13).
 */
function rank(p: Prepared<unknown>, qs: string[], match: (q: string, w: string) => boolean): number | null {
  let inName = 0, inOther = 0, genus = false;
  const fromSyn: string[] = [];
  for (const q of qs) {
    const n = p.nameWords.some((w) => match(q, w));
    const o = !n && p.otherWords.some((w) => match(q, w));
    if (n) inName++;
    else if (o) inOther++;
    else if (!p.synWords.some((g) => g.some((w) => match(q, w)))) return null; // no word of the entry can take q: no older name can either, so stop here (round fifty-eight)
    else fromSyn.push(q);
    if (n && match(q, p.nameWords[0])) genus = true;
  }
  if (fromSyn.length) {
    if (!p.synWords.some((g) => fromSyn.every((q) => g.some((w) => match(q, w))))) return null;
    inOther += fromSyn.length;
  }
  if (inOther === 0) return genus ? 0 : 1;
  return inName ? 2 : 3;
}

/**
 * The words a query is ranked by: a rank marker ("var", "ssp", "f") is not a word unless it is the last, and a repeated
 * word counts once (round fifty-eight). Exported so the server's short path asks exactly what the ranking asks: "f a"
 * and "a a" are ranked as "a", and went the long way while "a" took the short one (round fifty-nine; the corpus reviews).
 */
export function rankedWords(q: string): string[] {
  const all = queryTokens(q);
  return [...new Set(all.filter((w, i) => !(RANK_MARKERS.has(w) && i < all.length - 1)))];
}

/** Whether the exact pass alone finds anything for `q` in `prepared`: a search over the exact candidates that finds nothing exactly asks the near candidates before it trusts a near pass (round fifty-six, 1). */
export function hasExact<T extends Searchable>(prepared: Prepared<T>[], q: string): boolean {
  const qs = rankedWords(q);
  if (!qs.length) return false;
  const exact = (x: string, w: string) => w.startsWith(x);
  for (const p of prepared) if (rank(p, qs, exact) != null) return true;
  if (qs.length > 1 && RANK_MARKERS.has(qs[qs.length - 1])) for (const p of prepared) if (rank(p, qs.slice(0, -1), exact) != null) return true;
  return false;
}

/** The matches for `q`, best first. Empty query: nothing (the caller shows its own default). */
export function search<T extends Searchable>(prepared: Prepared<T>[], q: string, limit = Infinity): T[] {
  // "var." on a label is not a search word either (round thirty-five, R2-3), but only once another word follows it: "f"
  // on its own is Ferocactus being typed, and "aloe var" is a variegata on its way (round thirty-seven, R1-7).
  // A trailing marker is tried as a word first, and dropped when nothing starts with it ("haworthia pumila var" still
  // finds the name the words before it find).
  const qs = rankedWords(q);
  if (!qs.length) return [];
  const exact = (x: string, w: string) => w.startsWith(x);
  let hits = collect(prepared, qs, exact);
  const trailingMarker = qs.length > 1 && RANK_MARKERS.has(qs[qs.length - 1]);
  if (!hits.length && trailingMarker) hits = collect(prepared, qs.slice(0, -1), exact);
  if (!hits.length && qs.some((x) => x.length >= 4)) hits = collect(prepared, qs, nearPrefix);
  // The near match too without the marker: "copiapoa cinera var" found the species before the marker was a word (round thirty-eight, R1-10).
  if (!hits.length && trailingMarker && qs.slice(0, -1).some((x) => x.length >= 4)) hits = collect(prepared, qs.slice(0, -1), nearPrefix);
  return hits.slice(0, limit).map((h) => h.p.item);
}

function collect<T>(prepared: Prepared<T>[], qs: string[], match: (q: string, w: string) => boolean) {
  const hits: Array<{ p: Prepared<T>; r: number }> = [];
  for (const p of prepared) {
    const r = rank(p, qs, match);
    if (r != null) hits.push({ p, r });
  }
  return hits.sort((a, b) => a.r - b.r || (a.p.sortKey < b.p.sortKey ? -1 : a.p.sortKey > b.p.sortKey ? 1 : 0));
}
