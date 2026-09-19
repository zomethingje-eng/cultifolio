/**
 * The grower's own species list: every kind with a growing plant, plus every
 * kind followed without one. Pure, so it can be tested without the store.
 */
import { slugify } from '$core/names';
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
    const slug = slugify(a.taxonName);
    if (!slug) continue;
    const cur = out.get(slug);
    if (cur) cur.grown++;
    else out.set(slug, { slug, name: a.taxonName, gbifKey: a.taxonKey ?? null, grown: 1, followed: false });
  }
  for (const t of taxa) {
    if (t.removed) continue;
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
