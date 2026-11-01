/**
 * The species of round eighty-five's rule (the owner's decision 6; review-d D1): a species Kew accepts that GBIF folds into
 * a variety or a synonym of a reference species, and that growers name, gets a page of its own. Pure; the script
 * (`scripts/folded-species.ts`) reads Kew's file, the index and iNaturalist, and writes the list's lines.
 *
 * The rule, in three tests, each a fact a source states:
 *
 *   1. **Kew accepts it as a species**, and the reference has no page for it (no `k<plant_name_id>` page).
 *   2. **GBIF folds it into a reference species**: a page of the reference holds the species' own name, as Kew writes it,
 *      among its GBIF names (`syn`, `older`, `hom`, or `kew`, where the index keeps the names GBIF files under the species'
 *      varieties, `name.infra`). So the name a grower types led to another plant's page.
 *   3. **Growers name it**: iNaturalist holds a taxon by that name (its own, or a name iNaturalist reads as it), of the
 *      species or below it with the species' own epithet ("Trichocereus macrogonus pachanoi", the variety iNaturalist files
 *      Echinopsis pachanoi as), active, with at least 3 observations marked captive or cultivated: the species list's own
 *      threshold (`scripts/species-list.txt`, "at least 3 cultivated records"). A complex, a genus or a hybrid formula is
 *      not one species, and a species iNaturalist lumps into another species' taxon is that species' growers, not its own.
 *
 * GBIF's living-collection records are not counted: GBIF has no key of its own for a folded species, so a garden's record
 * of it is filed under the other species' key and cannot be told apart.
 */

/** One taxon iNaturalist answers a name with (`/v1/taxa?q=`), cut to what the rule reads, with its cultivated count where asked. */
export interface InatHit { tid: number; tname: string; rank: string; matched?: string | null; obs: number; captive?: number | null; common?: string | null }

const RANKS = new Set(['species', 'subspecies', 'variety', 'form', 'hybrid']);
const plain = (s: string) => s.replace(/×/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

/** Whether a taxon iNaturalist answers is the species' own: by its name or the name it was matched by, at species rank or below with the species' epithet. */
export function ownHit(name: string, h: Pick<InatHit, 'tname' | 'rank' | 'matched'>): boolean {
  const n = plain(name), t = plain(h.tname), m = plain(h.matched ?? '');
  if (!RANKS.has(h.rank)) return false;
  if (t !== n && m !== n) return false;
  if (t === n) return true;
  // Matched by the species' name, filed by iNaturalist below species: its own when the last epithet is the species'.
  return h.rank !== 'species' && h.rank !== 'hybrid' && t.split(' ').pop() === n.split(' ').pop();
}

/** Whether a taxon is worth asking its cultivated count (the threshold cannot be met with fewer observations in all). */
export const worthCounting = (name: string, h: InatHit) => ownHit(name, h) && h.obs >= 3;

/** The species' growers by iNaturalist: the best cultivated count among its own taxa, and the taxon; null when below 3. */
export function grownBy(name: string, hits: readonly InatHit[]): { count: number; taxon: string; rank: string; common?: string } | null {
  let best: InatHit | null = null;
  for (const h of hits) if (ownHit(name, h) && (h.captive ?? 0) >= 3 && (!best || (h.captive ?? 0) > (best.captive ?? 0))) best = h;
  return best ? { count: best.captive!, taxon: best.tname, rank: best.rank, ...(best.common ? { common: best.common } : {}) } : null;
}

/** The index's names a page holds of GBIF's (what test 2 reads). */
export const gbifNamesOf = (e: { syn?: string[]; older?: string[]; hom?: string[]; kew?: string[] }) => [...(e.syn ?? []), ...(e.older ?? []), ...(e.hom ?? []), ...(e.kew ?? [])];

/** A species of the rule as the list writes it: plant_name_id, name, author, family, reason, gbif_key ("-": built from Kew's file). */
export function listLine(s: { id: string; name: string; authors: string; family: string }, g: { count: number; taxon: string; rank: string }, held: readonly string[]): string {
  // The reason opens with the rule's words, so the list's other reasons keep their grammar; "inat N" is the count the
  // strip and the search read (`grownCounts`).
  return [s.id, s.name, s.authors, s.family, `folded by GBIF into ${held.join(', ')}; inat ${g.count} (iNaturalist's ${g.taxon}, ${g.rank})`, '-'].join('\t');
}
