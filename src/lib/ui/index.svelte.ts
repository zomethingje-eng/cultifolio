/** The dossier index, fetched once per page life and shared by every client page that wants a species thumb or key. */
import type { IndexEntry } from '$lib/server/dossiers';
let cache: Promise<IndexEntry[]> | null = null;
export function speciesIndex(): Promise<IndexEntry[]> {
  if (!cache)
    cache = fetch('/api/index')
      .then((r) => (r.ok ? (r.json() as Promise<IndexEntry[]>) : []))
      .catch(() => [] as IndexEntry[]);
  return cache;
}
export const bySlug = async (slug: string) => (await speciesIndex()).find((e) => e.slug === slug);
