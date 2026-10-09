/**
 * Where dossiers come from, in order: the R2 bucket (production and any dev
 * session with a bucket bound), then the static corpus under /s/v2/ (what
 * scripts/build-dossiers.ts writes, served as assets), then the fixture
 * corpus compiled into the build (so tests work with nothing else present).
 */
import { genusOf } from '$core/names';
import { prepare, search, hasExact, rankedWords, relaxedQuery, type Prepared } from '$core/search';
import { queryPlan, candidates, postingFileOf } from '$core/postings';
import { bucketOf, BUCKETS } from '$core/bucket';
import { parseDossier, dossierPath, genusPath, GenusRecord, DOSSIER_V, type Dossier } from '$dossier/schema';
import { manifestPath, productPath, isManifest, SHORT_HITS, type Manifest } from '$dossier/manifest';
import * as v from 'valibot';
import { error, isHttpError } from '@sveltejs/kit';

export type { IndexEntry } from '$dossier/index-entry';
import type { IndexEntry } from '$dossier/index-entry';

export type Fetch = typeof fetch;

const fixtureFiles = import.meta.glob('/fixtures/dossiers/s/v2/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;
const fixtureIndex = (import.meta.glob('/fixtures/dossiers/index.json', { eager: true, import: 'default' }) as Record<string, IndexEntry[]>)['/fixtures/dossiers/index.json'] ?? [];

const fixturesByKey = new Map<number, Dossier>();
for (const [path, json] of Object.entries(fixtureFiles)) {
  try {
    const d = parseDossier(json);
    fixturesByKey.set(d.key, d);
  } catch (e) {
    console.warn(`fixture ${path} does not parse as a v${DOSSIER_V} dossier and is ignored`, e);
  }
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
export type Loaded = { at: number; idx: IndexEntry[]; bySlug: Map<string, number>; corpus: string; etag: string | null; fromStore: boolean; manifest: Manifest | null; buckets: number };
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
  return (await loadIndex(platform, fetch)).idx;
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
  let idx: IndexEntry[] = [];
  let corpus = '';
  let manifest: Manifest | null = null;
  const stat = await staticJson<IndexEntry[]>(fetch, `s/v${DOSSIER_V}/index.json`);
  if (Array.isArray(stat) && stat.length) {
    idx = stat;
    corpus = fnv(JSON.stringify(stat));
    const m = await staticJson<unknown>(fetch, manifestPath());
    if (isManifest(m)) { manifest = m; corpus = m.id; }
  }
  // Fixtures only fill in when nothing real exists, so a real corpus never shows synthetic species.
  const out = idx.length ? idx : fixtureIndex;
  if (!idx.length) manifest = null;
  return adopt(out, idx.length ? corpus : 'fixture', null, false, manifest);
}
function adopt(idx: IndexEntry[], corpus: string, etag: string | null, fromStore: boolean, manifest: Manifest | null): Loaded {
  cached = { at: Date.now(), idx, bySlug: new Map(idx.map((e) => [e.slug, e.key])), corpus, etag, fromStore, manifest, buckets: manifest?.buckets ?? BUCKETS };
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
  if (manifest) {
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
  return keep();
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
/** Every posting file, the catalogues and a working set of buckets fit: 160 files, under the 24 MB that bounds them (round fifty-eight; the server review's finding 8). */
const PRODUCTS_HELD = 160;
const PRODUCTS_BYTES = 24 * 1024 * 1024;
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
export async function getDossier(platform: Platform, fetch: Fetch, key: number, held?: Loaded): Promise<Dossier | null> {
  const c = held ?? (await loadIndex(platform, fetch));
  const store = platform?.env?.STORE;
  if (store) {
    const obj = await store.get(dossierPath(key));
    if (obj) {
      try {
        return parseDossier(await obj.json());
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
      return parseDossier(stat);
    } catch (e) {
      console.warn(`static dossier ${key} failed schema`, e);
    }
  }
  // The fixtures stand in only while the fixture corpus is the corpus: under a real one, a record the bucket lacks is
  // absent, never a synthetic species with made-up figures and a quotation (round fifty-two, 5; the second reviewer's finding 10).
  return c.corpus === 'fixture' ? (fixturesByKey.get(key) ?? null) : null;
}

export async function resolveSlug(platform: Platform, fetch: Fetch, slug: string, held?: Loaded): Promise<number | null> {
  const c = held ?? (await loadIndex(platform, fetch)); // the request's corpus, and its own slug map (round fifty-nine: it read whichever was current)
  const hit = c.bySlug.get(slug);
  if (hit != null) return hit;
  // Synthetic species are reachable only while no real corpus exists.
  if (c.idx === fixtureIndex) for (const d of fixturesByKey.values()) if (d.slug === slug) return d.key;
  return null;
}

const fixtureGenera = import.meta.glob('/fixtures/dossiers/s/v2/g/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

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
  return c.corpus === 'fixture' ? (parse(fixtureGenera[`/fixtures/dossiers/s/v2/g/${slug}.json`]) ?? null) : null;
}

/** Maps over the index, built once per index load rather than per request: by key, and the species of each genus sorted by name (round fifty-one, 6). */
type IndexMaps = { byKey: Map<number, IndexEntry>; byGenus: Map<string, IndexEntry[]>; bySynonym: Map<string, { entry: IndexEntry; matched: string }> };
const maps = new WeakMap<IndexEntry[], IndexMaps>();
export function indexMaps(index: IndexEntry[]): IndexMaps {
  let m = maps.get(index);
  if (m) return m;
  const byKey = new Map<number, IndexEntry>();
  const byGenus = new Map<string, IndexEntry[]>();
  const bySynonym = new Map<string, { entry: IndexEntry; matched: string }>();
  for (const e of index) {
    byKey.set(e.key, e);
    const g = genusOf(e.name);
    const xs = byGenus.get(g);
    if (xs) xs.push(e); else byGenus.set(g, [e]);
    for (const syn of e.syn ?? []) { const k = syn.toLowerCase(); if (!bySynonym.has(k)) bySynonym.set(k, { entry: e, matched: syn }); }
  }
  for (const xs of byGenus.values()) xs.sort((a, b) => a.name.localeCompare(b.name));
  maps.set(index, (m = { byKey, byGenus, bySynonym }));
  return m;
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
  return entriesByBucket(c.idx, c.buckets).get(bucket) ?? [];
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
export async function searchAnswer(platform: Platform, fetch: Fetch, q: string, n: number, mayWhole: () => Promise<Response | null>, held?: Loaded): Promise<{ hits: IndexEntry[]; corpus: string; relaxed?: { query: string } } | { stop: Response }> {
  const c = held ?? (await loadIndex(platform, fetch));
  // Charged once a request, however many passes cost what the whole index costs (round sixty; the corpus review, 6).
  let charged: Promise<Response | null> | null = null;
  const charge = () => (charged ??= mayWhole());
  // The candidates ranked by every pass of this request, the retry's included, against one threshold (round sixty-one; the corpus review, 17).
  let ranked = 0;
  const heavy = (k: number) => (ranked += k) > WHOLE_LIKE;
  const first = await searchOnce(c, platform, fetch, q, n, charge, heavy);
  if ('stop' in first || first.hits.length) return first;
  // Nothing matches the query as written: once more on its first two words before any rank marker, and the answer says
  // so, so the page can say "Showing results for …" (round sixty; the corpus review, 3; the self-review, 15).
  const relaxed = relaxedQuery(q);
  if (!relaxed) return first;
  const again = await searchOnce(c, platform, fetch, relaxed, n, charge, heavy);
  if ('stop' in again || !again.hits.length) return 'stop' in again ? again : first;
  return { ...again, relaxed: { query: relaxed } };
}
async function searchOnce(c: Loaded, platform: Platform, fetch: Fetch, q: string, n: number, charge: () => Promise<Response | null>, heavy: (k: number) => boolean = (k) => k > WHOLE_LIKE): Promise<{ hits: IndexEntry[]; corpus: string } | { stop: Response }> {
  const corpus = c.corpus; // the id the answer is from, from the same load (round seventeen, 10)
  const m = c.manifest;
  if (!m) return { hits: search(searchIndex(c.idx), q, n), corpus };
  const plan = queryPlan(q);
  if (!plan.exact.length) return { hits: [], corpus }; // no word the tokeniser keeps: nothing matches, and nothing is read
  const entries = (ix: number[]) => { const out: IndexEntry[] = []; for (const i of ix) { const e = c.idx[i]; if (e) out.push(e); } return out; };
  // One word and nothing else, as the ranking reads the query: a trailing rank marker still counts ("a var" is two), and
  // a leading one or a repeat does not ("f a" and "a a" are "a"; round fifty-nine).
  const only = rankedWords(q);
  if (only.length === 1 && only[0].length <= 2 && !plan.near && n <= SHORT_HITS && m.files['short.json']) {
    const short = await product<Record<string, number[]>>(c, platform, fetch, 'short.json');
    if (short && typeof short === 'object') {
      const xs = Object.hasOwn(short, only[0]) ? short[only[0]] : [];
      // Positions in this index, or the file is not this corpus's answers (a hash naming another file): the postings answer (round fifty-nine).
      if (Array.isArray(xs) && xs.every((i) => Number.isInteger(i) && i >= 0 && i < c.idx.length)) return { hits: entries(xs.slice(0, n)), corpus };
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
    return stop ? { stop } : { hits: search(await searchWhole(c), q, n), corpus };
  };
  if (!(await read(plan.exact))) return whole();
  // The exact pass in a function of its own, so its prepared candidates are garbage before the near pass waits on the
  // bucket: held across that wait they were tens of megabytes a request at fifty thousand species (round fifty-eight;
  // the first reviewer's finding 12).
  // Candidates past this many (two short words, "a e", narrow almost nothing) cost what the whole index costs, so they
  // are charged as it is (round fifty-nine; the corpus reviews: 127 to 309 ms each under the ordinary search allowance).
  const cands = candidates(plan.exact, posting);
  if (heavy(cands.length)) { const stop = await charge(); if (stop) return { stop }; }
  const exactHits = exactPass(entries(cands), q, n);
  if (exactHits) return { hits: exactHits, corpus };
  if (!plan.near) return { hits: [], corpus };
  if (!(await read(plan.near))) return whole();
  // The near pass too: a typo whose keys reach a family or an origin ranks close to two thousand candidates after the
  // exact pass ranked its own, and was never charged (round sixty; the corpus review, 6; A26).
  const near = candidates(plan.near, posting);
  if (heavy(near.length)) { const stop = await charge(); if (stop) return { stop }; }
  return { hits: search(prepare(entries(near)), q, n), corpus };
}
function exactPass(cands: IndexEntry[], q: string, n: number): IndexEntry[] | null {
  const pe = prepare(cands);
  return hasExact(pe, q) ? search(pe, q, n) : null;
}
/** The whole index prepared for one request, under a manifest, when a posting file is missing; not kept (round fifty-four, 3). */
/** One whole-index preparation in flight per index at a time: concurrent misses share it, and it is let go when the last of them is answered (round fifty-five, 4; both reviewers). */
let wholeInFlight: { idx: IndexEntry[]; p: Promise<Prepared<IndexEntry>[]>; users: number } | null = null;
export async function searchWhole(c: Loaded): Promise<Prepared<IndexEntry>[]> {
  if (!c.manifest) return searchIndex(c.idx);
  if (!wholeInFlight || wholeInFlight.idx !== c.idx) wholeInFlight = { idx: c.idx, p: Promise.resolve().then(() => prepare(c.idx)), users: 0 };
  const w = wholeInFlight;
  w.users++;
  try {
    return await w.p;
  } finally {
    if (--w.users === 0 && wholeInFlight === w) wholeInFlight = null;
  }
}
