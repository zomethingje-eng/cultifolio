/**
 * The grower's own species list: every kind with a growing plant, plus every
 * kind followed without one. Pure, so it can be tested without the store.
 */
import { speciesSlug, speciesName, parseName, slugify, withoutSign, isGenusOnly } from '$core/names';
import type { Accession, Taxon } from './types';
import { recordedKind, type OlderKind } from '$lib/ui/ref/older-kind';

export interface MySpecies {
  slug: string;
  name: string;
  gbifKey: number | null;
  /** Plants of it with status 'growing'. */
  grown: number;
  followed: boolean;
  /** A genus (or a nothogenus) alone: the record of plants filed under their genus ("Echeveria 'Perle von Nurnberg'"), whose tile is the genus's, never a species "not in the reference" (round eighty-one, H). */
  genus?: boolean;
  /**
   * The species page the add form or the import found the name to be an older name of, or GBIF's name for, as a growing
   * plant of it carries it (`olderOf`): the tile says it, as the plant's page does (round eighty-six; review-w W2: the
   * tile said "not in the reference" of Aloe aristata, whose plants' pages said "An older name of Aristaloe aristata").
   */
  olderOf?: string;
  /**
   * Which kind of name that is, as the plant's record says the form or the import read it when it was filed (round
   * eighty-seven; `olderKind`, read by `recordedKind` where it was recorded for that `olderOf`): from the plant that gave `olderOf`, or from another growing plant
   * of the same name and page where that one's record does not say. Absent where none says, or says a word this version
   * does not know.
   */
  olderKind?: OlderKind;
}

/**
 * The name a species record shows (round eighty-one, H; review-w 10 of round eighty): the record's own name, unless it is
 * the plants' name without its hybrid sign. Builds before this one wrote a hybrid's record as "Aloe nobilis" for a plant
 * "Aloe × nobilis" (`speciesOf`). The record is not written again: no reading of the log writes to it (round fifty-six,
 * 3), and the record's id, the slug both names give, is the one it always had. This is the migration, as a reading rule.
 */
export function shownSpeciesName(stored: string | null | undefined, fromPlants: string | null | undefined): string {
  if (!stored) return fromPlants ?? '';
  if (fromPlants && fromPlants.includes('×') && !stored.includes('×') && withoutSign(fromPlants) === withoutSign(stored)) return fromPlants;
  return stored;
}

/** Slugs → entry, for every slug grown (any accession growing) or followed (a live taxon record with `followed`). Names come from the taxon record when there is one, else from the plant. */
export function mySpeciesOf(accessions: readonly Accession[], taxa: readonly Taxon[]): Map<string, MySpecies> {
  const out = new Map<string, MySpecies>();
  for (const a of accessions) {
    if (a.status !== 'growing') continue;
    const slug = speciesSlug(a.taxonName);
    if (!slug) continue;
    const cur = out.get(slug);
    const kind = recordedKind(a); // only where recorded for this `olderOf` (round eighty-seven, M1)
    if (cur) {
      cur.grown++;
      if (!cur.olderOf && a.olderOf) { cur.olderOf = a.olderOf; if (kind) cur.olderKind = kind; }
      else if (cur.olderOf && a.olderOf === cur.olderOf && !cur.olderKind && kind) cur.olderKind = kind;
    } else out.set(slug, { slug, name: speciesName(a.taxonName), gbifKey: a.taxonKey ?? null, grown: 1, followed: false, ...(isGenusOnly(a.taxonName) ? { genus: true } : {}), ...(a.olderOf ? { olderOf: a.olderOf } : {}), ...(kind ? { olderKind: kind } : {}) });
  }
  for (const t of taxa) {
    const slug = t.id;
    const cur = out.get(slug);
    if (cur) {
      cur.name = shownSpeciesName(t.name, cur.name);
      cur.gbifKey = t.gbifKey ?? cur.gbifKey;
      cur.followed = !!t.followed;
    } else if (t.followed) out.set(slug, { slug, name: t.name, gbifKey: t.gbifKey ?? null, grown: 0, followed: true, ...(t.name && isGenusOnly(t.name) ? { genus: true } : {}) });
  }
  return out;
}

/**
 * Which taxon record a plant's "My notes on …" are kept on, and the name it carries (round sixty-two; A21). A plant of a
 * species, a cultivar or a "cf." or "aff." plant keeps them on its species' record, shared with every plant of that
 * species and shown on its page. An "sp." or "spp." plant is no species: its notes are kept by its full name ("Lithops sp.
 * C 036"), not on the bare genus, where every "Lithops sp." plant shared one text. `shared` is the record they were kept on
 * before, when it differs: still read, so notes written there are not lost from the page.
 */
export function notesTaxon(taxonName: string): { slug: string; name: string; shared?: string } {
  const p = parseName(taxonName);
  if ((p.qualifier === 'sp.' || p.qualifier === 'spp.') && !p.epithet) return { slug: slugify(taxonName), name: taxonName.trim(), shared: speciesSlug(taxonName) };
  return { slug: speciesSlug(taxonName), name: speciesName(taxonName) };
}
/** The species a "cf." or "aff." plant is compared with ("Copiapoa cf. cinerea" → "Copiapoa cinerea"), or null: its links and its habitat are that species', and say so (round sixty-two; A21). */
export function comparedSpecies(taxonName: string): string | null {
  const p = parseName(taxonName);
  return (p.qualifier === 'cf.' || p.qualifier === 'aff.') && p.epithet ? `${p.genus} ${p.epithet}` : null;
}
