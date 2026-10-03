/**
 * The search's postings (round fifty-six, 1): which entries a query can possibly match, from short keys of their
 * words, so the Worker ranks a few hundred entries prepared for the request instead of a shard of whole prepared
 * entries (round fifty-three's first-character shards were 63 MB at nine thousand species, the "c" shard alone larger
 * than the index) or the whole index prepared for a miss (round fifty-four, 3).
 *
 * Every word of an entry (its name, common names, family, origins and older names, as `prepare` splits them) gives
 *   - its prefixes of one, two and three characters, which every exact match of a query word shares: a query word
 *     beginning a word begins with that word's first min(3, |q|) characters; and
 *   - for a word of three characters or more, the first three characters after deleting the first, second or third
 *     character: with the plain three-character prefix, these are what a near match (one insertion, deletion,
 *     substitution or adjacent swap against the start of the word, as `nearPrefix` forgives for a query word of four
 *     letters or more) always shares with the query word's own near keys. The proof is by the position i of the first
 *     difference: past the third character the plain prefixes agree; at i < 3, an insertion in the word is undone by
 *     deleting i from the word, a deletion by deleting i from the query, a substitution by deleting i from both, and a
 *     swap at (i, i+1) by deleting i from the query and i+1 from the word, whose first three characters are then the
 *     word's plain prefix when i is 2. A word of two characters or fewer can never be a near match of a word of four.
 *
 * One namespace for both kinds: a deletion key that equals another word's prefix only adds a candidate, which the
 * ranking then judges; it never loses one. The candidates for a query are the intersection, over its words, of each
 * word's postings (an entry must match every word), so "cop cin" ranks the few entries under both keys.
 */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const words = (s: string) => fold(s).split(/[^a-z0-9]+/).filter(Boolean);

/** The keys an entry's word is posted under. */
export function wordKeys(w: string): string[] {
  const out = new Set<string>();
  for (let n = 1; n <= Math.min(3, w.length); n++) out.add(w.slice(0, n));
  if (w.length >= 3) for (let i = 0; i < 3; i++) out.add((w.slice(0, i) + w.slice(i + 1)).slice(0, 3));
  out.delete('');
  return [...out];
}

/** The key an exact match of query word `q` must share with the word it begins. */
export const exactKey = (q: string) => q.slice(0, 3);

/** The keys a near match of query word `q` (four letters or more) shares with the word it nearly begins, any one of them. */
export function nearKeys(q: string): string[] {
  const out = new Set<string>([q.slice(0, 3)]);
  for (let i = 0; i < 3; i++) out.add((q.slice(0, i) + q.slice(i + 1)).slice(0, 3));
  return [...out];
}

/** Every word of an entry the search reads, as `prepare` splits them (the rank markers in older names included: a superset loses nothing). */
export interface Wordy { name: string; common?: string; family?: string; origin?: string[]; syn?: string[] }
export function entryWords(e: Wordy): string[] {
  return [...words(e.name), ...words(e.common ?? ''), ...words(e.family ?? ''), ...(e.origin ?? []).flatMap(words), ...(e.syn ?? []).flatMap(words)];
}

/** How many posting files a corpus of `n` species is split into: sixty-four up to about ten thousand, doubling past that, as the buckets do. */
export const postingFilesFor = (n: number) => { let f = 64; while (f < 4096 && n > f * 160) f *= 2; return f; };
const fileName = (i: number, files: number) => i.toString(16).padStart(Math.max(2, (files - 1).toString(16).length), '0');
/** The posting file a key is in. */
export function postingFileOf(key: string, files: number): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193) >>> 0;
  return fileName(h % files, files);
}

/** The postings of an index: per file, each key's entries by their place in the index, ascending. Every file is there, an empty one too, so a missing file is never an empty one. */
export function buildPostings(index: Wordy[], files = postingFilesFor(index.length)): Map<string, Record<string, number[]>> {
  const byKey = new Map<string, number[]>();
  index.forEach((e, i) => {
    const keys = new Set<string>();
    for (const w of entryWords(e)) for (const k of wordKeys(w)) keys.add(k);
    for (const k of keys) { const xs = byKey.get(k); if (xs) xs.push(i); else byKey.set(k, [i]); }
  });
  const out = new Map<string, Record<string, number[]>>();
  for (let i = 0; i < files; i++) out.set(fileName(i, files), {});
  for (const k of [...byKey.keys()].sort()) {
    const f = postingFileOf(k, files);
    out.get(f)![k] = byKey.get(k)!;
  }
  return out;
}

const RANK_MARKERS = new Set(['var', 'subsp', 'ssp', 'f']);
/**
 * The query's words the candidates are drawn from, as `search` reads them: a rank marker another word follows is not a
 * word; a trailing one may be dropped by the search, so it does not narrow the candidates unless it is the only word.
 */
export function queryWords(q: string): string[] {
  const all = words(q);
  const qs = all.filter((w, i) => !(RANK_MARKERS.has(w) && i < all.length - 1));
  const slice = qs.length > 1 && RANK_MARKERS.has(qs[qs.length - 1]) ? qs.slice(0, -1) : qs;
  return slice;
}
/**
 * What a query needs read: for the exact pass, one key per word; for the near pass, the near keys of each word of four
 * letters or more and the exact key of each shorter one (a word under four is matched exactly by the near pass too). The
 * near pass is only asked when the exact one finds nothing, as `search` has it. When the query's only long word is a
 * trailing rank marker ("aloe subsp"), the near pass the search runs over all its words is still covered: the marker's
 * own near keys are added then.
 */
export function queryPlan(q: string): { exact: string[][]; near: string[][] | null } {
  const ws = queryWords(q);
  if (!ws.length) return { exact: [], near: null };
  const exact = ws.map((w) => [exactKey(w)]);
  const all = words(q).filter((w, i, a) => !(RANK_MARKERS.has(w) && i < a.length - 1));
  const anyLong = all.some((w) => w.length >= 4);
  if (!anyLong) return { exact, near: null };
  const longInSlice = ws.some((w) => w.length >= 4);
  const near = (longInSlice ? ws : all).map((w) => (w.length >= 4 ? nearKeys(w) : [exactKey(w)]));
  return { exact, near };
}

/** The entries under a plan's keys: per word the union of its keys' postings, then the intersection over the words. */
export function candidates(plan: string[][], posting: (key: string) => number[] | undefined): number[] {
  let acc: Set<number> | null = null;
  // the word with the fewest candidates first, so the sets stay small
  const per = plan.map((keys) => { const s = new Set<number>(); for (const k of keys) for (const i of posting(k) ?? []) s.add(i); return s; }).sort((a, b) => a.size - b.size);
  for (const s of per) {
    if (!acc) { acc = s; continue; }
    const next = new Set<number>();
    for (const i of acc) if (s.has(i)) next.add(i);
    acc = next;
    if (!acc.size) break;
  }
  return acc ? [...acc].sort((a, b) => a - b) : [];
}
