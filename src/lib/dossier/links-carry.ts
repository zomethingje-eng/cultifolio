/**
 * What a build carries of the links agent's fields (round eighty-seven, stage 2): the walk derives every page again
 * (offline or online), and a build writes a new dossier, so `flowering`, `elsewhere` and `parents`, which only the fills
 * and Kew's file write, would be lost on every page it derives. Each is carried from the build before, unless it is
 * another taxon's or another item's:
 *
 *   - `flowering` only while the page's iNaturalist taxon is the one it was read for;
 *   - `elsewhere.wikidata` only while the page's Wikidata item is the one read;
 *   - `elsewhere.published` and `parents` (Kew's file's) as they were; a walk given Kew's file reads them again after
 *     deriving the pages (`fillKewPublished`), which corrects them where Kew's entry changed.
 *
 * A field this build already holds is left as it is. Pure.
 */
import type { Dossier } from './schema';

type Carried = Pick<Dossier, 'ids'> & Partial<Pick<Dossier, 'flowering' | 'elsewhere' | 'parents'>>;

export function carryLinks(prev: Carried | null | undefined, d: Carried): void {
  if (!prev) return;
  if (!d.flowering && prev.flowering && prev.flowering.taxon === d.ids.inat) d.flowering = prev.flowering;
  const wd = !d.elsewhere?.wikidata && prev.elsewhere?.wikidata && prev.elsewhere.wikidata.item === d.ids.wikidata ? prev.elsewhere.wikidata : d.elsewhere?.wikidata;
  const pub = d.elsewhere?.published ?? prev.elsewhere?.published;
  if (wd || pub) d.elsewhere = { ...(d.elsewhere ?? {}), ...(wd ? { wikidata: wd } : {}), ...(pub ? { published: pub } : {}) };
  if (!d.parents && prev.parents) d.parents = prev.parents;
}
