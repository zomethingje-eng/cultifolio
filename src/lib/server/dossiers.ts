/**
 * Where dossiers come from, in order: the R2 bucket (production and any dev
 * session with a bucket bound), then the static corpus under /s/v2/ (what
 * scripts/build-dossiers.ts writes, served as assets), then the fixture
 * corpus compiled into the build (so tests work with nothing else present).
 */
import { prepare, search, hasExact, rankedWords, relaxedQuery, searchGenera, type Prepared } from '$core/search';
import { queryPlan, candidates, postingFileOf } from '$core/postings';
import { searchFromFiles, searchDirsFor, searchDirsOfQuery, type SearchReader, type Dir, type Answers, type Tables, type Blocks } from '$core/search-files';
import { bucketOf, BUCKETS } from '$core/bucket';
import { parseDossier, dossierPath, genusPath, GenusRecord, DOSSIER_V, type Dossier } from '$dossier/schema';
import { heldNamesOf } from '$dossier/photo-kind';
import { manifestPath, productPath, isManifest, isFileHash, hasLookups, hasSearchFiles, SHORT_HITS, type Manifest } from '$dossier/manifest';
import { indexMaps, synonymKey, sharedOrder } from '$dossier/lookups';
import { lookupOf } from './lookup';
export { indexMaps };
import * as v from 'valibot';
import { error, isHttpError } from '@sveltejs/kit';

export type { IndexEntry } from '$dossier/index-entry';
import type { IndexEntry } from '$dossier/index-entry';
import type { PageId } from '$core/page-id';

export type Fetch = typeof fetch;

const fixtureFiles = import.meta.glob('/fixtures/dossiers/s/v3/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;
const fixtureIndex = (import.meta.glob('/fixtures/dossiers/index.json', { eager: true, import: 'default' }) as Record<string, IndexEntry[]>)['/fixtures/dossiers/index.json'] ?? [];

/**
 * The fixture's dossiers, parsed when the fixture corpus is first read (round seventy-seven): parsed as the module
 * loaded, every new isolate of the live site checked four test dossiers against the schema before its first page.
 */
let fixturesParsed: Map<PageId, Dossier> | null = null;
function fixturesByKey(): Map<PageId, Dossier> {
  if (fixturesParsed) return fixturesParsed;
  fixturesParsed = new Map();
  for (const [path, json] of Object.entries(fixtureFiles)) {
    try {
      const d = parseDossier(json);
      fixturesParsed.set(d.key, d);
    } catch (e) {
      console.warn(`fixture ${path} does not parse as a v${DOSSIER_V} dossier and is ignored`, e);
    }
  }
  return fixturesParsed;
}

export type Platform = App.Platform | undefined;

/** Union by key; the first list wins a collision. Linear, not quadratic: a corpus is thousands of species. */
const merge = (a: IndexEntry[], b: IndexEntry[]) => {
  const seen = new Set(a.map((y) => y.key));
  return [...a, ...b.filter((x) => !seen.has(x.key))];
};

/**
 * The parsed index, kept per isolate: the homepage, slug resolution and the API all read it, and parsing thousands of
 * rows per request is waste. It is trusted for a minute without a question; past that, the bucket is asked for the
 * object's etag alone (a `head`, a few milliseconds), and the parsed copy is kept while the etag is the one it came
 * with. Before this the minute lapsed into a full re-read, four megabytes fetched and parsed, on the first request of
 * nearly every minute of a quiet site, which was most of a species page's time to first byte (round forty-three, 1).
 */
/** One load of the corpus: a request takes it once and reads everything it answers from it, so an answer is never one generation's index with another's products (round fifty-eight; all three reviews). */
/**
 * `idx` and `bySlug` are the index and its slug map, held from the load when the corpus is read through them: a corpus
 * whose manifest names no lookup files (one built before round seventy-six), the static corpus without them, or the
 * fixture. Under a manifest that names them (`fromFiles`), both are null: every name a page asks for is read from the
 * build's files by key (./lookup.ts), and the index is read only by the search, on its first query (`indexOf`).
 */
export type Loaded = { at: number; idx: IndexEntry[] | null; bySlug: Map<string, PageId> | null; corpus: string; etag: string | null; fromStore: boolean; manifest: Manifest | null; buckets: number };
/** Whether a corpus is read through the build's lookup files rather than its index (round seventy-six). */
export const fromFiles = (c: Pick<Loaded, 'manifest'>): boolean => !!c.manifest && hasLookups(c.manifest);
/**
 * Whether a corpus is searched from the build's key files (round seventy-seven; $core/search-files): under a manifest
 * that names them and the lookup files, nothing on the Worker reads or holds the index.
 */
export const searchedFromFiles = (c: Pick<Loaded, 'manifest'>): boolean => fromFiles(c) && hasSearchFiles(c.manifest!);
let cached: Loaded | null = null;
/** One load at a time: after an upload, concurrent requests each parsed their own copy of the index (round fifty-one, 6). */
let loading: Promise<Loaded> | null = null;
const CACHE_MS = 60_000;
/** For tests: forget the parsed index and every product read. */
export const _forgetIndex = () => { cached = null; products.clear(); rejectedManifest = null; };
/** The sentence a page or a route answers with (503, no-store) when the bucket holds a corpus this build cannot read and nothing is held (round sixty). */
export const UNREADABLE = 'The reference could not be read just now';

async function staticJson<T>(fetch: Fetch, path: string): Promise<T | null> {
  try {
    const r = await fetch(`/${path}`);
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

/** The corpus as it is now, for a request to hold and pass on: every product read and every derivation of that request takes it (round fifty-eight). */
export async function corpusNow(platform: Platform, fetch: Fetch): Promise<Loaded> {
  return loadIndex(platform, fetch);
}

export async function getIndex(platform: Platform, fetch: Fetch): Promise<IndexEntry[]> {
  return indexOf(await loadIndex(platform, fetch), platform, fetch);
}

/**
 * The whole index of the corpus a request holds: the one held from the load, or, for a corpus read through the lookup
 * files, read and parsed on the first request that needs it (the search) and kept with that corpus (round seventy-six).
 * An index that is not there, or not a list of the manifest's species, is a 503 (`UNREADABLE`), never an empty answer.
 */
const lazyIndex = new WeakMap<Loaded, Promise<IndexEntry[]>>();
export function indexOf(c: Loaded, platform: Platform, fetch: Fetch): Promise<IndexEntry[]> {
  if (c.idx) return Promise.resolve(c.idx);
  // Under the key files nothing reads the index (round seventy-seven): a path that would is a fault, said as one, never a
  // read of the whole into the isolate.
  if (searchedFromFiles(c)) {
    console.error(`corpus ${c.corpus} is read through its files; something asked for its whole index`);
    return (async () => error(503, { message: UNREADABLE }))();
  }
  let p = lazyIndex.get(c);
  if (!p) {
    p = (async () => {
      const m = c.manifest!;
      const path = productPath(m.files['index.json']);
      const store = platform?.env?.STORE;
      let text: string | null = null;
      if (store) { const obj = await store.get(path); if (obj) text = await obj.text(); }
      if (text === null && !c.fromStore) { try { const r = await fetch(`/${path}`); if (r.ok) text = await r.text(); } catch { /* no static file */ } }
      const parsed = text === null ? null : parseIndex(text);
      if (!parsed || parsed.length !== m.species) {
        console.error(`the index named by manifest ${m.id} is ${parsed ? `a list of ${parsed.length}, not ${m.species}` : 'not there or not a list'}`);
        error(503, { message: UNREADABLE });
      }
      return parsed;
    })();
    lazyIndex.set(c, p);
    p.catch(() => { if (lazyIndex.get(c) === p) lazyIndex.delete(c); });
  }
  return p;
}

/**
 * The corpus id: what the client puts on its reference requests (`?c=`) so a corpus refresh, which is an upload and
 * not a deploy, turns the Worker's own cache (the Cache API), the service worker's and the browser's over (round twelve, 7). The R2 object's etag when the index
 * comes from the bucket; a hash of the file otherwise; 'fixture' for the fixture corpus.
 */
export async function getCorpusId(platform: Platform, fetch: Fetch): Promise<string> {
  return (await loadIndex(platform, fetch)).corpus;
}

const fnv = (s: string) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); };

/**
 * The etag of a manifest this build has refused, so the minute's check does not reload for it again (round fifty-nine),
 * and until when: ten minutes, then it is read again, since a product put right under an identical manifest (the same
 * bytes, the same etag) stayed refused for good on every warm isolate while fresh ones served it (round sixty; A25).
 */
let rejectedManifest: { etag: string; until: number } | null = null;
export const REFUSAL_MS = 10 * 60_000;
/** After an R2 error at the minute's check, the held corpus is asked about again this soon (round sixty). */
const RETRY_MS = 10_000;
async function loadIndex(platform: Platform, fetch: Fetch): Promise<Loaded> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached;
  if (!loading) loading = loadIndexNow(platform, fetch).finally(() => { loading = null; });
  return loading;
}
/** A corpus present in the bucket but not one this build reads (a refused manifest, an index of the wrong shape): never answered with the fixture. */
class Refused extends Error {}
async function loadIndexNow(platform: Platform, fetch: Fetch): Promise<Loaded> {
  const store = platform?.env?.STORE;
  const previous = cached;
  if (store) {
    try {
      const got = await fromStore(store, previous);
      if (got) return got;
    } catch (e) {
      // One R2 error at the minute's check, or in the reload after it, keeps the corpus this isolate holds and asks again
      // in a few seconds: every page and route was a 500 for as long as R2 failed, and a failed get after a new manifest
      // dropped the held corpus (round sixty; the corpus review, 5; the server review, 7).
      if (previous?.fromStore) {
        if (!(e instanceof Refused)) console.warn('the reference bucket did not answer; the corpus held stands, asked again shortly', e);
        previous.at = Date.now() - CACHE_MS + RETRY_MS;
        cached = previous;
        return previous;
      }
      // Nothing held: the bucket has a corpus this build cannot read, or did not answer. Never the fixture, which put the
      // three test species on the live site (round sixty; A24): the page says the reference could not be read (503).
      if (isHttpError(e)) throw e;
      console.error('the reference could not be read and no corpus is held', e);
      error(503, { message: UNREADABLE });
    }
  }
  // No bucket, or a bucket that holds no corpus at all (a dev server's empty local bucket): the static corpus, then the fixture.
  // A static manifest naming the lookup files is read through them, as the bucket's is (round seventy-six).
  const sm = await staticJson<unknown>(fetch, manifestPath());
  if (isManifest(sm) && hasLookups(sm) && (await generaHold(sm, (path) => staticJson<unknown>(fetch, path)))) return adopt(null, sm.id, null, false, sm);
  let idx: IndexEntry[] = [];
  let corpus = '';
  let manifest: Manifest | null = null;
  const stat = await staticJson<IndexEntry[]>(fetch, `s/v${DOSSIER_V}/index.json`);
  if (Array.isArray(stat) && stat.length) {
    idx = stat;
    corpus = fnv(JSON.stringify(stat));
    if (isManifest(sm)) { manifest = sm; corpus = sm.id; } // the manifest read above
  }
  // Fixtures only fill in when nothing real exists, so a real corpus never shows synthetic species.
  const out = idx.length ? idx : fixtureIndex;
  if (!idx.length) manifest = null;
  return adopt(out, idx.length ? corpus : 'fixture', null, false, manifest);
}
/**
 * Whether the genera file a manifest names is there and counts its species (round seventy-six): what a corpus read
 * through the lookup files is checked by when it is adopted, as the index's length was. Read through `product`, so the
 * pages that read it next find it held.
 */
async function generaHold(m: Manifest, read: (path: string) => Promise<unknown>, size?: number): Promise<boolean> {
  const hash = m.files['genera.json'];
  const g = await read(productPath(hash));
  const ok = Array.isArray(g) && g.every((x) => Array.isArray(x) && typeof x[0] === 'string' && Number.isInteger(x[1]) && x[1] > 0) && g.reduce((n: number, x: [string, number]) => n + x[1], 0) === m.species;
  // Weighed by the text it was read from, where the caller has it: writing the file out again to weigh it was most of a
  // cold load's own time (round seventy-seven).
  if (ok) hold(hash, g, size ?? JSON.stringify(g).length);
  return ok;
}
function adopt(idx: IndexEntry[] | null, corpus: string, etag: string | null, fromStore: boolean, manifest: Manifest | null): Loaded {
  cached = { at: Date.now(), idx, bySlug: idx ? new Map(idx.map((e) => [e.slug, e.key])) : null, corpus, etag, fromStore, manifest, buckets: manifest?.buckets ?? BUCKETS };
  if (!idx) return cached; // read through the lookup files: nothing of the whole is built (round seventy-six)
  // The search's structure and the bucket map are built with the index, not inside the first request that needs them
  // (round fifty-two, 5), unless the build wrote them: then they are read per shard and per bucket, and the index is
  // the one thing held whole (round fifty-three, 2).
  if (!manifest) preparedSearch.set(idx, prepare(idx));
  indexMaps(idx);
  return cached;
}
const refusedNow = (e: string | null | undefined) => !!e && rejectedManifest !== null && rejectedManifest.etag === e && Date.now() < rejectedManifest.until;
const refuse = (e: string | null | undefined) => { if (e) rejectedManifest = { etag: e, until: Date.now() + REFUSAL_MS }; };
/**
 * The corpus from the bucket: the manifest and the index it names, else the top-level index. Null when the bucket holds
 * no corpus at all. Throws `Refused` when what it holds cannot be read and nothing better is there, and lets an R2 error through.
 */
async function fromStore(store: R2Bucket, previous: Loaded | null): Promise<Loaded | null> {
  // The manifest first (round fifty-three, 2): it names the corpus and the directory its products and its index are
  // under, all immutable; the etag that says whether anything changed is the manifest's own. A bucket with no manifest
  // (a corpus uploaded before this round) is read as before, with the index object's etag as the id.
  const mPath = manifestPath();
  const iPath = `s/v${DOSSIER_V}/index.json`;
  const watched = previous?.manifest ? mPath : iPath;
  if (previous?.etag && previous.fromStore && typeof store.head === 'function') {
    // The minute is up: the object's etag says whether the copy held is still the bucket's. A head answers from
    // metadata alone; the four megabytes are read again only after an upload (round forty-three, 1). An isolate that
    // holds no manifest also looks for one each minute, since the first manifest ever uploaded changes nothing it watched (round fifty-four, 3).
    const h = await store.head(watched);
    const mh = previous.manifest ? null : await store.head(mPath);
    // A manifest this build refused in the last ten minutes is not news: the minute passed it on to a full reload, every
    // minute, each of them parsing the index again (round fifty-nine; the corpus review, 2).
    if ((h?.etag === previous.etag || (previous.manifest && refusedNow(h?.etag))) && (!mh || refusedNow(mh.etag))) {
      previous.at = Date.now();
      return previous;
    }
  }
  if (previous?.fromStore) cached = null; // an upload: the old generation goes before the new is parsed (round fifty-two, 5)
  const keep = () => { if (!previous?.fromStore) return null; previous.at = Date.now(); cached = previous; return previous; };
  const mObj = await store.get(mPath);
  let manifest: Manifest | null = null;
  let mEtag: string | null = null;
  let refused = false;
  if (mObj) {
    const m = (await mObj.json().catch(() => null)) as unknown;
    if (isManifest(m)) { manifest = m; mEtag = mObj.etag || null; }
    else {
      // Not a manifest this build reads (a Worker deployed before the build that wrote it, a half-written file): the
      // corpus held before stands, and this etag is remembered for ten minutes so each minute does not read it all again.
      // With nothing held, the top-level index is read; never the fixture (round sixty; A24).
      refuse(mObj.etag);
      refused = true;
      console.warn('s/v2/manifest.json is not a manifest this build reads (no files, another version, or not JSON); the corpus held before stands');
      const k = keep();
      if (k) return k;
    }
  }
  // A manifest is adopted only with the index it names: one whose index is not there yet (an upload that landed the
  // manifest first) is not a corpus, and the top-level index must never be served under its id, where every cache
  // would keep it for a day (round fifty-four, 3; both reviewers). The corpus held before stays until the files are
  // there; that is not a refusal, so the next minute asks again.
  if (manifest && hasLookups(manifest)) {
    // Read through the lookup files (round seventy-six): the index is not read until a search asks for it, but it must be
    // there, and the genera file must count the manifest's species, as the index's length had to be the manifest's.
    const idxThere = typeof store.head === 'function' ? await store.head(productPath(manifest.files['index.json'])) : await store.get(productPath(manifest.files['index.json']));
    const g = idxThere ? await store.get(productPath(manifest.files['genera.json'])) : null;
    if (!idxThere || !g) {
      console.warn(`manifest ${manifest.id} names an index or a genera file the bucket does not hold yet; the corpus held before stands`);
      const k = keep();
      if (k) return k;
    } else {
      const text = await g.text();
      if (await generaHold(manifest, async () => { try { return JSON.parse(text); } catch { return null; } }, text.length)) return adopt(null, manifest.id, mEtag, true, manifest);
      console.warn(`the genera file named by manifest ${manifest.id} does not count the manifest's species; the corpus held before stands`);
      refuse(mEtag);
      refused = true;
      const k = keep();
      if (k) return k;
    }
  } else if (manifest) {
    const obj = await store.get(productPath(manifest.files['index.json']));
    if (!obj) {
      console.warn(`manifest ${manifest.id} names an index the bucket does not hold yet; the corpus held before stands`);
      const k = keep();
      if (k) return k;
    } else {
      const parsed = parseIndex(await obj.text());
      // An index that is not a list (a manifest naming the wrong file, a damaged object), or a list of another length than
      // the manifest's species (an entries file under the index's name), is not a corpus: refused as a whole, for ten minutes.
      if (parsed && parsed.length === manifest.species) return adopt(parsed, manifest.id, mEtag, true, manifest);
      console.warn(`the index named by manifest ${manifest.id} is not a list of the manifest's species; the corpus held before stands`);
      refuse(mEtag);
      refused = true;
      const k = keep();
      if (k) return k;
    }
  }
  // No manifest, or one refused or not complete with nothing held: the top-level index, under its own etag.
  const obj = await store.get(iPath);
  if (obj) {
    const text = await obj.text();
    const parsed = parseIndex(text);
    if (parsed && parsed.length) return adopt(parsed, (obj.etag || fnv(text)).replace(/[^A-Za-z0-9._-]/g, '').slice(0, 16), obj.etag || null, true, null);
    console.warn('the top-level index is not a list of species');
    const k = keep();
    if (k) return k;
    throw new Refused('the top-level index is not a list of species');
  }
  if (refused || manifest) throw new Refused('the bucket holds a corpus this build cannot read');
  const k = keep();
  if (k) return k;
  // A bucket that holds the corpus of the version before and none of this one (round seventy-eight: `s/v2/` under a
  // Worker of `s/v3/`) is a deploy that came before its corpus's upload: a 503 that says the reference could not be read,
  // never the fixture's species. `scripts/corpus-ready.mjs` stops such a deploy; this is the Worker's own guard.
  const before = `s/v${DOSSIER_V - 1}/manifest.json`;
  if (await (typeof store.head === 'function' ? store.head(before) : store.get(before))) {
    console.error(`the bucket holds ${before} and no ${mPath}: this Worker reads only version ${DOSSIER_V}; upload its corpus (the corpus step)`);
    throw new Refused(`the bucket holds no version ${DOSSIER_V} corpus`);
  }
  return null;
}
function parseIndex(text: string): IndexEntry[] | null {
  try {
    const x = JSON.parse(text) as unknown;
    return Array.isArray(x) ? (x as IndexEntry[]) : null;
  } catch {
    return null;
  }
}

/** The corpus id, the bucket count and whether the build's products are there, from one load. */
export async function getCorpus(platform: Platform, fetch: Fetch): Promise<{ id: string; buckets: number; products: boolean }> {
  const c = await loadIndex(platform, fetch);
  return { id: c.corpus, buckets: c.buckets, products: !!c.manifest };
}

/* ---- the build's products ----
 * Read by name through the manifest, which gives each its content hash and so its path (round fifty-six, 2), from the
 * bucket (then the static corpus), and kept a few at a time per isolate: a file under a hash never changes, so a product
 * once read is right for as long as any manifest names it, and is kept by its hash across a refresh. Null when
 * the manifest names no such product, or it cannot be read: the caller derives from the index then.
 */
/**
 * Each entry: the promise, its size in characters once read, and for a file the bucket lacked, the moment it may be asked
 * for again. The miss's minute runs from the miss, not from the last request that met it: a busy product renewed its
 * miss for ever and an upload was never seen (round fifty-five, 4; the second reviewer's finding 5). A read that threw
 * (R2 did not answer) is not remembered at all. The cache is bounded by size as well as count (the first reviewer's finding 21).
 */
type Held = { p: Promise<unknown>; size: number; retryAt?: number };
const products = new Map<string, Held>();
/**
 * Bounded by count and by the characters read (round fifty-eight; the server review's finding 8). Parsed, a product
 * holds two to three times its text in V8's heap (in node: the name files 3.2, the row files 2.0, the sheets 2.3), so
 * the 24 MB of text round seventy-six allowed was up to 75 MB held: a crawl of 250 species pages held 58 MB after
 * collection in node, and up to 127 MB in use in workerd, the 128 MB Cloudflare allows an isolate (round seventy-seven). Twelve
 * MB of text holds what a crawl reads (the card files, 3.5 MB; the genus rows, 3.6 MB; the genera, the catalogues and
 * the strip), and the count leaves room for the small card files (256 at today's size). The same bound holds the search's
 * parsed files (its directories, tables, blocks and kept answers): one search holds at most 98 files and 1.2 MB of text at
 * 8,947 species, and 127 files and 1.7 MB at 50,000 (round seventy-seven's proof, 69,021 queries); its key files are read as
 * text by `storedText`, parsed as they come and never held.
 */
const PRODUCTS_HELD = 1024;
const PRODUCTS_BYTES = 12 * 1024 * 1024;
const MISS_MS = 60_000;
/**
 * A product of the corpus `c` the request holds, by name (round fifty-eight: never of whichever corpus is current when
 * the read happens, which mixed two generations in one answer; all three reviews). Kept by hash, which names the bytes
 * whatever corpus names them. A file the bucket lacks, or one that does not parse, is a miss for a minute from the miss,
 * or for `missMs` when the caller says: the sheets keep a refused bucket half a minute and say so, so their files' misses
 * are kept no longer (round sixty-three; the server review of the round, R3 3: a device that waited the thirty seconds it
 * was told was refused again by the minute's miss).
 */
export async function product<T>(c: Loaded, platform: Platform, fetch: Fetch, name: string, missMs = MISS_MS): Promise<T | null> {
  const m = c.manifest;
  if (!m) return null;
  const hash = m.files[name];
  if (!hash) return null;
  return stored<T>(c, platform, fetch, hash, name, missMs);
}
/**
 * A stored product file by its hash, kept as `product` keeps it: the search's key files, which the manifest does not
 * name but the search's directories do (round seventy-seven).
 */
export async function stored<T>(c: Loaded, platform: Platform, fetch: Fetch, hash: string, name = hash, missMs = MISS_MS): Promise<T | null> {
  if (!isFileHash(hash)) return null;
  const k = hash;
  let h = products.get(k);
  if (h?.retryAt !== undefined && Date.now() >= h.retryAt) { products.delete(k); h = undefined; }
  if (!h) {
    const held: Held = { p: Promise.resolve(null), size: 0 };
    held.p = (async () => {
      const path = productPath(hash);
      const store = platform?.env?.STORE;
      let text: string | null = null;
      if (store) {
        const obj = await store.get(path);
        if (obj) text = await obj.text();
      }
      if (text === null && !c.fromStore) { try { const r = await fetch(`/${path}`); if (r.ok) text = await r.text(); } catch { /* no static file */ } }
      if (text === null) { held.retryAt = Date.now() + missMs; return null; }
      let parsed: unknown;
      try { parsed = JSON.parse(text); } catch {
        // Said without what the caller does then: most derive from the index, the sheets under a manifest refuse (R3 3).
        console.warn(`product ${name} (${hash}) does not parse; read as missing for ${Math.round(missMs / 1000)} s`);
        held.retryAt = Date.now() + missMs;
        return null;
      }
      held.size = text.length;
      trim(k);
      return parsed;
    })();
    held.p.catch(() => { if (products.get(k) === held) products.delete(k); }); // a read that threw is not a miss to remember
    products.set(k, held);
    h = held;
  } else {
    products.delete(k); // most recently used last
    products.set(k, h);
  }
  try {
    return (await h.p) as T | null;
  } catch {
    return null;
  }
}
/**
 * A stored file's text by hash, kept by no cache (round seventy-seven): the search's key files, which a query parses as it
 * uses them and lets go, so a typing error that reaches many of them never holds them all.
 */
export async function storedText(c: Loaded, platform: Platform, fetch: Fetch, hash: string): Promise<string | null> {
  if (!isFileHash(hash)) return null;
  const path = productPath(hash);
  const store = platform?.env?.STORE;
  if (store) { const obj = await store.get(path); if (obj) return obj.text(); }
  if (!c.fromStore) { try { const r = await fetch(`/${path}`); if (r.ok) return await r.text(); } catch { /* no static file */ } }
  return null;
}
/** For tests: how many products are held, and the characters they were read from. */
export const _productsHeld = () => ({ count: products.size, chars: [...products.values()].reduce((n, h) => n + h.size, 0) });
export const _PRODUCTS_BYTES = PRODUCTS_BYTES;
/** A product already read and parsed (the genera file a load checks), kept as `product` would keep it. */
function hold(hash: string, parsed: unknown, size: number): void {
  products.set(hash, { p: Promise.resolve(parsed), size });
  trim(hash);
}
function trim(keep: string): void {
  let total = 0;
  for (const v of products.values()) total += v.size;
  for (const [k, v] of products) {
    if (products.size <= PRODUCTS_HELD && total <= PRODUCTS_BYTES) break;
    if (k === keep) continue;
    products.delete(k);
    total -= v.size;
  }
}

/**
 * A species' dossier, or null when the corpus has none under that key. Of the corpus the request holds (`held`), or the
 * one loaded first: the fixture's stand-in was decided by reading the isolate's corpus before the load that sets it, so
 * the first /api/dossier on a cold isolate could answer 404 (round sixty; the harness review, 10). A read that fails (R2
 * did not answer) throws; a stored dossier that does not parse is null, and logged.
 */
export async function getDossier(platform: Platform, fetch: Fetch, key: PageId, held?: Loaded): Promise<Dossier | null> {
  const c = held ?? (await loadIndex(platform, fetch));
  // The reference's names, read from the index (memoised by the index array), so an uploader's slip in a Commons title is
  // read as the index reads it when it is written (round seventy, a need of C; REVIEW-TRIAGE-69 C1, C4).
  // Under the lookup files the build has stored that judgement in each dossier (`Photo.judged`; round seventy-six), so
  // no names are needed; a corpus built before is judged here as before.
  const names = c.idx && !fromFiles(c) ? heldNamesOf(c.idx) : null;
  const store = platform?.env?.STORE;
  if (store) {
    const obj = await store.get(dossierPath(key));
    if (obj) {
      try {
        return parseDossier(await obj.json(), names);
      } catch (e) {
        // A stored dossier that no longer parses is not served; it is rebuilt.
        console.warn(`dossier ${key} failed schema`, e);
        if (c.fromStore) return null;
      }
    }
  }
  const stat = c.fromStore ? null : await staticJson<unknown>(fetch, dossierPath(key));
  if (stat) {
    try {
      return parseDossier(stat, names);
    } catch (e) {
      console.warn(`static dossier ${key} failed schema`, e);
    }
  }
  // The fixtures stand in only while the fixture corpus is the corpus: under a real one, a record the bucket lacks is
  // absent, never a synthetic species with made-up figures and a quotation (round fifty-two, 5; the second reviewer's finding 10).
  return c.corpus === 'fixture' ? (fixturesByKey().get(key) ?? null) : null;
}

export async function resolveSlug(platform: Platform, fetch: Fetch, slug: string, held?: Loaded): Promise<PageId | null> {
  const c = held ?? (await loadIndex(platform, fetch)); // the request's corpus, and its own slug map (round fifty-nine: it read whichever was current)
  const hit = await lookupOf(c, platform, fetch).slug(slug);
  if (hit != null) return hit;
  // Synthetic species are reachable only while no real corpus exists.
  if (c.idx === fixtureIndex) for (const d of fixturesByKey().values()) if (d.slug === slug) return d.key;
  return null;
}

const fixtureGenera = import.meta.glob('/fixtures/dossiers/s/v3/g/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

/** A genus's record (its Wikipedia lead), or null when none was ever written. R2, then the static corpus, then the fixtures. */
export async function getGenus(platform: Platform, fetch: Fetch, slug: string, held?: Loaded): Promise<GenusRecord | null> {
  const c = held ?? (await loadIndex(platform, fetch)); // the request's corpus, not whichever the isolate holds (round sixty)
  const parse = (x: unknown) => {
    const r = v.safeParse(GenusRecord, x);
    return r.success ? r.output : null;
  };
  const store = platform?.env?.STORE;
  if (store) {
    const obj = await store.get(genusPath(slug));
    if (obj) return parse(await obj.json().catch(() => null));
  }
  const stat = c.fromStore ? null : await staticJson<unknown>(fetch, genusPath(slug));
  if (stat) return parse(stat);
  return c.corpus === 'fixture' ? (parse(fixtureGenera[`/fixtures/dossiers/s/v3/g/${slug}.json`]) ?? null) : null;
}

/**
 * The species an older name is held by when it answers no one of them (`synonymMaps`), in the order the search gives
 * them for the name typed (the species that holds it exactly and keeps its epithet first, then one that shows it, then
 * the alphabet), else null: the species route's 404 says the name is an older name of these species of the reference,
 * and names them (round sixty-nine; triage-68 N1; round seventy: triage-69 F1). `name` as written or as an address's
 * slug ("Aloe variegata", `aloe-variegata`, `arbutus-uva-ursi`), in any case.
 */
export function ambiguousSynonym(index: IndexEntry[], name: string): IndexEntry[] | null {
  const holders = indexMaps(index).ambiguous.get(synonymKey(name));
  if (!holders) return null;
  return sharedOrder(holders, indexMaps(index).sharedName.get(synonymKey(name)) ?? name);
}
/** The older name two species or more hold, as an entry writes it ("Arbutus uva-ursi" for `arbutus-uva-ursi`), else null. */
export function sharedOlderName(index: IndexEntry[], name: string): string | null {
  return indexMaps(index).sharedName.get(synonymKey(name)) ?? null;
}

/** The search's prepared structure per index, built at load (round fifty-two, 5). */
const preparedSearch = new WeakMap<IndexEntry[], Prepared<IndexEntry>[]>();
export function searchIndex(index: IndexEntry[]): Prepared<IndexEntry>[] {
  let p = preparedSearch.get(index);
  if (!p) preparedSearch.set(index, (p = prepare(index)));
  return p;
}
/** The entries of each bucket, hashed once per index rather than every slug per request (round fifty-two, 5). */
const bucketed = new WeakMap<IndexEntry[], Map<string, IndexEntry[]>>();
export function entriesByBucket(index: IndexEntry[], buckets = cached?.buckets ?? BUCKETS): Map<string, IndexEntry[]> {
  let m = bucketed.get(index);
  if (!m) {
    m = new Map();
    for (const e of index) { const b = bucketOf(e.slug, buckets); const xs = m.get(b); if (xs) xs.push(e); else m.set(b, [e]); }
    bucketed.set(index, m);
  }
  return m;
}
/** A bucket's entries, of the corpus the request holds: the build's file, else hashed from that corpus's index. */
export async function entriesIn(c: Loaded, platform: Platform, fetch: Fetch, bucket: string): Promise<IndexEntry[]> {
  const file = await product<IndexEntry[]>(c, platform, fetch, `entries/${bucket}.json`);
  if (file) return file;
  // Under the key files a bucket's file not read is a refusal, never the index read whole for it (round seventy-seven).
  if (searchedFromFiles(c)) error(503, { message: UNREADABLE });
  return entriesByBucket(await indexOf(c, platform, fetch), c.buckets).get(bucket) ?? [];
}
/**
 * The answer to a search (round fifty-six, 1), from one corpus held for the whole request (round fifty-eight). Without
 * a manifest, the whole index prepared with the index and held. Under a manifest: a query of one word of one or two
 * letters (the first keystrokes, which match most of the index) is answered from the build's own answers for those
 * keys (`short.json`, positions in the index, best first), so it costs a lookup; anything else from the postings
 * ($core/postings): the exact pass ranks the entries under every word's exact key, prepared for this request; when it
 * finds nothing, the near pass ranks the entries under the near keys of the query's long words. Either way the answer
 * is the whole index's answer (tested against the whole on the real corpus). A posting file the bucket lacks leaves the
 * whole index prepared for the request, under the rate the caller gives (`mayWhole`); a refusal there is a refusal,
 * not "nothing matches".
 */
/** Past this many exact candidates a search is charged as a whole-index one (round fifty-nine). */
export const WHOLE_LIKE = 2000;
/**
 * `total` and `kept` (round eighty; review-w 2, review-p 3): how many species answer, and how many of them can be listed
 * (`KeyAnswer`); `at` is where the hits start among them, for the page's "Show more".
 */
export type SearchAnswer = { hits: IndexEntry[]; corpus: string; relaxed?: { query: string }; narrow?: true; total?: number; kept?: number } | { stop: Response };
export async function searchAnswer(platform: Platform, fetch: Fetch, q: string, n: number, mayWhole: () => Promise<Response | null>, held?: Loaded, at = 0): Promise<SearchAnswer> {
  const c = held ?? (await loadIndex(platform, fetch));
  // Charged once a request, however many passes cost what the whole index costs (round sixty; the corpus review, 6).
  let charged: Promise<Response | null> | null = null;
  const charge = () => (charged ??= mayWhole());
  // The candidates ranked by every pass of this request, the retry's included, against one threshold (round sixty-one; the corpus review, 17).
  let ranked = 0;
  const heavy = (k: number) => (ranked += k) > WHOLE_LIKE;
  const first = await searchOnce(c, platform, fetch, q, n, charge, heavy, at);
  // Too common to list (the key files' `narrow`): said as it is, never retried on fewer words.
  if ('stop' in first || first.hits.length || first.narrow) return first;
  // Nothing matches the query as written: once more on its first two words before any rank marker, and the answer says
  // so, so the page can say "Showing results for …" (round sixty; the corpus review, 3; the self-review, 15).
  const relaxed = relaxedQuery(q);
  if (!relaxed) return first;
  const again = await searchOnce(c, platform, fetch, relaxed, n, charge, heavy, at);
  if ('stop' in again) return again;
  if (again.narrow) return { ...again, relaxed: { query: relaxed } };
  if (!again.hits.length) return first;
  return { ...again, relaxed: { query: relaxed } };
}
async function searchOnce(c: Loaded, platform: Platform, fetch: Fetch, q: string, n: number, charge: () => Promise<Response | null>, heavy: (k: number) => boolean = (k) => k > WHOLE_LIKE, at = 0): Promise<{ hits: IndexEntry[]; corpus: string; narrow?: true; total?: number; kept?: number } | { stop: Response }> {
  const corpus = c.corpus; // the id the answer is from, from the same load (round seventeen, 10)
  const m = c.manifest;
  // From the key files (round seventy-seven): a few small files a query, and never the index.
  if (searchedFromFiles(c)) {
    let stop: Response | null = null;
    const a = await searchFromFiles(keyReader(c, platform, fetch), q, n, async (k) => (heavy(k) ? !!(stop = await charge()) : false), undefined, undefined, at);
    if ('stop' in a) return { stop: stop! };
    return 'narrow' in a ? { hits: [], corpus, narrow: true } : { hits: a.hits, corpus, ...(a.total !== undefined ? { total: a.total } : {}), ...(a.kept !== undefined ? { kept: a.kept } : {}) };
  }
  // The search is what still reads the index whole (round seventy-six): held from the load, or read on the first query.
  const idx = await indexOf(c, platform, fetch);
  // Every hit ranked and those from `at` given, with their count (round eighty).
  const paged = (all: IndexEntry[]) => ({ hits: all.slice(at, at + n), corpus, total: all.length });
  if (!m) return paged(search(searchIndex(idx), q));
  const plan = queryPlan(q);
  if (!plan.exact.length) return { hits: [], corpus, total: 0 }; // no word the tokeniser keeps: nothing matches, and nothing is read
  const entries = (ix: number[]) => { const out: IndexEntry[] = []; for (const i of ix) { const e = idx[i]; if (e) out.push(e); } return out; };
  // One word and nothing else, as the ranking reads the query: a trailing rank marker still counts ("a var" is two), and
  // a leading one or a repeat does not ("f a" and "a a" are "a"; round fifty-nine).
  const only = rankedWords(q);
  if (only.length === 1 && only[0].length <= 2 && !plan.near && n <= SHORT_HITS && m.files['short.json']) {
    const short = await product<Record<string, number[]>>(c, platform, fetch, 'short.json');
    if (short && typeof short === 'object') {
      const xs = Object.hasOwn(short, only[0]) ? short[only[0]] : [];
      // Positions in this index, or the file is not this corpus's answers (a hash naming another file): the postings answer (round fifty-nine).
      if (Array.isArray(xs) && xs.every((i) => Number.isInteger(i) && i >= 0 && i < idx.length)) return { hits: entries(xs.slice(at, at + n)), corpus, kept: xs.length };
    }
  }
  const files = new Map<string, Record<string, number[]> | null>();
  const read = async (keys: string[][]) => {
    const want = [...new Set(keys.flat().map((k) => postingFileOf(k, m.postings)))].filter((f) => !files.has(f));
    await Promise.all(want.map(async (f) => files.set(f, await product<Record<string, number[]>>(c, platform, fetch, `postings/${f}.json`))));
    return keys.flat().every((k) => !!files.get(postingFileOf(k, m.postings)));
  };
  const posting = (k: string) => { const f = files.get(postingFileOf(k, m.postings)); const xs = f && Object.hasOwn(f, k) ? f[k] : undefined; return Array.isArray(xs) ? xs : undefined; };
  const whole = async () => {
    const stop = await charge();
    return stop ? { stop } : paged(search(await searchWhole(c, idx), q));
  };
  if (!(await read(plan.exact))) return whole();
  // The exact pass in a function of its own, so its prepared candidates are garbage before the near pass waits on the
  // bucket: held across that wait they were tens of megabytes a request at fifty thousand species (round fifty-eight;
  // the first reviewer's finding 12).
  // Candidates past this many (two short words, "a e", narrow almost nothing) cost what the whole index costs, so they
  // are charged as it is (round fifty-nine; the corpus reviews: 127 to 309 ms each under the ordinary search allowance).
  const cands = candidates(plan.exact, posting);
  if (heavy(cands.length)) { const stop = await charge(); if (stop) return { stop }; }
  const exactHits = exactPass(entries(cands), q, Infinity, generaOfIndex(idx));
  if (exactHits) return paged(exactHits);
  if (!plan.near) return { hits: [], corpus, total: 0 };
  if (!(await read(plan.near))) return whole();
  // The near pass too: a typo whose keys reach a family or an origin ranks close to two thousand candidates after the
  // exact pass ranked its own, and was never charged (round sixty; the corpus review, 6; A26).
  const near = candidates(plan.near, posting);
  if (heavy(near.length)) { const stop = await charge(); if (stop) return { stop }; }
  return paged(search(prepare(entries(near), generaOfIndex(idx)), q));
}
/**
 * The reference's regions of origin, as the search's tables name them (round eighty): what a query naming a region is
 * matched against (`regionsTyped`). Null when they cannot be read: the answer then names no region, and the search
 * itself is unchanged.
 */
export async function searchRegions(c: Loaded, platform: Platform, fetch: Fetch): Promise<string[] | null> {
  if (searchedFromFiles(c)) {
    const t = await product<Tables>(c, platform, fetch, 'search/tables.json').catch(() => null);
    return t && Array.isArray(t.regions) ? t.regions.filter((x): x is string => typeof x === 'string') : null;
  }
  // A corpus searched through its index (one built before the key files, or the fixture): its regions, once per index.
  const idx = await indexOf(c, platform, fetch).catch(() => null);
  if (!idx) return null;
  let r = indexRegions.get(idx);
  if (!r) indexRegions.set(idx, (r = [...new Set(idx.flatMap((e) => e.origin ?? []))].sort()));
  return r;
}
const indexRegions = new WeakMap<IndexEntry[], string[]>();
/**
 * The search's key files of the corpus a request holds (round seventy-seven), read as products are and kept with them. A
 * file a directory names that the bucket cannot give is a 503 (`UNREADABLE`), never "nothing matches" (rule 2).
 */
const keyGenera = new WeakMap<object, ReadonlySet<string>>();
function keyReader(c: Loaded, platform: Platform, fetch: Fetch): SearchReader<IndexEntry> {
  const need = async <T,>(read: Promise<T | null>, what: string, ok: (x: unknown) => boolean): Promise<T> => {
    const x = await read;
    if (!ok(x)) {
      console.error(`search file ${what} of corpus ${c.corpus} could not be read`);
      error(503, { message: UNREADABLE });
    }
    return x as T;
  };
  const isObject = (x: unknown) => !!x && typeof x === 'object' && !Array.isArray(x);
  const blocks = () => need<Blocks>(product<Blocks>(c, platform, fetch, 'search/blocks.json'), 'search/blocks.json', (x) => isObject(x) && Array.isArray((x as Blocks).photos) && Array.isArray((x as Blocks).show));
  return {
    // The tables, the blocks' names and every photograph-count block, read once an isolate and held (round eighty).
    warm: () => { warmSearch(c, platform, fetch); },
    dirs: searchDirsFor(c.manifest!.species),
    dir: (name) => need<Dir>(product<Dir>(c, platform, fetch, `search/${name}.json`), `search/${name}.json`, isObject),
    node: (hash) => need<string>(storedText(c, platform, fetch, hash), hash, (x) => typeof x === 'string'),
    answers: (hash) => need<Answers>(stored<Answers>(c, platform, fetch, hash), hash, (x) => isObject(x) && Array.isArray((x as Answers).a)),
    tables: () => need<Tables>(product<Tables>(c, platform, fetch, 'search/tables.json'), 'search/tables.json', (x) => isObject(x) && Array.isArray((x as Tables).families) && Array.isArray((x as Tables).regions)),
    photos: async (b) => {
      const bl = await blocks();
      return need<number[]>(stored<number[]>(c, platform, fetch, bl.photos[b] ?? ''), `photo block ${b}`, Array.isArray);
    },
    show: async (b) => {
      const bl = await blocks();
      return need<IndexEntry[]>(stored<IndexEntry[]>(c, platform, fetch, bl.show[b] ?? ''), `show block ${b}`, Array.isArray);
    },
    genera: async () => {
      const g = await need<string[]>(product<string[]>(c, platform, fetch, 'search/genera.json'), 'search/genera.json', Array.isArray);
      let set = keyGenera.get(g);
      if (!set) keyGenera.set(g, (set = new Set(g)));
      return set;
    }
  };
}

/**
 * Starts reading what a search will read before its key files (round eighty): the tables, the blocks' names, every
 * photograph-count block, the genera, and, with `q`, the directories its exact pass reads (`searchDirsOfQuery`). Each
 * is held once read, as `product` holds it, so the search finds them read; a read that fails here is read again by the
 * search, which says so. The search route asks it before it waits on the address's allowance, so the two overlap.
 */
export function warmSearch(c: Loaded, platform: Platform, fetch: Fetch, q?: string): void {
  if (!searchedFromFiles(c)) return;
  const quiet = (p: Promise<unknown>) => { p.catch(() => {}); };
  quiet(product(c, platform, fetch, 'search/tables.json'));
  quiet(product(c, platform, fetch, 'search/genera.json'));
  quiet(product<Blocks>(c, platform, fetch, 'search/blocks.json').then((b) => { if (b && Array.isArray(b.photos)) for (const h of b.photos) if (typeof h === 'string') quiet(stored(c, platform, fetch, h)); }));
  if (q) for (const d of searchDirsOfQuery(q, searchDirsFor(c.manifest!.species))) quiet(product(c, platform, fetch, `search/${d}.json`));
}
/**
 * The genera of the whole index, once per index: the candidates of a request are prepared with them, so a typed genus
 * is never the start of a family however few of its species the postings drew (round seventy; triage-69 N2, S-F6).
 */
const indexGenera = new WeakMap<IndexEntry[], Set<string>>();
function generaOfIndex(index: IndexEntry[]): Set<string> {
  let g = indexGenera.get(index);
  if (!g) indexGenera.set(index, (g = searchGenera(index)));
  return g;
}
function exactPass(cands: IndexEntry[], q: string, n: number, genera: ReadonlySet<string>): IndexEntry[] | null {
  const pe = prepare(cands, genera);
  return hasExact(pe, q) ? search(pe, q, n) : null;
}
/** The whole index prepared for one request, under a manifest, when a posting file is missing; not kept (round fifty-four, 3). */
/** One whole-index preparation in flight per index at a time: concurrent misses share it, and it is let go when the last of them is answered (round fifty-five, 4; both reviewers). */
let wholeInFlight: { idx: IndexEntry[]; p: Promise<Prepared<IndexEntry>[]>; users: number } | null = null;
export async function searchWhole(c: Loaded, held?: IndexEntry[]): Promise<Prepared<IndexEntry>[]> {
  const idx = held ?? c.idx;
  if (!idx) throw new Error('searchWhole: the index is not read yet (indexOf)');
  if (!c.manifest) return searchIndex(idx);
  if (!wholeInFlight || wholeInFlight.idx !== idx) wholeInFlight = { idx, p: Promise.resolve().then(() => prepare(idx)), users: 0 };
  const w = wholeInFlight;
  w.users++;
  try {
    return await w.p;
  } finally {
    if (--w.users === 0 && wholeInFlight === w) wholeInFlight = null;
  }
}
