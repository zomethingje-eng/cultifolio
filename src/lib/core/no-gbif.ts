/**
 * A page without a GBIF key (round seventy-nine, the owner's decision 1): a species Kew accepts, on the species list,
 * for which GBIF's backbone gives no one key (`scripts/species-list.txt`, the lines whose last column is "-"). Of the
 * list's 2,327 such species on 2026-10-19, GBIF's backbone held the words only as a synonym of another species for
 * 1,758, held no name of the words for 564 (79 of them it spells otherwise), and held them only as several doubtful
 * names for 5 (docs/review-79 K's report). None is matched to GBIF by its name (rule 3), so GBIF's records, which GBIF
 * files under its own species, are not asked, and nothing derived from them is made: the map's points, the map marker,
 * the habitat climate, the species of nearest habitat climate and GBIF's photographs. Each says "not checked", with
 * `NO_GBIF_WHY` (rule 2), never "none".
 *
 * The one sign everywhere is the GBIF key's absence: a dossier's `ids.gbif`, an index entry's, a card's and a sheet's
 * `gbif`. Every one of them carried it since round seventy-eight, so absent now means this, and nothing else.
 *
 * Since the owner's decision on K's offer (round seventy-nine), most of these pages read GBIF's records all the same, under
 * the keys of the names Kew's file holds as this plant (`scripts/extra-keys-kew.txt`, round seventy-three's rule: Kew's
 * synonymy read, never a name matched): such a page has no GBIF key of its own, and its records, map, marker and habitat
 * climate are read as any page's, each key named (`occurrences.keys`). Only a page that reads no key says "not checked":
 * `recordsUnchecked`. An index entry, a card or a sheet says it by its climate (`pending` only where nothing was read).
 */

/** Why GBIF's records were not asked, as a clause (no capital, no full stop): the dossier's records and the pages say it. */
export const NO_GBIF_WHY = "GBIF's backbone holds no one accepted species of this name, and a name it holds only as another species' synonym is not taken for this one, so GBIF's records were not asked";

/** The same, as a sentence. */
export const NO_GBIF_SENTENCE = `${NO_GBIF_WHY.charAt(0).toUpperCase()}${NO_GBIF_WHY.slice(1)}.`;

/** The climate's detail on such a page: what it says where the habitat climate would be. */
export const NO_GBIF_CLIMATE = `${NO_GBIF_WHY}, and the habitat climate is read only from them`;

/** Whether a dossier, an index entry, a card or a sheet is a page without a GBIF key. */
export function noGbif(x: { gbif?: number | null } | { ids?: { gbif?: number | null } | null } | null | undefined): boolean {
  if (!x) return false;
  if ('ids' in x) return x.ids?.gbif == null;
  return (x as { gbif?: number | null }).gbif == null;
}

/**
 * Whether a dossier's GBIF records were not checked: a page without a GBIF key that read no key Kew's synonymy gives it
 * (round seventy-nine). A page with a GBIF key, or one that read such keys, has its records read (or refused, said as any page's).
 */
export function recordsUnchecked(d: { ids?: { gbif?: number | null } | null; gbif?: number | null; occurrences?: { keys?: readonly unknown[] | null } | null; climate?: { status: string } | null } | null | undefined): boolean {
  if (!d || !noGbif(d as Parameters<typeof noGbif>[0])) return false;
  // A dossier names the keys it read; a sheet, an entry or a card says it by its climate, pending only where nothing was read.
  return d.occurrences ? !d.occurrences.keys?.length : d.climate?.status === 'pending';
}

/** What a page without a GBIF key says of the records it read under the keys Kew's synonymy gives it, as a sentence. */
export function kewKeysSentence(keys: ReadonlyArray<{ key: number; name: string; n: number }>): string {
  const list = keys.map((k) => `${k.key} (${k.name}, ${k.n} record${k.n === 1 ? '' : 's'})`).join(', ');
  return `This species has no GBIF key of its own. Its records are GBIF's under the key${keys.length === 1 ? '' : 's'} of the name${keys.length === 1 ? '' : 's'} Kew's World Checklist holds as this plant: ${list}. No name was matched to GBIF; the keys are read from Kew's synonymy.`;
}
