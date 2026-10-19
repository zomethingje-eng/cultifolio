/**
 * The search from key files (round seventy-seven; docs/SCALE-STUDY.md section 2.4, 3): the Worker answers a query from a
 * few small files the build writes, and never reads or holds the whole index.
 *
 * **The keys.** Every word of an entry (as `$core/postings` reads it) gives its prefixes: "aloe" gives a, al, alo and aloe.
 * The keys form a tree, one character a level. A key with at most `SEARCH_CAP` entries under it is *light*: its file
 * holds those species as the ranking reads them (`Doc`: the names, the family and regions of origin as numbers into
 * `search/tables.json`, each with its position in the index), and nothing the ranking does not read, so a refresh that
 * changes a photograph or a thumbnail rewrites no key file. A key with more than `SEARCH_SPLIT` (200) species has
 * children too, one character longer, so a long word or a typing error's keys reach a small file; a key with more than
 * `SEARCH_CAP` (2,000) has no file of its own, only its children and its best answers (*heavy*). Keys of one or two
 * characters always have children. At today's 8,947 species that is 13,210 files of 278 MB, median 5 KB; on the real
 * corpus the heavy keys of three characters or more are those of a handful of very common words (var-, cap-, sou-,
 * nor-, pro- and "provinces").
 *
 * **The near keys** (one typing error, `nearPrefix`) are a second tree, "~" before the key, built the same way from the
 * name words (the name, the common names and their spellings, the older names) under every key a near match can share
 * with them: for a word w, its prefixes and the prefixes of w with any one character taken out. A query word q of four
 * letters or more is asked under q's prefix of |q|-1 characters and under each of q with one of those characters taken
 * out: by the position of the first difference, an insertion, a deletion, a substitution or a swap against the start of
 * a word always leaves one of these keys shared (the proof is in `nearKeysOf`). A family or a region of origin is matched as typed
 * only, so its words are posted under their prefixes alone.
 *
 * **A query.** An entry must match every word of the query, so the candidates of any one word hold every hit: the
 * lightest word's files are read, its species prepared with the whole reference's genera and their photograph counts
 * (`search/blocks.json` names blocks of 4,096 counts by position), and ranked by `search` exactly as the whole index ranks
 * them (the order is the same, since the ranking compares hits, never their number). Only then are the hits' entries
 * read, from blocks of 16 entries by position (`show`). Key files are parsed as they come and kept by no cache, and a
 * near pass whose files hold more than `NEAR_CAP` species, or that would rank more than `RANK_CAP` different ones, says
 * `narrow`: what one query parses and ranks is bounded whatever the size of the reference.
 *
 * **A heavy key's best answers.** A heavy key's file holds the whole index's best `SEARCH_HITS` answers to the query of
 * that word alone, by position, as `short.json` held them for one and two letters. A query whose every word is heavy has no other
 * answer: one word alone is answered from them; two words or more ("cape provinces", "a e") are not answered, and the
 * page asks for another letter or word (the owner's decision 6 in the study; `narrow`).
 *
 * **Directories.** The manifest names `search/top.json` (every key of one or two characters) and `search/<n>.json` (the
 * rest, by a hash of a key's first three characters, so one word's keys past two, and a key's children, sit in one
 * file); each maps a key to its count of species and the hash its file is stored under. The key and answer files are
 * stored under their hash like every product, named only by the directories; the count and entry blocks by
 * `search/blocks.json`.
 */
import { words, entryWords, type Wordy } from './postings';
import { prepare, search, hasExact, readingHits, rankedWords, wholeReading, wholeHits, cultivarShape, typedOf, searchGenera, RANK_MARKERS, type Searchable, type Prepared } from './search';

/** A key with more entries than this is heavy: its file would be the size of a large part of the reference. */
export const SEARCH_CAP = 2000;
/**
 * Keys shorter than this always have children, so a word of three letters or more reads a key of at least three: a key
 * of one or two letters holds most of a large reference, and its file (kept while it is light, for a query of short
 * words in a small one) is read only by a word that ends there.
 */
export const SEARCH_FLOOR = 3;
/** How many of the whole index's answers a heavy key keeps: the search route's most (`SHORT_HITS` in $dossier/manifest). */
export const SEARCH_HITS = 100;

/**
 * At most this many species are ranked by a near pass (a typing error): its keys can reach many files, and past this a
 * query says `narrow`, as one whose every word is too common does. Read from the directories' counts before any file.
 */
export const NEAR_CAP = 12000;
/**
 * At most this many different species are ranked by a near pass, which reads several key files; past it the query says
 * `narrow`. (An exact pass reads one file of at most `SEARCH_CAP`.) With `NEAR_CAP`, what one query parses and ranks is
 * bounded whatever the size of the reference: at 8,947 species no typing error of the proof's 8,751 reaches either.
 */
export const RANK_CAP = 2000;
/** How many photograph counts a block holds, and how many entries a show block. */
export const PHOTO_BLOCK = 4096;
export const SHOW_BLOCK = 16;

/**
 * A directory's line for a key: its count and its file (a key with no children), the same and 2 (a light key with
 * children: one shorter than `SEARCH_FLOOR`), its count, its answers and 1 (a heavy key, children listed), or its count
 * alone (a heavy near key, children listed).
 */
export type DirEntry = [number, string] | [number, string, 1 | 2] | [number];
export type Dir = Record<string, DirEntry>;
/**
 * A species as a key file holds it, what the ranking reads: its name, its family and regions of origin as numbers into
 * `search/tables.json` (-1 for no family), its headline common name ('' for none), its other common names, its pooled
 * spellings, its shown and its other older names. Empty fields at the end are left off.
 */
export type Doc = [name: string, family?: number, origin?: number[], common?: string, commons?: string[], spellings?: string[], syn?: string[], older?: string[]];
/** A light key's file: its species as `Doc`s, each with its position in the index, in the index's order. */
export type NodeFile = Array<[number, Doc]>;
/**
 * A heavy key's file, by position in the index: the best answers to the word alone (`a`); the same with no common name
 * written as typed (`b`, when it differs); for a typed form of the word that a common name is written as, its own (`t`);
 * and `x`, 1 when they came from the word as typed (not from a similar spelling), so they answer the word with a
 * trailing rank marker too.
 */
export interface Answers { a: number[]; b?: number[]; t?: Record<string, number[]>; x?: 1 }
/** `search/tables.json`: the families and regions of origin a `Doc` numbers. */
export interface Tables { families: string[]; regions: string[] }
/** `search/blocks.json`: the photograph-count blocks and the show blocks, by hash, in position order. */
export interface Blocks { photos: string[]; show: string[] }

/** How many directory files a corpus of `n` species has beside `top.json`: sixty-four up to about ten thousand, doubling past that. */
export const searchDirsFor = (n: number) => { let f = 64; while (f < 4096 && n > f * 160) f *= 2; return f; };
const fnv = (s: string) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0; return h; };
/** The directory a key is listed in: `top` for a key of one or two characters, else by its first three (with the "~" of a near key), so a word's keys past two characters, and a key's children, are in one file. */
export function searchDirOf(key: string, dirs: number): string {
  const near = key.startsWith('~');
  const bare = near ? key.slice(1) : key;
  if (bare.length <= 2) return 'top';
  return String(fnv((near ? '~' : '') + bare.slice(0, 3)) % dirs);
}
/** Every file a manifest names for the search from key files. */
export const searchFileNames = (species: number): string[] => ['search/top.json', 'search/genera.json', 'search/tables.json', 'search/blocks.json', ...Array.from({ length: searchDirsFor(species) }, (_, i) => `search/${i}.json`)];

/** The words a near match reads (`nearPrefix`): the name, the common names and their spellings, the older names. */
const nameWordsOf = (e: Wordy) => [...words(e.name), ...words(e.common ?? ''), ...(e.commons ?? []).flatMap(words), ...(e.spellings ?? []).flatMap(words), ...(e.syn ?? []).flatMap(words), ...(e.older ?? []).flatMap(words)];
const drop = (w: string, j: number) => w.slice(0, j) + w.slice(j + 1);

/** An entry's exact keys of `len` characters: the prefix of that length of each of its words. */
function exactKeysAt(e: Wordy, len: number, out: Set<string>): void {
  for (const w of entryWords(e)) if (w.length >= len) out.add(w.slice(0, len));
}
/**
 * An entry's near keys of `len` characters: of each name word w, the prefix of w with one of its first `len` characters
 * taken out. Its plain prefixes are its exact keys, which a near query reads too, and a family or region word has no near
 * keys at all, since it is matched as typed in either pass.
 */
function nearKeysAt(e: Wordy, len: number, out: Set<string>): void {
  for (const w of nameWordsOf(e)) {
    // Under three characters (keys with no file, always split) the prefix too, so every near key of three has its parents.
    if (len < SEARCH_FLOOR && w.length >= len) out.add(w.slice(0, len));
    if (w.length - 1 >= len) for (let j = 0; j < len; j++) out.add(drop(w, j).slice(0, len));
  }
}

/**
 * The keys a query word of four letters or more is asked under in the near pass, each in both trees: q's prefix of
 * m = |q|-1 characters and q with any one of its first m characters taken out (which is m characters long). A near
 * match of q is a prefix p of a word w with |p| between |q|-1 and |q|+1 and one edit apart from q. Let i be where they
 * first differ. If i ≥ m, q's prefix of m is w's (an exact key). Otherwise: a substitution at i leaves q less i equal to
 * the prefix of w less i; an insertion in p leaves q's prefix equal to the prefix of w less i; a deletion leaves q less i
 * equal to w's prefix; a swap of i and i+1 leaves q less i equal to the prefix of w less i+1. w is long enough to give m
 * characters in each case, so each is one of w's exact keys of length m, or one of its near keys of length m
 * (`nearKeysAt`), or, for w less j with j ≥ m, w's exact key of length m.
 *
 * Down a tree a key's parent stands in for it: an exact parent holds every entry its children hold; a near parent of
 * length L holds every entry its child holds through a character taken out before L, and the rest (taken out at L or
 * later) begin with the parent's characters, so they are under the exact key of length L (`searchFromFiles` reads both).
 */
export function nearKeysOf(q: string): string[] {
  const m = q.length - 1;
  const out = new Set<string>([q.slice(0, m)]);
  for (let i = 0; i < m; i++) out.add(drop(q, i).slice(0, m));
  return [...out];
}

/* ---------------- the build ---------------- */

export interface SearchBuild {
  /** The files a manifest names: `search/top.json`, `search/genera.json` and every `search/<n>.json`. */
  named: Map<string, string>;
  /** The node and answer files, by hash: stored like every product, named only by the directories (empty when `sink` took them). */
  stored: Map<string, string>;
  /** Every node and answer file's hash. */
  hashes: Set<string>;
  /** For the report: light files and their rows, heavy keys, of each tree. */
  counts: { exactFiles: number; exactRows: number; nearFiles: number; nearRows: number; heavy: number; nearHeavy: number };
}

/**
 * A key with more species than this has children too, so a long word, or a typing error's keys, reach a small file: a
 * key's own file (kept while it has at most `SEARCH_CAP`) is read only by a word that ends there.
 */
export const SEARCH_SPLIT = 200;
/** Whether a key has children: one shorter than `SEARCH_FLOOR`, or one with more species than `SEARCH_SPLIT`. */
const split = (k: string, count: number) => k.length < SEARCH_FLOOR || count > SEARCH_SPLIT;
/** A tree of keys over the index: every key of one character, and each key whose parent has children (`split`), with its entries' positions. */
function tree(index: readonly Wordy[], keysAt: (e: Wordy, len: number, out: Set<string>) => void): Map<string, number[]> {
  const out = new Map<string, number[]>();
  let heavy: Set<string> | null = null;
  for (let len = 1; ; len++) {
    const level = new Map<string, number[]>();
    const keys = new Set<string>();
    index.forEach((e, i) => {
      keys.clear();
      keysAt(e, len, keys);
      for (const k of keys) {
        if (heavy && !heavy.has(k.slice(0, len - 1))) continue;
        const xs = level.get(k);
        if (xs) xs.push(i); else level.set(k, [i]);
      }
    });
    const next = new Set<string>();
    for (const [k, xs] of level) { out.set(k, xs); if (split(k, xs.length)) next.add(k); }
    if (!next.size) return out;
    heavy = next;
  }
}

/**
 * The search's key files for an index. `whole` is the index prepared (the build has it for the heavy keys' answers), and
 * `hash` names a file's body as the products are named.
 */
export function buildSearchFiles<T extends Searchable & Wordy>(index: readonly T[], whole: Prepared<T>[], hash: (body: string) => string, sink?: (hash: string, body: string) => void): SearchBuild {
  const dirs = searchDirsFor(index.length);
  const listed = new Map<string, Dir>([['top', {}], ...Array.from({ length: dirs }, (_, i) => [String(i), {}] as [string, Dir])]);
  const stored = new Map<string, string>();
  const counts = { exactFiles: 0, exactRows: 0, nearFiles: 0, nearRows: 0, heavy: 0, nearHeavy: 0 };
  const json = index.map((e) => JSON.stringify(e));
  const families = [...new Set(index.map((e) => e.family).filter((f): f is string => !!f))].sort();
  const regions = [...new Set(index.flatMap((e) => e.origin ?? []))].sort();
  const fam = new Map(families.map((f, i) => [f, i])), region = new Map(regions.map((p, i) => [p, i]));
  const docs = index.map((e) => {
    const d: unknown[] = [e.name, e.family ? fam.get(e.family)! : -1, (e.origin ?? []).map((o) => region.get(o)!), e.common ?? '', e.commons ?? [], e.spellings ?? [], e.syn ?? [], e.older ?? []];
    while (d.length > 1 && (Array.isArray(d[d.length - 1]) ? !(d[d.length - 1] as unknown[]).length : d[d.length - 1] === '' || d[d.length - 1] === -1)) d.pop();
    return JSON.stringify(d);
  });
  const hashes = new Set<string>();
  // Each body to the sink as it is made, when one is given: at fifty thousand species they are gigabytes, never held at once.
  const store = (body: string) => { const h = hash(body); if (!hashes.has(h)) { hashes.add(h); if (sink) sink(h, body); else stored.set(h, body); } return h; };
  const nodeBody = (xs: number[]) => `[${xs.map((i) => `[${i},${docs[i]}]`).join(',')}]`;
  const list = (key: string, entry: DirEntry) => { listed.get(searchDirOf(key, dirs))![key] = entry; };
  const posOf = new Map(index.map((e, i) => [e, i]));
  const light = (k: string, xs: number[]): DirEntry => (split(k, xs.length) ? [xs.length, store(nodeBody(xs)), 2] : [xs.length, store(nodeBody(xs))]);
  for (const [k, xs] of tree(index, exactKeysAt)) {
    if (xs.length <= SEARCH_CAP) { list(k, light(k, xs)); counts.exactFiles++; counts.exactRows += xs.length; continue; }
    list(k, [xs.length, store(JSON.stringify(answersOf(index, whole, k, xs, posOf))), 1]);
    counts.heavy++;
  }
  for (const [k, xs] of tree(index, nearKeysAt)) {
    // A near key is asked at three characters or more (`nearKeysOf`), so one shorter needs no file.
    if (xs.length <= SEARCH_CAP && k.length >= SEARCH_FLOOR) { list(`~${k}`, light(k, xs)); counts.nearFiles++; counts.nearRows += xs.length; continue; }
    list(`~${k}`, [xs.length]);
    counts.nearHeavy++;
  }
  const named = new Map<string, string>();
  const sorted = (d: Dir) => JSON.stringify(Object.fromEntries(Object.entries(d).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))));
  named.set('search/top.json', sorted(listed.get('top')!));
  for (let i = 0; i < dirs; i++) named.set(`search/${i}.json`, sorted(listed.get(String(i))!));
  named.set('search/genera.json', JSON.stringify([...searchGenera(index)].sort()));
  named.set('search/tables.json', JSON.stringify({ families, regions } satisfies Tables));
  const blocks: Blocks = { photos: [], show: [] };
  for (let b = 0; b * PHOTO_BLOCK < index.length; b++) blocks.photos.push(store(JSON.stringify(index.slice(b * PHOTO_BLOCK, (b + 1) * PHOTO_BLOCK).map((e) => (typeof e.photos === 'number' ? e.photos : 0)))));
  for (let b = 0; b * SHOW_BLOCK < index.length; b++) blocks.show.push(store(`[${json.slice(b * SHOW_BLOCK, (b + 1) * SHOW_BLOCK).join(',')}]`));
  named.set('search/blocks.json', JSON.stringify(blocks));
  return { named, stored, hashes, counts };
}

/** Words a typed form of a word may carry beside it and still be read as the word alone. */
const IDLE = new Set([...RANK_MARKERS, 'sp', 'spp', 'nov']);
/**
 * A heavy key's answers: the whole index's best to the word typed as the word (`a`), and, where a common name of one of
 * its entries is written as the word with other marks ("Cape." is not one; "Aloë-" would be), to that typed form too.
 * `b`, when it differs from `a`, is the answer to a typed form no common name is written as.
 */
function answersOf<T extends Searchable & Wordy>(index: readonly T[], whole: Prepared<T>[], k: string, xs: number[], at: ReadonlyMap<T, number>): Answers {
  const pos = (hits: T[]) => hits.map((h) => at.get(h)!);
  const out: Answers = { a: pos(search(whole, k, SEARCH_HITS)), ...(hasExact(whole, k) ? { x: 1 as const } : {}) };
  const a = out.a;
  const texts = new Set<string>();
  let asWord = false;
  for (const i of xs) {
    const e = index[i];
    for (const c of [e.common, ...(e.commons ?? []), ...(e.spellings ?? [])]) {
      if (!c || !words(c).length) continue;
      const t = typedOf(c);
      if (t === k) { asWord = true; continue; }
      const ws = words(c).filter((w) => !IDLE.has(w));
      if (ws.length === 1 && ws[0] === k) texts.add(t);
    }
  }
  const same = (x: number[], y: number[]) => x.length === y.length && x.every((v, i) => v === y[i]);
  if (asWord) { const b = pos(search(whole, k, SEARCH_HITS, '')); if (!same(a, b)) out.b = b; }
  for (const t of [...texts].sort()) { const x = pos(search(whole, k, SEARCH_HITS, t)); if (!same(x, out.b ?? a)) (out.t ??= {})[t] = x; }
  return out;
}

/* ---------------- a query ---------------- */

export interface SearchReader<T> {
  /** How many `search/<n>.json` the manifest names. */
  dirs: number;
  /** A directory, `top` or a number. A directory the bucket cannot give throws (the caller's 503); so does every file below. */
  dir(name: string): Promise<Dir>;
  /** A light key's file, by hash, as text (`NodeFile`): parsed by the search as it is used, and kept by no cache. */
  node(hash: string): Promise<string>;
  /** A heavy key's answers, by hash. */
  answers(hash: string): Promise<Answers>;
  /** Every genus of the reference, folded: what the ranking reads a family's start against (`prepare`). */
  genera(): Promise<ReadonlySet<string>>;
  /** The families and regions of origin a `Doc` numbers. */
  tables(): Promise<Tables>;
  /** The photograph counts of positions b × `PHOTO_BLOCK` on. */
  photos(b: number): Promise<number[]>;
  /** The index entries of positions b × `SHOW_BLOCK` on, as the index holds them. */
  show(b: number): Promise<T[]>;
}
/** A candidate as the ranking reads it, with its position. */
type Cand = Searchable & { at: number };
/** What a word's candidates are: none (no entry has a word so begun), a light set of files, or heavy (with the answers of a heavy exact key). */
type Bound = { kind: 'none' } | { kind: 'light'; count: number; files: string[] } | { kind: 'heavy'; answers?: string };
/** `reads`: files read; `ranked`: species ranked; `nearCount`: the near pass's bound, as the directories count it (0 when none ran). */
export type KeyAnswer<T> = ({ hits: T[] } | { narrow: true }) & { reads: number; ranked: number; nearCount: number };

/**
 * The answer to `q` from the key files: the hits as the whole index ranks them, best first, `n` at most; or `narrow`
 * when every word the answer must hold is too common to list and the query is more than one word. `charge` is told how
 * many candidates each pass ranks and may stop the request (the caller's allowance).
 */
export async function searchFromFiles<T>(r: SearchReader<T>, q: string, n: number, charge: (ranked: number) => Promise<boolean> = async () => false, nearCap = NEAR_CAP, rankCap = RANK_CAP): Promise<KeyAnswer<T> | { stop: true }> {
  try {
    return await searchFromFilesOnce(r, q, n, charge, nearCap, rankCap);
  } catch (e) {
    if (e instanceof TooMany) return { narrow: true, reads: e.reads, ranked: 0, nearCount: e.nearCount };
    throw e;
  }
}
/** A near pass that would rank more than `RANK_CAP` species: answered `narrow`. */
class TooMany extends Error { reads = 0; nearCount = 0; }
async function searchFromFilesOnce<T>(r: SearchReader<T>, q: string, n: number, charge: (ranked: number) => Promise<boolean>, nearCap: number, rankCap: number): Promise<KeyAnswer<T> | { stop: true }> {
  let reads = 0, ranked = 0, nearCount = 0;
  const dirsRead = new Map<string, Promise<Dir>>();
  const dirOf = (name: string) => { let p = dirsRead.get(name); if (!p) { reads++; dirsRead.set(name, (p = r.dir(name))); } return p; };
  const line = async (key: string): Promise<DirEntry | undefined> => { const d = await dirOf(searchDirOf(key, r.dirs)); return Object.hasOwn(d, key) ? d[key] : undefined; };
  /**
   * A key's bound: down its tree from one character, to the key itself or to a key on the way with no children (whose
   * file holds every entry the key would). A key missing under a parent with children has no entries.
   */
  const descend = async (ns: '' | '~', s: string): Promise<Bound & { at: number; split?: true }> => {
    for (let len = 1; len <= s.length; len++) {
      const e = await line(ns + s.slice(0, len));
      if (!e) return { kind: 'none', at: len };
      if (e.length === 2) return { kind: 'light', count: e[0], files: [e[1]], at: len };
      if (len < s.length) continue;
      if (e.length === 3 && e[2] === 2) return { kind: 'light', count: e[0], files: [e[1]], at: len, split: true };
      return { kind: 'heavy', ...(e.length === 3 ? { answers: e[1] } : {}), at: len };
    }
    return { kind: 'none', at: s.length };
  };
  const exactBound = (w: string) => descend('', w);
  /** The union of some bounds: heavy if any is, else every light one's files (a file two keys share, once). */
  const union = (bs: Bound[]): Bound => {
    if (bs.some((b) => b.kind === 'heavy')) return { kind: 'heavy' };
    const files = [...new Set(bs.flatMap((b) => (b.kind === 'light' ? b.files : [])))];
    return files.length ? { kind: 'light', count: bs.reduce((x, b) => x + (b.kind === 'light' ? b.count : 0), 0), files } : { kind: 'none' };
  };
  const nearBound = async (w: string): Promise<Bound> => {
    if (w.length < 4) return exactBound(w); // a word under four letters is matched as typed in the near pass too
    // Each key in the near tree, and in the exact tree at the length the near tree stopped at (`nearKeysOf`); a near key
    // missing under three characters means no name word begins so, and nothing is taken out after it. The prefix of
    // |w|-1 in the exact tree in any case: a region of origin or family matched as typed.
    const keys = nearKeysOf(w);
    const bs = await Promise.all(keys.map(async (k) => { const n = await descend('~', k); return n.kind === 'none' && n.at < SEARCH_FLOOR ? [n] : [n, ...(await rest(k, n.at))]; }));
    return union([...bs.flat(), await exactBound(keys[0])]);
  };
  /**
   * The entries a near key `s` holds through a character taken out at `at` or later, which the near tree stopped short
   * of: a word w with w less j beginning s, for j from `at` to |s|. For each j, w begins s's first j characters, then any
   * one character, then the rest of s; for j = |s|, w begins s. The exact key of s's first j characters stands for all of
   * them from j on while it is light; where it is heavy (the "pro" of "provinces"), each of its children c is read as
   * s's first j characters, c and the rest of s, and j moves on by one.
   */
  const rest = async (s: string, at: number): Promise<Bound[]> => {
    const out: Bound[] = [];
    for (let j = at; ; j++) {
      if (j >= s.length) { out.push(await descend('', s)); return out; }
      const head = s.slice(0, j);
      const b = await descend('', head);
      // A light key with no children stands for every j from here; one with children (more than `SEARCH_SPLIT`) is read
      // through them, as a heavy one is, since the words wanted run on past it.
      if (b.kind !== 'heavy' && !(b.kind === 'light' && b.split && b.at === j)) { out.push(b); return out; }
      const d = await dirOf(searchDirOf(`${head}?`, r.dirs));
      const kids = Object.keys(d).filter((k) => k.length === j + 1 && k.startsWith(head));
      out.push(...(await Promise.all(kids.map((k) => descend('', k + s.slice(j))))));
      if (out.some((x) => x.kind === 'heavy')) return out;
    }
  };
  /** The lightest of some words' bounds: none first (no candidates at all), else the fewest entries; null when every one is heavy. */
  const lightest = (bs: Bound[]): Bound | null => {
    let best: Bound | null = null;
    for (const b of bs) {
      if (b.kind === 'none') return b;
      if (b.kind === 'light' && (!best || best.kind !== 'light' || b.count < best.count)) best = b;
    }
    return best;
  };
  /** A light bound's species, in the index's order, as the ranking reads them: the key files' `Doc`s with their photograph counts. */
  const read = async (b: Bound, cap = Infinity): Promise<Cand[]> => {
    if (b.kind !== 'light') return [];
    reads += b.files.length;
    // Each file parsed as it comes and let go once its species are taken: what a pass holds is the species it ranks,
    // never every file at once (a typing error's keys reach files that share most of their species).
    const byAt = new Map<number, Doc>();
    await Promise.all(b.files.map(async (h) => { for (const [i, d] of JSON.parse(await r.node(h)) as NodeFile) if (!byAt.has(i)) byAt.set(i, d); }));
    if (byAt.size > cap) throw Object.assign(new TooMany(), { reads, nearCount });
    const ats = [...byAt.keys()].sort((a, b) => a - b);
    const t = await r.tables();
    const blocks = [...new Set(ats.map((i) => Math.floor(i / PHOTO_BLOCK)))];
    reads += blocks.length;
    const counts = new Map(await Promise.all(blocks.map(async (k) => [k, await r.photos(k)] as const)));
    return ats.map((i) => {
      const [name, family = -1, origin = [], common = '', commons = [], spellings = [], syn = [], older = []] = byAt.get(i)!;
      return { at: i, name, family: family >= 0 ? t.families[family] : undefined, origin: origin.map((o) => t.regions[o]), common: common || undefined, commons, spellings, syn, older, photos: counts.get(Math.floor(i / PHOTO_BLOCK))![i % PHOTO_BLOCK] };
    });
  };
  /** The entries of the hits, in their order: from the show blocks, read only for them. */
  const show = async (ats: number[]): Promise<T[]> => {
    const blocks = [...new Set(ats.map((i) => Math.floor(i / SHOW_BLOCK)))];
    reads += blocks.length;
    const got = new Map(await Promise.all(blocks.map(async (k) => [k, await r.show(k)] as const)));
    return ats.map((i) => got.get(Math.floor(i / SHOW_BLOCK))![i % SHOW_BLOCK]);
  };
  const hitsOf = async (cs: Cand[]) => ({ hits: await show(cs.map((c) => c.at)) });
  const done = (x: { hits: T[] } | { narrow: true }): KeyAnswer<T> => ({ ...x, reads, ranked, nearCount });
  const rank = async (cands: Cand[]) => { ranked += cands.length; return charge(cands.length); };

  const qs = rankedWords(q);
  if (!qs.length) return done({ hits: [] });
  // The words every hit holds: all of them but a trailing rank marker, which the search may drop ("aloe var").
  const trailing = qs.length > 1 && RANK_MARKERS.has(qs[qs.length - 1]);
  const held = trailing ? qs.slice(0, -1) : qs;
  const genera = r.genera();
  const exact = lightest(await Promise.all(held.map(exactBound)));
  if (exact) {
    const cands = await read(exact);
    if (await rank(cands)) return { stop: true };
    const pe = prepare(cands, await genera);
    if (hasExact(pe, q)) return done(await hitsOf(search(pe, q, n)));
    // Nothing matches as typed: the near pass, as `search` runs it, only for a word of four letters or more.
    if (!qs.some((x) => x.length >= 4)) return done({ hits: [] });
    const near = lightest(await Promise.all(held.map(nearBound)));
    if (near?.kind === 'light') nearCount = near.count;
    if (!near || (near.kind === 'light' && near.count > nearCap)) return done({ narrow: true });
    const nc = await read(near, rankCap);
    if (await rank(nc)) return { stop: true };
    return done(await hitsOf(search(prepare(nc, await genera), q, n)));
  }
  // Every word the hits hold is heavy. The whole query read as one common name first, from a light word of its own.
  if (wholeReading(q)) {
    const w = lightest(await Promise.all(wholeReading(q)!.map(exactBound)));
    if (!w) return done({ narrow: true });
    const cands = await read(w);
    if (await rank(cands)) return { stop: true };
    const hits = wholeHits(prepare(cands, await genera), q, n) ?? [];
    if (hits.length) return done(await hitsOf(hits));
  }
  // A trailing rank marker the hits may hold as a word ("cape var"): from its own light key, when anything has both.
  let full: 'none' | 'unknown' = 'unknown';
  if (trailing) {
    const m = await exactBound(qs[qs.length - 1]);
    if (m.kind !== 'heavy') {
      const cands = await read(m);
      if (await rank(cands)) return { stop: true };
      const hits = readingHits(prepare(cands, await genera), q, n);
      if (hits.length) return done(await hitsOf(hits));
      full = 'none';
    }
  }
  // One word alone (or with a trailing marker nothing holds with it): the whole index's answers to it, kept by the build.
  if (held.length === 1 && !cultivarShape(q) && (!trailing || full === 'none')) {
    const b = await exactBound(held[0]);
    if (b.kind === 'heavy' && b.answers) {
      reads++;
      const a = await r.answers(b.answers);
      // With a marker the search reads the word alone only once the word as typed matched: kept answers of a similar
      // spelling are the word's alone, never the marker's.
      if (!trailing || a.x === 1) {
        const typed = typedOf(q);
        const list = typed === held[0] ? a.a : a.t && Object.hasOwn(a.t, typed) ? a.t[typed] : (a.b ?? a.a);
        return done({ hits: await show(list.slice(0, n)) });
      }
    }
  }
  return done({ narrow: true });
}
