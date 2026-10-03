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
      // metadata alone; the four megabytes are read again only after an upload (round forty-three, 1).
      const h = await store.head(watched);
      if (h?.etag === cached.etag) {
        cached.at = Date.now();
        return cached;
      }
    }
    if (cached?.fromStore) cached = null; // an upload: the old generation goes before the new is parsed (round fifty-two, 5)
    const mObj = await store.get(mPath);
    if (mObj) {
      const m = (await mObj.json().catch(() => null)) as unknown;
      if (isManifest(m)) { manifest = m; etag = mObj.etag || null; }
    }
    const obj = manifest ? ((await store.get(productPath(manifest.id, 'index.json'))) ?? (await store.get(iPath))) : await store.get(iPath);
    if (obj) {
      const text = await obj.text();
      idx = JSON.parse(text) as IndexEntry[];
      if (manifest) corpus = manifest.id;
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
const products = new Map<string, Promise<unknown>>();
const PRODUCTS_HELD = 24;
export async function product<T>(platform: Platform, fetch: Fetch, name: string): Promise<T | null> {
  const c = await loadIndex(platform, fetch);
  const m = c.manifest;
  if (!m) return null;
  if (!(name in m.files)) return null;
  const k = `${m.id}/${name}`;
  let p = products.get(k);
  if (!p) {
    p = (async () => {
      const path = productPath(m.id, name);
      const store = platform?.env?.STORE;
      if (store) {
        const obj = await store.get(path);
        if (obj) return obj.json();
      }
      return c.fromStore ? null : staticJson<unknown>(fetch, path);
    })().catch(() => null);
    products.set(k, p);
    if (products.size > PRODUCTS_HELD) products.delete(products.keys().next().value!);
  }
  const v = (await p) as T | null;
  if (v === null) products.delete(k);
  return v;
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
  if (c.manifest && shard) {
    if (!c.manifest.search.includes(shard)) return []; // no word in the corpus begins so: nothing matches, and no read
    const file = await product<Prepared<IndexEntry>[]>(platform, fetch, `search/${shard}.json`);
    if (file) return file;
  }
  return searchIndex(c.idx);
}
