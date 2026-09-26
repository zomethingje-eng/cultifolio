/** The dossier index, fetched once per page life and shared by every client page that wants a species thumb or key. */
import type { IndexEntry } from '$lib/server/dossiers';
import { bucketOf } from '$core/bucket';
import { speciesOf, speciesSlug } from '$core/names';
let cache: Promise<IndexEntry[] | null> | null = null;
/** The index, or null when it could not be fetched: "the reference could not be reached" is a different fact from "not in the reference", and a page must not confuse them. */
export function speciesIndex(): Promise<IndexEntry[] | null> {
  if (!cache)
    cache = fetch('/api/index')
      .then((r) => (r.ok ? (r.json() as Promise<IndexEntry[]>) : null))
      .catch(() => null);
  cache.then((v) => { if (v === null) cache = null; }); // a failed fetch is retried on the next ask
  return cache;
}
/** The entry for a slug; undefined when the index has no such species; null when the index could not be reached. */
export const bySlug = async (slug: string): Promise<IndexEntry | undefined | null> => {
  const idx = await speciesIndex();
  return idx === null ? null : idx.find((e) => e.slug === slug);
};

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
let corpusP: Promise<string> | null = null;
export function corpusId(): Promise<string> {
  if (!corpusP)
    corpusP = fetch('/api/corpus', { cache: 'no-store', signal: AbortSignal.timeout(10_000) })
      .then((r) => (r.ok ? (r.json() as Promise<{ id: string }>) : null))
      .then((j) => {
        const id = j?.id ?? '';
        if (id) { try { localStorage.setItem(CORPUS_KEY, id); } catch { /* private mode */ } }
        return id || remembered();
      })
      .catch(() => remembered());
  return corpusP;
}
const remembered = () => { try { return localStorage.getItem(CORPUS_KEY) ?? ''; } catch { return ''; } };
const withCorpus = async (url: string) => { const c = await corpusId(); return c ? `${url}&c=${encodeURIComponent(c)}` : url; };
/** A reference request gives up after ten seconds: a half-open connection (greenhouse Wi-Fi, a captive portal) otherwise hangs a page for minutes, where "not reached" is the answer it should give (round fourteen, 4). */
const timed = (url: string) => fetch(url, { signal: AbortSignal.timeout(10_000) });
export async function entriesFor(slugs: Iterable<string>): Promise<Map<string, IndexEntry> | null> {
  const list = [...new Set(slugs)].filter(Boolean);
  const out = new Map<string, IndexEntry>();
  if (!list.length) return out;
  const cached = cache ? await cache : null; // the whole index, if some page already fetched it
  if (cached) { for (const e of cached) if (list.includes(e.slug)) out.set(e.slug, e); return out; }
  const want = new Set(list);
  const buckets = [...new Set(list.map(bucketOf))].sort();
  const missing = buckets.filter((b) => !bucketCache.has(b));
  for (let i = 0; i < missing.length; i += 4) {
    const chunk = missing.slice(i, i + 4); // four a request: each bucket is its own edge-cache entry, and a request names few enough that the URLs repeat
    const p = withCorpus(`/api/entries?b=${chunk.join(',')}`).then(timed).then((r) => (r.ok ? (r.json() as Promise<IndexEntry[]>) : null)).catch(() => null);
    for (const b of chunk) bucketCache.set(b, p.then((all) => (all ? all.filter((e) => bucketOf(e.slug) === b) : null)));
  }
  for (const b of buckets) {
    const entries = await bucketCache.get(b)!;
    if (!entries) { bucketCache.delete(b); return null; } // not reached: asked again next time
    for (const e of entries) if (want.has(e.slug)) out.set(e.slug, e);
  }
  return out;
}

export type { Sheet } from '$lib/server/sheets';
import type { Sheet } from '$lib/server/sheets';
/**
 * The sheets (a species' figures for a plant page, a label, a batch) for a few species, by hash bucket: the server never
 * learns which species, and the worker keeps each bucket for the build, so a device asks once. Null when the reference
 * could not be reached; a species the reference lacks is absent from the map.
 */
const sheetBucketCache = new Map<string, Promise<Sheet[] | null>>();
export async function sheetsFor(slugs: Iterable<string>): Promise<Map<string, Sheet> | null> {
  const list = [...new Set(slugs)].filter(Boolean);
  const out = new Map<string, Sheet>();
  if (!list.length) return out;
  const want = new Set(list);
  const buckets = [...new Set(list.map(bucketOf))].sort();
  const missing = buckets.filter((b) => !sheetBucketCache.has(b));
  // One bucket a request: the URL is then the edge cache's own key for that bucket, and the worker's, so it repeats
  // across devices and visits; the requests run in parallel.
  for (const b of missing) sheetBucketCache.set(b, withCorpus(`/api/sheets?b=${b}`).then(timed).then((r) => (r.ok ? (r.json() as Promise<Sheet[]>) : null)).catch(() => null));
  for (const b of buckets) {
    const sheets = await sheetBucketCache.get(b)!;
    if (!sheets) { sheetBucketCache.delete(b); return null; }
    for (const s of sheets) if (want.has(s.slug)) out.set(s.slug, s);
  }
  return out;
}

/**
 * The sheet behind a plant's name, found by the species' slug through the bucket lookup, never by sending a key.
 * Returns the sheet, 'none' when the reference has no such species, or null when it could not be reached. `repair` is
 * called with the species' key only for a name at species rank whose stored key is missing or belongs to something
 * else; a subspecies keeps the key the picker gave it, since its species' key would disagree with its name.
 */
export async function sheetForName(name: string, key: number | null | undefined, repair?: (key: number) => void): Promise<Sheet | 'none' | null> {
  const slug = speciesSlug(name);
  const m = await sheetsFor([slug]);
  if (m === null) return null;
  const s = m.get(slug);
  if (!s) return 'none';
  if (speciesOf(name) === name && key !== s.key) repair?.(s.key);
  return s;
}
