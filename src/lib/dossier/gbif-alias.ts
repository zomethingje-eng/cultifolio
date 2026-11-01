/**
 * GBIF's name for a page's key as an address the page's figures answer to (round eighty-five; review-c C4, review-s S2).
 *
 * A grower's plant carries a name and a GBIF key, and its page finds the species' figures by the hash group of the name's
 * address, so the server never learns which species. Round eighty-four headed 501 pages by Kew's name (`name.gbif` keeps
 * GBIF's): a plant recorded under the old heading, with the page's own key, then found no page, though /about/how promised
 * the key still led to it. The build files a copy of the page's sheet under GBIF's name's address as well (as it does a
 * merged page's old address, round seventy-three), marked `via: 'gbif'`, and the device takes the copy only for a plant
 * of the page's own key (`sheetForNameOr`). One copy a renamed page: no other names, which would be hundreds of thousands.
 */
import { slugify, speciesOf } from '$core/names';
import type { PageId } from '$core/page-id';

/** An address a page answers to besides its own: a merged page's old address, or GBIF's name for its key (`via: 'gbif'`). */
export type AliasOf = { slug: string; key: PageId; via?: 'gbif' };

/** The part of a dossier the alias reads. */
export type GbifNamed = { key: PageId; slug: string; name: { scientific: string; gbif?: { scientific?: string } | null } };

/**
 * GBIF's name for the page's key as an alias of the page, when Kew's name heads the page and GBIF's names a species of
 * another address; null otherwise. The address is the species part's (`speciesOf`), as a plant's page asks by it.
 */
export function gbifAliasOf(d: GbifNamed): AliasOf | null {
  const g = d.name.gbif?.scientific?.trim();
  if (!g) return null;
  const slug = slugify(speciesOf(g));
  if (!slug || slug === d.slug || slug === slugify(speciesOf(d.name.scientific))) return null;
  return { slug, key: d.key, via: 'gbif' };
}
