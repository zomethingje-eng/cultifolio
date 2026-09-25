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
export async function entriesFor(slugs: Iterable<string>): Promise<Map<string, IndexEntry> | null> {
  const list = [...new Set(slugs)].filter(Boolean);
  const out = new Map<string, IndexEntry>();
  if (!list.length) return out;
  const cached = cache ? await cache : null; // the whole index, if some page already fetched it
  if (cached) { for (const e of cached) if (list.includes(e.slug)) out.set(e.slug, e); return out; }
  const want = new Set(list);
  const buckets = [...new Set(list.map(bucketOf))].sort();
  const missing = buckets.filter((b) => !bucketCache.has(b));
  for (let i = 0; i < missing.length; i += 64) {
    const chunk = missing.slice(i, i + 64);
    const p = fetch(`/api/entries?b=${chunk.join(',')}`).then((r) => (r.ok ? (r.json() as Promise<IndexEntry[]>) : null)).catch(() => null);
    for (const b of chunk) bucketCache.set(b, p.then((all) => (all ? all.filter((e) => bucketOf(e.slug) === b) : null)));
  }
  for (const b of buckets) {
    const entries = await bucketCache.get(b)!;
    if (!entries) { bucketCache.delete(b); return null; } // not reached: asked again next time
    for (const e of entries) if (want.has(e.slug)) out.set(e.slug, e);
  }
  return out;
}

export type DossierLike = { slug: string; name: { scientific: string } };
/**
 * The dossier behind a plant's name, from the device's knowledge outward: the record's own key first (one small file,
 * the one the offline worker keeps), checked against the name on the record, since a key can be stale after a rename;
 * then the species' index entry, found by hash bucket, never by sending the name. Returns the dossier, 'none' when the
 * reference has no such species, or null when it could not be reached. `repair` is called with the right key when the
 * stored one was wrong or missing, so the record heals itself.
 */
export async function dossierForName<D extends DossierLike>(name: string, key: number | null | undefined, fetchDossier: (key: number) => Promise<D | 'none' | null>, repair?: (key: number) => void): Promise<D | 'none' | null> {
  const slug = speciesSlug(name);
  if (key && speciesOf(name) === name) {
    const d = await fetchDossier(key);
    if (d && d !== 'none' && (d.slug === slug || speciesSlug(d.name.scientific) === slug)) return d;
    if (d === null) return null; // not reached: say so, do not guess by name
  }
  const m = await entriesFor([slug]);
  if (m === null) return null;
  const e = m.get(slug);
  if (!e) return 'none';
  repair?.(e.key);
  return fetchDossier(e.key);
}
