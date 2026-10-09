import { site } from '$lib/ui/site.svelte';
import { collection } from '$lib/db/collection.svelte';

/**
 * The reader's latitude for the months a page shows: the site once loaded; else the first of the grower's places with
 * coordinates once the collection is open; before the site is read (and on the server), the hemisphere cookie, so a
 * southern grower never sees northern months first. One helper for the species page and compare, which kept a copy
 * each (round sixty-two; the round-sixty triage review's merge leftovers, decision 11).
 */
export function readerLat(hemiLat: number | null | undefined): number | null {
  if (site.current?.lat != null) return site.current.lat;
  if (!site.loaded) return hemiLat ?? null;
  if (!collection.ready) return null;
  return collection.locations.map((l) => l.lat).find((x): x is number => x != null) ?? null;
}
