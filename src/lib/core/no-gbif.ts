/**
 * A page without a GBIF key (round seventy-nine, the owner's decision 1): a species Kew accepts, on the species list,
 * for which GBIF's backbone gives no one key (`scripts/species-list.txt`, the lines whose last column is "-"). Of the
 * list's 2,327 such species on 2026-10-19, GBIF's backbone held the words only as a synonym of another species for
 * 1,758, held no name of the words for 564 (79 of them it spells otherwise), and held them only as several doubtful
 * names for 5 (docs/review-79 K's report). Round eighty's list has 2,335 (agent X's two findings), 920 of them reading no
 * key, as the live index of corpus a27e34d376199544 counts them (review D of round eighty); agent A's Xanthoceras line
 * (GBIF's one usage of its words is another plant's, in another order) makes 2,336, and 921 reading no key. None is matched to GBIF by its name (rule 3), so GBIF's records, which GBIF
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

/**
 * The notice on a grower's plant whose species page has no GBIF key while the plant records one (round eighty, A;
 * review-w 4). Before, it said GBIF's records "were not asked" whenever the page had no key, while most such pages read
 * GBIF's records under the keys Kew's synonymy gives them (Echinopsis crassicaulis reads seven, 5623025 among them). Now
 * it says what the page did: no records asked (`recordsUnchecked`), or records read under those keys, and whether the
 * plant's own key is one of them (a dossier's `occurrences.keys`, a sheet's `keys`).
 */
export function keylessPlantNotice(d: { ids?: { gbif?: number | null } | null; gbif?: number | null; occurrences?: { keys?: ReadonlyArray<{ key: number }> | null } | null; keys?: readonly number[] | null; climate?: { status: string } | null }, taxonName: string, taxonKey: number): string {
  if (recordsUnchecked(d)) return `The reference holds ${taxonName} without a GBIF key: ${NO_GBIF_WHY}. This plant records GBIF key ${taxonKey}, which no species page holds; the species shown here is the reference's page of that name.`;
  const keys = d.occurrences?.keys?.map((k) => k.key) ?? d.keys ?? null;
  const head = `The reference holds ${taxonName} without a GBIF key of its own: its page reads GBIF's records under the keys of the names Kew's World Checklist holds as this plant.`;
  if (keys?.includes(taxonKey)) return `${head} This plant records GBIF key ${taxonKey}, one of those keys, so its records are on the species page shown here.`;
  return `${head} This plant records GBIF key ${taxonKey}, which ${keys ? 'is not one of them and ' : ''}no species page holds as its own; the species shown here is the reference's page of that name.`;
}


/**
 * Why a page without a GBIF key read no key, said for that page (round eighty, R): the dossier's `occurrences.unread`,
 * which the build writes from `scripts/extra-keys-kew-none.txt` (`noKeyFor`, `$dossier/extra-keys`). Every figure in it is
 * the backbone's or Kew's: the names GBIF holds, and the page GBIF files them under. Absent on a page built before, which
 * says `NO_GBIF_WHY`.
 */
export type Unread = {
  kind: 'lumped' | 'other-type' | 'pro-parte' | 'other-author' | 'none' | 'other';
  why: string;
  /** For `lumped`: the reference pages GBIF files the names under, by GBIF key, with the name and id of the page here. */
  under?: Array<{ key: number; name: string; page?: string }>;
};

const quoted = (xs: readonly string[], n = 2) => `${xs.slice(0, n).join('; ')}${xs.length > n ? '; and others' : ''}`;

/** The clause (no capital, no full stop) for a page that read no key, from what the backbone holds of Kew's names for it. */
export function noKeyWhy(x: { kind: Unread['kind']; names: number; usages: readonly string[]; own?: boolean; under?: ReadonlyArray<{ key: number; name?: string; kew?: boolean }>; parts?: ReadonlyArray<{ kind: Unread['kind']; usages: readonly string[] }> }): string {
  const it = x.usages.length === 1;
  if (x.kind === 'lumped') {
    const under = x.under ?? [];
    const one = under.length === 1;
    const holders = under.map((h) => h.name ?? `GBIF key ${h.key}`).join(' and ');
    const kew = under.length > 0 && under.every((h) => h.kew);
    return `GBIF's backbone files ${x.own ? `this species' own name${it ? '' : 's'}` : `name${it ? '' : 's'} Kew's World Checklist holds as this species`} (${quoted(x.usages)}) under ${holders}, ${one ? 'a species with its own page here' : 'species with their own pages here'}${kew ? `, which Kew's World Checklist accepts apart from this one: GBIF lumps what Kew splits` : ''}; GBIF's records under ${it ? 'that name' : 'those names'} are on ${one ? 'that page' : 'those pages'}, and a record is shown on one page only, so they were not asked for this one`;
  }
  if (x.kind === 'none') return `GBIF's backbone ${x.names === 1 ? 'does not hold the one name' : `holds none of the ${x.names} names`} Kew's World Checklist gives this species, so there is no GBIF key to ask its records by, and no name is matched to GBIF`;
  const parts = (x.parts?.length ? x.parts : [{ kind: x.kind, usages: x.usages }]).flatMap((p) => {
    const ex = p.usages.length ? ` (${quoted(p.usages)})` : '';
    switch (p.kind) {
      case 'other-type': return [`as names Kew's World Checklist files under this species as of another type${ex}, whose records are not read as this species'`];
      case 'pro-parte': return [`as names that are partly another taxon's${ex}, whose records are no one species'`];
      case 'other-author': return [`under another author than Kew's${ex}, which is not read as Kew's name`];
      default: return [];
    }
  });
  if (!parts.length) return NO_GBIF_WHY;
  return `GBIF's backbone holds this species' names only ${parts.join(', or ')}, so GBIF's records were not asked`;
}

/** Why a dossier's GBIF records were not checked, as a clause: its own reason when the build wrote one, else `NO_GBIF_WHY`. */
export const uncheckedWhy = (d: { occurrences?: { unread?: { why?: string } | null } | null } | null | undefined): string => d?.occurrences?.unread?.why || NO_GBIF_WHY;
/** The same, as a sentence. */
export const uncheckedSentence = (d: Parameters<typeof uncheckedWhy>[0]): string => { const w = uncheckedWhy(d); return `${w.charAt(0).toUpperCase()}${w.slice(1)}.`; };
/** The climate's detail for it. */
export const uncheckedClimate = (why: string) => `${why}; the habitat climate is read only from GBIF's records`;
