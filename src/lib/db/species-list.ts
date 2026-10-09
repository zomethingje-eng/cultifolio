/**
 * The grower's own species list: every kind with a growing plant, plus every
 * kind followed without one. Pure, so it can be tested without the store.
 */
import { speciesSlug, speciesOf, parseName, slugify } from '$core/names';
import type { Accession, Taxon } from './types';

export interface MySpecies {
  slug: string;
  name: string;
  gbifKey: number | null;
  /** Plants of it with status 'growing'. */
  grown: number;
  followed: boolean;
}

/** Slugs → entry, for every slug grown (any accession growing) or followed (a live taxon record with `followed`). Names come from the taxon record when there is one, else from the plant. */
export function mySpeciesOf(accessions: readonly Accession[], taxa: readonly Taxon[]): Map<string, MySpecies> {
  const out = new Map<string, MySpecies>();
  for (const a of accessions) {
    if (a.status !== 'growing') continue;
    const slug = speciesSlug(a.taxonName);
    if (!slug) continue;
    const cur = out.get(slug);
    if (cur) cur.grown++;
    else out.set(slug, { slug, name: speciesOf(a.taxonName), gbifKey: a.taxonKey ?? null, grown: 1, followed: false });
  }
  for (const t of taxa) {
    const slug = t.id;
    const cur = out.get(slug);
    if (cur) {
      cur.name = t.name || cur.name;
      cur.gbifKey = t.gbifKey ?? cur.gbifKey;
      cur.followed = !!t.followed;
    } else if (t.followed) out.set(slug, { slug, name: t.name, gbifKey: t.gbifKey ?? null, grown: 0, followed: true });
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
  return { slug: speciesSlug(taxonName), name: speciesOf(taxonName) };
}
/** The species a "cf." or "aff." plant is compared with ("Copiapoa cf. cinerea" → "Copiapoa cinerea"), or null: its links and its habitat are that species', and say so (round sixty-two; A21). */
export function comparedSpecies(taxonName: string): string | null {
  const p = parseName(taxonName);
  return (p.qualifier === 'cf.' || p.qualifier === 'aff.') && p.epithet ? `${p.genus} ${p.epithet}` : null;
}
