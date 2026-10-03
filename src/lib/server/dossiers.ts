/**
 * Where dossiers come from, in order: the R2 bucket (production and any dev
 * session with a bucket bound), then the static corpus under /s/v2/ (what
 * scripts/build-dossiers.ts writes, served as assets), then the fixture
 * corpus compiled into the build (so tests work with nothing else present).
 */
import { genusOf } from '$core/names';
import { prepare, type Prepared } from '$core/search';
import { bucketOf, BUCKETS } from '$core/bucket';
import { parseDossier, dossierPath, genusPath, GenusRecord, DOSSIER_V, type Dossier } from '$dossier/schema';
import { manifestPath, productPath, isManifest, type Manifest } from '$dossier/manifest';
import * as v from 'valibot';

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
type Loaded = { at: number; idx: IndexEntry[]; bySlug: Map<string, number>; corpus: string; etag: string | null; fromStore: boolean; manifest: Manifest | null; buckets: number };
let cached: Loaded | null = null;
/** One load at a time: after an upload, concurrent requests each parsed their own copy of the index (round fifty-one, 6). */
let loading: Promise<Loaded> | null = null;
/** Whether the corpus in use came from the bucket: then a record the bucket lacks is absent, and the Worker's own origin is not asked for it (a subrequest that always answered 404; round fifty-one, 6). */
const storeIsCorpus = () => !!cached?.fromStore;
const CACHE_MS = 60_000;
/** For tests: forget the parsed index. */
export const _forgetIndex = () => { cached = null; };

async function staticJson<T>(fetch: Fetch, path: string): Promise<T | null> {
  try {
    const r = await fetch(`/${path}`);
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export async function getIndex(platform: Platform, fetch: Fetch): Promise<IndexEntry[]> {
  return (await loadIndex(platform, fetch)).idx;
}

/** The index and the corpus id it came with, from one load: a route that reads them in two calls can straddle the cache's minute and answer old entries under a new id (round seventeen, 10). */
export async function getIndexWithCorpus(platform: Platform, fetch: Fetch): Promise<{ idx: IndexEntry[]; corpus: string }> {
  const c = await loadIndex(platform, fetch);
  return { idx: c.idx, corpus: c.corpus };
}

/**
 * The corpus id: what the client puts on its reference requests (`?c=`) so a corpus refresh, which is an upload and
 * not a deploy, turns the edge, worker and browser caches over (round twelve, 7). The R2 object's etag when the index
 * comes from the bucket; a hash of the file otherwise; 'fixture' for the fixture corpus.
 */
export async function getCorpusId(platform: Platform, fetch: Fetch): Promise<string> {
  return (await loadIndex(platform, fetch)).corpus;
}

const fnv = (s: string) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); };

async function loadIndex(platform: Platform, fetch: Fetch): Promise<Loaded> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached;
  if (!loading) loading = loadIndexNow(platform, fetch).finally(() => { loading = null; });
  return loading;
}
async function loadIndexNow(platform: Platform, fetch: Fetch): Promise<Loaded> {
  // A refresh parses the new index while the old one, with its catalogues and prepared search, is still held: two
  // generations at once, past the isolate's memory at fifty thousand species (round fifty-two, 5). The old one is let
  // go first; a request that arrives meanwhile waits on the shared load. Only when a bucket has an index to replace it with.
  let idx: IndexEntry[] = [];
  let corpus = '';
  let etag: string | null = null;
  let manifest: Manifest | null = null;
  const store = platform?.env?.STORE;
  if (store) {
    // The manifest first (round fifty-three, 2): it names the corpus and the directory its products and its index are
    // under, all immutable; the etag that says whether anything changed is the manifest's own. A bucket with no manifest
    // (a corpus uploaded before this round) is read as before, with the index object's etag as the id.
    const mPath = manifestPath();
    const iPath = `s/v${DOSSIER_V}/index.json`;
    const watched = cached?.manifest ? mPath : iPath;
    if (cached?.etag && typeof store.head === 'function') {
      // The minute is up: the object's etag says whether the copy held is still the bucket's. A head answers from
      // metadata alone; the four megabytes are read again only after an upload (round forty-three, 1). An isolate that
      // holds no manifest also looks for one each minute, since the first manifest ever uploaded changes nothing it watched (round fifty-four, 3).
      const h = await store.head(watched);
      const mh = cached.manifest ? null : await store.head(mPath).catch(() => null);
      if (h?.etag === cached.etag && !mh) {
        cached.at = Date.now();
        return cached;
      }
    }
    const previous = cached;
    if (cached?.fromStore) cached = null; // an upload: the old generation goes before the new is parsed (round fifty-two, 5)
    const mObj = await store.get(mPath);
    let mEtag: string | null = null;
    if (mObj) {
      const m = (await mObj.json().catch(() => null)) as unknown;
      if (isManifest(m)) { manifest = m; mEtag = mObj.etag || null; }
      else console.warn('s/v2/manifest.json is not a manifest this build reads (no files, another version, or not JSON); the corpus is read without products');
    }
    // A manifest is adopted only with the index it names: one whose index is not there yet (an upload that landed the
    // manifest first) is not a corpus, and the top-level index must never be served under its id, where every cache
    // would keep it for a day (round fifty-four, 3; both reviewers). The corpus held before stays until the files are there.
    let obj = manifest ? await store.get(productPath(manifest.id, 'index.json')) : null;
    if (manifest && !obj) {
      console.warn(`manifest ${manifest.id} names an index the bucket does not hold yet; the corpus held before stands`);
      if (previous?.fromStore) { previous.at = Date.now(); cached = previous; return previous; }
      manifest = null;
    }
    if (!obj) obj = await store.get(iPath);
    if (obj) {
      const text = await obj.text();
      idx = JSON.parse(text) as IndexEntry[];
      if (manifest) { corpus = manifest.id; etag = mEtag; }
      else {
        etag = obj.etag || null;
        corpus = (obj.etag || fnv(text)).replace(/[^A-Za-z0-9._-]/g, '').slice(0, 16);
      }
    }
  }
  const fromStore = idx.length > 0;
  const stat = fromStore ? null : await staticJson<IndexEntry[]>(fetch, `s/v${DOSSIER_V}/index.json`);
  if (stat) {
    idx = merge(idx, stat);
    corpus = corpus || fnv(JSON.stringify(stat));
    if (!fromStore) {
      const m = await staticJson<unknown>(fetch, manifestPath());
      if (isManifest(m)) { manifest = m; corpus = m.id; }
    }
  }
  // Fixtures only fill in when nothing real exists, so a real corpus never shows synthetic species.
  const out = idx.length ? idx : fixtureIndex;
  if (!idx.length) manifest = null;
  cached = { at: Date.now(), idx: out, bySlug: new Map(out.map((e) => [e.slug, e.key])), corpus: idx.length ? corpus : 'fixture', etag, fromStore, manifest, buckets: manifest?.buckets ?? BUCKETS };
  products.clear();
  // The search's structure and the bucket map are built with the index, not inside the first request that needs them
  // (round fifty-two, 5), unless the build wrote them: then they are read per shard and per bucket, and the index is
  // the one thing held whole (round fifty-three, 2).
  if (!manifest) preparedSearch.set(out, prepare(out));
  indexMaps(out);
  return cached;
}

/** The corpus id, the bucket count and whether the build's products are there, from one load. */
export async function getCorpus(platform: Platform, fetch: Fetch): Promise<{ id: string; buckets: number; products: boolean }> {
  const c = await loadIndex(platform, fetch);
  return { id: c.corpus, buckets: c.buckets, products: !!c.manifest };
}

/* ---- the build's products ----
 * Read by name under the current corpus id, from the bucket (then the static
 * corpus), and kept a few at a time per isolate: the directory is immutable,
 * so a product once read is right until the manifest names another id, and
 * the map is cleared with the index. Null when the manifest names no such
 * product, or it cannot be read: the caller derives from the index then.
 */
/**
 * Each entry: the promise, its size in characters once read, and for a file the bucket lacked, the moment it may be asked
 * for again. The miss's minute runs from the miss, not from the last request that met it: a busy product renewed its
 * miss for ever and an upload was never seen (round fifty-five, 4; the second reviewer's finding 5). A read that threw
 * (R2 did not answer) is not remembered at all. The cache is bounded by size as well as count: one search shard can be
 * tens of megabytes at fifty thousand species (the first reviewer's finding 21).
 */
type Held = { p: Promise<unknown>; size: number; retryAt?: number };
const products = new Map<string, Held>();
const PRODUCTS_HELD = 24;
const PRODUCTS_BYTES = 24 * 1024 * 1024;
const MISS_MS = 60_000;
export async function product<T>(platform: Platform, fetch: Fetch, name: string): Promise<T | null> {
  const c = await loadIndex(platform, fetch);
  const m = c.manifest;
  if (!m) return null;
  if (!(name in (m.files ?? {}))) return null;
  const k = `${m.id}/${name}`;
  let h = products.get(k);
  if (h?.retryAt !== undefined && Date.now() >= h.retryAt) { products.delete(k); h = undefined; }
  if (!h) {
    const held: Held = { p: Promise.resolve(null), size: 0 };
    held.p = (async () => {
      const path = productPath(m.id, name);
      const store = platform?.env?.STORE;
      let text: string | null = null;
      if (store) {
        const obj = await store.get(path);
        if (obj) text = await obj.text();
      }
      if (text === null && !c.fromStore) { try { const r = await fetch(`/${path}`); if (r.ok) text = await r.text(); } catch { /* no static file */ } }
      if (text === null) { held.retryAt = Date.now() + MISS_MS; return null; }
      held.size = text.length;
      trim(k);
      return JSON.parse(text) as unknown;
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

export async function getDossier(platform: Platform, fetch: Fetch, key: number): Promise<Dossier | null> {
  const store = platform?.env?.STORE;
  if (store) {
    const obj = await store.get(dossierPath(key));
    if (obj) {
      try {
        return parseDossier(await obj.json());
      } catch (e) {
        // A stored dossier that no longer parses is not served; it is rebuilt.
        console.warn(`dossier ${key} failed schema`, e);
      }
    }
  }
  const stat = storeIsCorpus() ? null : await staticJson<unknown>(fetch, dossierPath(key));
  if (stat) {
    try {
      return parseDossier(stat);
    } catch (e) {
      console.warn(`static dossier ${key} failed schema`, e);
    }
  }
  // The fixtures stand in only while the fixture corpus is the corpus: under a real one, a record the bucket lacks is
  // absent, never a synthetic species with made-up figures and a quotation (round fifty-two, 5; the second reviewer's finding 10).
  return cached?.corpus === 'fixture' ? (fixturesByKey.get(key) ?? null) : null;
}

export async function resolveSlug(platform: Platform, fetch: Fetch, slug: string): Promise<number | null> {
  const idx = await getIndex(platform, fetch);
  const hit = cached?.bySlug.get(slug);
  if (hit != null) return hit;
  // Synthetic species are reachable only while no real corpus exists.
  if (idx === fixtureIndex) for (const d of fixturesByKey.values()) if (d.slug === slug) return d.key;
  return null;
}

const fixtureGenera = import.meta.glob('/fixtures/dossiers/s/v2/g/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

/** A genus's record (its Wikipedia lead), or null when none was ever written. R2, then the static corpus, then the fixtures. */
export async function getGenus(platform: Platform, fetch: Fetch, slug: string): Promise<GenusRecord | null> {
  const parse = (x: unknown) => {
    const r = v.safeParse(GenusRecord, x);
    return r.success ? r.output : null;
  };
  const store = platform?.env?.STORE;
  if (store) {
    const obj = await store.get(genusPath(slug));
    if (obj) return parse(await obj.json());
  }
  const stat = storeIsCorpus() ? null : await staticJson<unknown>(fetch, genusPath(slug));
  if (stat) return parse(stat);
  return cached?.corpus === 'fixture' ? (parse(fixtureGenera[`/fixtures/dossiers/s/v2/g/${slug}.json`]) ?? null) : null;
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
/** A bucket's entries: the build's file under the corpus id, else hashed from the index here. */
export async function entriesIn(platform: Platform, fetch: Fetch, bucket: string): Promise<IndexEntry[]> {
  const file = await product<IndexEntry[]>(platform, fetch, `entries/${bucket}.json`);
  if (file) return file;
  const c = await loadIndex(platform, fetch);
  return entriesByBucket(c.idx, c.buckets).get(bucket) ?? [];
}
/** The prepared search entries a query is answered from: the build's shard for its first character, else the whole index prepared here. */
export async function searchFor(platform: Platform, fetch: Fetch, shard: string | null): Promise<Prepared<IndexEntry>[]> {
  const c = await loadIndex(platform, fetch);
  if (c.manifest) {
    if (!shard) return []; // a query with no word the tokeniser keeps: nothing matches, and nothing is prepared for it (round fifty-four, 3)
    if (!c.manifest.search.includes(shard)) return []; // no word in the corpus begins so: nothing matches, and no read
    const file = await product<Prepared<IndexEntry>[]>(platform, fetch, `search/${shard}.json`);
    if (file) return file;
    return prepare(c.idx); // a shard the bucket lacks: prepared for this request and let go, not held per isolate
  }
  return searchIndex(c.idx);
}
/** Whether the build's products are what answers: the search route decides from it whether a miss should be tried over the whole (round fifty-four, 3). */
export async function hasProducts(platform: Platform, fetch: Fetch): Promise<boolean> {
  return !!(await loadIndex(platform, fetch)).manifest;
}
/** The whole index prepared for one request, under a manifest: for the near pass a shard cannot answer; not kept (round fifty-four, 3). */
/** One whole-index preparation in flight per index at a time: concurrent misses share it, and it is let go when the last of them is answered (round fifty-five, 4; both reviewers). */
let wholeInFlight: { idx: IndexEntry[]; p: Promise<Prepared<IndexEntry>[]>; users: number } | null = null;
export async function searchWhole(platform: Platform, fetch: Fetch): Promise<Prepared<IndexEntry>[]> {
  const c = await loadIndex(platform, fetch);
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
