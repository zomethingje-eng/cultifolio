/** The reference as the client pages read it: a few species by hash bucket, a search by the server, a sheet by bucket. */
import type { IndexEntry } from '$lib/server/dossiers';
import { bucketOf, BUCKETS } from '$core/bucket';
import { speciesOf, speciesSlug } from '$core/names';
// The whole index is no longer fetched by any page (round thirty-nine): a species is asked for by hash bucket
// (`entriesFor`), and a search is answered by the server (`searchCatalogue`).

/**
 * Entries for a few species (a grower's own), asked for by hash bucket so the names never leave the device: the plants
 * list, the labels and the front page's own tiles need these and not the whole catalogue. Null when the reference could
 * not be reached; a slug the reference lacks is simply absent from the map. Buckets already fetched are kept for the
 * page's life, and the service worker keeps the answers for the greenhouse.
 */
const bucketCache = new Map<string, Promise<IndexEntry[] | null>>();

/**
 * The corpus id for reference requests (`?c=`): asked of /api/corpus once per page life (never cached anywhere), and
 * remembered in this browser so that offline the requests carry the id they carried last, which is what the worker
 * holds. A corpus refresh is an upload, not a deploy; the id is what turns the caches over (round twelve, 7).
 */
const CORPUS_KEY = 'cultifolio.corpus';
export type CorpusInfo = { id: string; buckets: number };
let corpusP: Promise<CorpusInfo> | null = null;
/**
 * The corpus id and the number of buckets its species are split into (round fifty-three, 2): a device hashes a slug
 * by the count the server announced, never by a count compiled in, so a corpus that grew past thirty-two buckets is
 * asked for by the right one. The pair is remembered together, since a bucket name is only meaningful under its corpus.
 */
export function corpusInfo(): Promise<CorpusInfo> {
  if (!corpusP) {
    const p = fetch('/api/corpus', { cache: 'no-store', signal: AbortSignal.timeout(10_000) })
      .then((r) => (r.ok ? (r.json() as Promise<{ id: string; buckets?: number }>) : null))
      .then((j) => {
        const id = j?.id ?? '';
        const buckets = Number.isInteger(j?.buckets) && j!.buckets! >= 1 ? j!.buckets! : BUCKETS;
        if (id) { try { localStorage.setItem(CORPUS_KEY, JSON.stringify({ id, buckets })); } catch { /* private mode */ } }
        // An answer that did not come (offline) is not kept for the page's life: the next ask tries the server again, so a
        // device that comes online mid-session reads the corpus it is now served (round fifty-four, 3; both reviewers).
        if (!id) { if (corpusP === p) corpusP = null; return remembered(); }
        const got = { id, buckets };
        if (corpusP === p) corpusResolved = got;
        return got;
      })
      .catch(() => { if (corpusP === p) corpusP = null; return remembered(); });
    corpusP = p;
  }
  return corpusP;
}
/**
 * Forget the corpus read that a bucket request was made under: a 409 says its count is not the one served. Only that
 * read is forgotten: a read another caller started since is left alone (round fifty-five, 3; the first reviewer's finding 18).
 */
const forgetCorpus = (used: CorpusInfo) => { if (corpusResolved === used) { corpusP = null; corpusResolved = null; } };
let corpusResolved: CorpusInfo | null = null;
const remembered = (): CorpusInfo => {
  try {
    const raw = localStorage.getItem(CORPUS_KEY);
    if (!raw) return { id: '', buckets: BUCKETS };
    const j = JSON.parse(raw) as CorpusInfo;
    return { id: typeof j.id === 'string' ? j.id : '', buckets: Number.isInteger(j.buckets) && j.buckets >= 1 ? j.buckets : BUCKETS };
  } catch { return { id: '', buckets: BUCKETS }; }
};
/** The corpus id on a request that is not a bucket (a search, a window of rows): `n` there is the request's own limit, and no count is named (the first reviewer's finding 24). */
const withCorpus = async (url: string) => { const c = await corpusInfo(); return c.id ? `${url}&c=${encodeURIComponent(c.id)}` : url; };
/**
 * A bucket request under one captured corpus read: the id and the count it names are the ones its bucket names were
 * hashed by, never a second read (round fifty-five, 3; both reviewers). A 409 says the count is not the one served; the
 * read is forgotten and the caller hashes again under a fresh one, once. A second 409 is "not reached", never an empty bucket.
 */
async function bucketFetch(url: string, info: CorpusInfo): Promise<Response | null> {
  const r = await timed(`${url}${info.id ? `&c=${encodeURIComponent(info.id)}` : ''}&n=${info.buckets}`);
  if (r.status === 409) { forgetCorpus(info); return null; }
  return r;
}
/** A reference request gives up after ten seconds: a half-open connection (greenhouse Wi-Fi, a captive portal) otherwise hangs a page for minutes, where "not reached" is the answer it should give (round fourteen, 4). */
const timed = (url: string) => fetch(url, { signal: AbortSignal.timeout(10_000) });
/** A bucket's cache key carries the corpus and the count: a bucket named under one count is another set of species under another (round fifty-five, 3; the first reviewer's finding 17). */
const ckey = (info: CorpusInfo, b: string) => `${info.id}/${info.buckets}/${b}`;
export async function entriesFor(slugs: Iterable<string>, again = false): Promise<Map<string, IndexEntry> | null> {
  const list = [...new Set(slugs)].filter(Boolean);
  const out = new Map<string, IndexEntry>();
  if (!list.length) return out;
  const want = new Set(list);
  const info = await corpusInfo();
  const count = info.buckets;
  const buckets = [...new Set(list.map((s) => bucketOf(s, count)))].sort();
  const missing = buckets.filter((b) => !bucketCache.has(ckey(info, b)));
  for (let i = 0; i < missing.length; i += 4) {
    const chunk = missing.slice(i, i + 4); // four a request: each bucket is its own edge-cache entry, and a request names few enough that the URLs repeat
    const p = bucketFetch(`/api/entries?b=${chunk.join(',')}`, info).then((r) => (r?.ok ? (r.json() as Promise<IndexEntry[]>) : null)).catch(() => null);
    for (const b of chunk) bucketCache.set(ckey(info, b), p.then((all) => (all ? all.filter((e) => bucketOf(e.slug, count) === b) : null)));
  }
  // As `sheetsFor`: every failed bucket is let go before the failure is answered, so the next call asks for all of them
  // again (round sixty-two; agent A).
  let failed = false;
  for (const b of buckets) {
    const entries = await bucketCache.get(ckey(info, b));
    if (!entries) { bucketCache.delete(ckey(info, b)); failed = true; continue; }
    for (const e of entries) if (want.has(e.slug)) out.set(e.slug, e);
  }
  if (failed) {
    // The count changed under the request (a 409): hashed again under the one now served, once.
    if (!again && (await corpusInfo()).buckets !== count) return entriesFor(list, true);
    return null; // not reached: asked again next time
  }
  return out;
}

/** A catalogue search answer: an index entry, as the front page's tiles read them. */
export type Found = IndexEntry;
/**
 * The catalogue search, answered by the server from the index it holds (round thirty-nine): the index never comes to the
 * browser whole. Null when the reference could not be reached (a different fact from "nothing matches"). What is sent
 * is the text in a public catalogue's search box, listed on /about/how; a plant's record never is.
 */
export async function searchCatalogue(q: string, n = 60): Promise<(Found[] & { relaxed?: { query: string; left?: string }; near?: boolean }) | { limited: number } | null> {
  // Cut by code point, as the server's `_clean` does: a cut through an emoji's surrogate pair made `encodeURIComponent`
  // throw, and the page said the reference could not be reached (round sixty-one; the corpus review, 12).
  const text = [...q.trim()].slice(0, 80).join('');
  if (!text) return [];
  try {
    const r = await withCorpus(`/api/search?q=${encodeURIComponent(text)}&n=${n}`).then(timed);
    if (r.status === 400) return []; // not a search (nothing the index has words in): nothing matches
    if (r.status === 429) return { limited: Math.max(1, Number(r.headers.get('retry-after')) || 60) }; // the address's allowance is spent: a wait, not "not reached" (round forty, R1-3)
    if (!r.ok) return null;
    const hits = (await r.json()) as Found[];
    // The server answered other words than those typed (its retry on the first two, or a reading that dropped an author, a
    // quoted cultivar or "sp."): the header names them, so the page can say "Showing results for …" (round sixty; round
    // sixty-two, B2).
    const h = r.headers.get('x-search-relaxed');
    let relaxed: string | null = null;
    if (h) { try { relaxed = decodeURIComponent(h).trim() || null; } catch { relaxed = null; } }
    // What that reading left out, when it matched (an author, a cultivar): the page then says "leaving out …", not "Nothing
    // matched" (round sixty-two; the verification review's search 3).
    const l = r.headers.get('x-search-left');
    let left: string | null = null;
    if (l) { try { left = decodeURIComponent(l).trim() || null; } catch { left = null; } }
    // The hits came by a similar spelling: the picker says so on each (round sixty-two; A7, B2).
    const near = r.headers.get('x-search-near') === '1';
    return Object.assign(hits, relaxed ? { relaxed: { query: relaxed, ...(left ? { left } : {}) } } : {}, near ? { near } : {});
  } catch {
    return null;
  }
}

/**
 * Whether what is typed in the front page's search is shaped like one of the collection's plant numbers, which is never
 * sent to the server (rule 4): digits, a dash and a digit ("2026-0013", as the year scheme numbers), and, under a
 * prefix scheme, the collection's own prefix with a dash or a digit after it ("ACC-0013", "acc 13"). Only the year
 * shape was tested, and "ACC-0013" with no plant of that number went to /api/search (round sixty-two; the self-review's
 * triage N4). A sowing's number ("S2026-001", whatever the scheme) is the collection's too.
 */
export function plantNumberShaped(text: string, scheme?: { mode: 'year' | 'prefix'; prefix?: string } | null): boolean {
  const t = text.trim();
  if (/^\d{2,4}-?\d/.test(t) || /^S\d{4}-?\d/i.test(t)) return true;
  if (scheme?.mode !== 'prefix') return false;
  const prefix = (scheme.prefix ?? 'ACC').trim();
  if (!prefix) return false;
  // The prefix with a dash, or with a digit after it (a space or dash between): "Aloe vera" under a prefix "ALOE" is a search.
  const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:-|[-\\s]?\\d)`, 'i');
  return re.test(t);
}

export type { Row as CatalogueRow } from '$lib/server/catalogue';
import type { Row as CatalogueRow } from '$lib/server/catalogue';
/**
 * A window of the catalogue's rows from the server, for the front page to append or to jump to a letter (round forty-seven, 1).
 * Null when the reference could not be reached; the page's "More" link still works as a navigation then.
 */
export async function catalogueRows(by: string, chip: string, at: number, n: number): Promise<{ at: number; count: number; rows: CatalogueRow[] } | null> {
  try {
    const r = await withCorpus(`/api/rows?by=${encodeURIComponent(by)}&chip=${encodeURIComponent(chip)}&at=${at}&n=${n}`).then(timed);
    if (!r.ok) return null;
    return (await r.json()) as { at: number; count: number; rows: CatalogueRow[] };
  } catch {
    return null;
  }
}

export type { Sheet } from '$lib/server/sheets';
import type { Sheet } from '$lib/server/sheets';
/**
 * The sheets (a species' figures for a plant page, a label, a batch) for a few species, by hash bucket: the server never
 * learns which species, and the worker keeps each bucket for the build, so a device asks once. Null when the reference
 * could not be reached; a species the reference lacks is absent from the map.
 */
const sheetBucketCache = new Map<string, Promise<Sheet[] | null>>();
export async function sheetsFor(slugs: Iterable<string>, again = false): Promise<Map<string, Sheet> | null> {
  const list = [...new Set(slugs)].filter(Boolean);
  const out = new Map<string, Sheet>();
  if (!list.length) return out;
  const want = new Set(list);
  const info = await corpusInfo();
  const count = info.buckets;
  const buckets = [...new Set(list.map((s) => bucketOf(s, count)))].sort();
  const missing = buckets.filter((b) => !sheetBucketCache.has(ckey(info, b)));
  // One bucket a request: the URL is then the edge cache's own key for that bucket, and the worker's, so it repeats
  // across devices and visits; the requests run in parallel.
  for (const b of missing) sheetBucketCache.set(ckey(info, b), bucketFetch(`/api/sheets?b=${b}`, info).then((r) => (r?.ok ? (r.json() as Promise<Sheet[]>) : null)).catch(() => null));
  // Every bucket is waited for before a failure is answered, and each failed one let go, so the next call asks again for
  // all of them: returning at the first left the others' failures cached, and each "Check again" cleared one (round
  // sixty-two; agent A, Today's sheets).
  let failed = false;
  for (const b of buckets) {
    const sheets = await sheetBucketCache.get(ckey(info, b));
    if (!sheets) { sheetBucketCache.delete(ckey(info, b)); failed = true; continue; }
    for (const s of sheets) if (want.has(s.slug)) out.set(s.slug, s);
  }
  if (failed) {
    if (!again && (await corpusInfo()).buckets !== count) return sheetsFor(list, true);
    return null;
  }
  return out;
}

/**
 * The sheet behind a plant's name, found by the species' slug through the bucket lookup, never by sending a key.
 * Returns the sheet, 'none' when the reference has no such species, or null when it could not be reached. `repair` is
 * called with the species' key only for a name at species rank whose stored key is missing or belongs to something
 * else; a subspecies keeps the key the picker gave it, since its species' key would disagree with its name.
 */
export async function sheetForName(name: string, key: number | null | undefined): Promise<Sheet | 'none' | null> {
  const slug = speciesSlug(name);
  const m = await sheetsFor([slug]);
  if (m === null) return null;
  const s = m.get(slug);
  // A homonym's sheet is filed under `<slug>-<key>`. When the plain slug answers with another key than the plant's, that
  // is looked for first (round seventeen, 6): one more bucket request only in that case, so the ordinary plant still
  // asks for one bucket. Nothing is written either way: a reading of the reference does not write to the log, and a key
  // that differs is said on the plant's page with a button to take the reference's (round fifty-eight; rule 5).
  if (s && key && s.key !== key) {
    const suffixed = `${slug}-${key}`;
    const m2 = await sheetsFor([suffixed]);
    if (m2 === null) return null; // not reached: not "the other species"
    const s2 = m2.get(suffixed);
    if (s2) return s2;
  }
  if (!s) return 'none';
  return s;
}
