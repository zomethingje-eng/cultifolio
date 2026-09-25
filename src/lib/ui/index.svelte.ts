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

/**
 * Entries for a few species (a grower's own), from /api/entries in chunks of 200: the plants list, the labels and the
 * front page's own tiles need these and not the whole catalogue. Null when the reference could not be reached; a slug
 * the reference lacks is simply absent from the map.
 */
export async function entriesFor(slugs: Iterable<string>): Promise<Map<string, IndexEntry> | null> {
  const list = [...new Set(slugs)].filter(Boolean);
  const out = new Map<string, IndexEntry>();
  if (!list.length) return out;
  const cached = cache ? await cache : null; // the whole index, if some page already fetched it
  if (cached) { for (const e of cached) if (list.includes(e.slug)) out.set(e.slug, e); return out; }
  for (let i = 0; i < list.length; i += 200) {
    try {
      const r = await fetch(`/api/entries?slugs=${encodeURIComponent(list.slice(i, i + 200).join(','))}`);
      if (!r.ok) return null;
      for (const e of (await r.json()) as IndexEntry[]) out.set(e.slug, e);
    } catch {
      return null;
    }
  }
  return out;
}
