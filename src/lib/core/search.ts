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
  family?: string;
  origin?: string[];
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
  sortKey: string;
}

export function prepare<T extends Searchable>(items: T[]): Prepared<T>[] {
  return items.map((item) => ({
    item,
    nameWords: words(item.name),
    otherWords: [...words(item.common ?? ''), ...words(item.family ?? ''), ...(item.origin ?? []).flatMap(words)],
    sortKey: fold(item.name)
  }));
}

/** Rank: 0 every query word starts a name word, the first one the genus; 1 name words only; 2 mixed; 3 other fields only. */
function rank(p: Prepared<unknown>, qs: string[], match: (q: string, w: string) => boolean): number | null {
  let inName = 0, inOther = 0, genus = false;
  for (const q of qs) {
    const n = p.nameWords.some((w) => match(q, w));
    const o = !n && p.otherWords.some((w) => match(q, w));
    if (!n && !o) return null;
    if (n) inName++;
    else inOther++;
    if (n && match(q, p.nameWords[0])) genus = true;
  }
  if (inOther === 0) return genus ? 0 : 1;
  return inName ? 2 : 3;
}

/** The matches for `q`, best first. Empty query: nothing (the caller shows its own default). */
export function search<T extends Searchable>(prepared: Prepared<T>[], q: string, limit = Infinity): T[] {
  const qs = words(q);
  if (!qs.length) return [];
  const exact = (x: string, w: string) => w.startsWith(x);
  let hits = collect(prepared, qs, exact);
  if (!hits.length && qs.some((x) => x.length >= 4)) hits = collect(prepared, qs, nearPrefix);
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
