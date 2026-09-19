/** The dossier index, fetched once per page life and shared by every client page that wants a species thumb or key. */
import type { IndexEntry } from '$lib/server/dossiers';
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
