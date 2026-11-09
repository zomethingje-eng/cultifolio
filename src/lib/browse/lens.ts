/**
 * The collection lens (round eighty-seven, C8): on a region's, a genus's or a family's page, which of the page's species
 * the grower grows, and which of their plants belong there. Worked out in the browser and nowhere else: the page is the
 * same page for everyone, and the grower's plants are matched against it here, from the reference's entries of the
 * species they grow, asked by hash group as a plant's page asks them (`entriesOr`: a group of a few hundred species,
 * never a name), so the server never learns which species a device holds. Nothing of the lens is in an address or a
 * request: its Yours and Not yours are this page's, in this tab.
 *
 * "In your collection now": the plants growing (status `growing`), not those archived or dead. A plant filed under
 * another page's name (`olderOf`) is matched as that page, as its tile is. A plant of a genus alone ("Echeveria 'Perle
 * von Nürnberg'") is of its genus's page and no other: its species, and so its range and family, is not known.
 *
 * Pure: tests/unit/r87b-lens.test.ts holds it.
 */
import { speciesSlug, genusOf, isGenusOnly, slugify } from '$core/names';

/** What the page is, as the lens reads it. */
export type LensOf =
  /** A region: the origin names of the index that are native to it, as the browse engine reads a ticked region (`nativeNamesOf`). */
  | { kind: 'region'; native: readonly string[] }
  | { kind: 'genus'; genus: string }
  | { kind: 'family'; family: string };

export interface LensPlant { id: string; acc?: string | null; taxonName: string; status?: string; olderOf?: string | null }
export interface LensEntry { slug: string; name: string; family?: string; origin?: readonly string[] }
export interface LensSpecies { slug: string; name: string; plants: LensPlant[] }
export interface Lens {
  /** The page's species the grower grows, A to Z, each with their plants. */
  species: LensSpecies[];
  /** Plants of the genus filed under the genus alone (a genus page only). */
  genusOnly: LensPlant[];
  /** How many plants are growing. */
  growing: number;
  /** Growing plants whose species the reference does not hold (not matched to any page, here or elsewhere). */
  notHeld: number;
}

/** The page a growing plant is of: the page its name is filed under, else its own name's. */
export const plantSlug = (a: LensPlant): string => speciesSlug(a.olderOf || a.taxonName);
/** The growing plants: what "in your collection now" counts. */
export const growing = (plants: readonly LensPlant[]): LensPlant[] => plants.filter((a) => a.status === 'growing');
/** The pages to ask the reference's entries of: one a species grown, never a genus alone. */
export const slugsToAsk = (plants: readonly LensPlant[]): string[] => [...new Set(growing(plants).filter((a) => !isGenusOnly(a.olderOf || a.taxonName)).map(plantSlug).filter(Boolean))];

/** Whether an entry is one of the page's species. */
export function belongs(e: LensEntry, of: LensOf, native?: ReadonlySet<string>): boolean {
  if (of.kind === 'genus') return slugify(genusOf(e.name)) === slugify(of.genus);
  if (of.kind === 'family') return !!e.family && e.family === of.family;
  const set = native ?? new Set(of.native);
  return (e.origin ?? []).some((o) => set.has(o));
}

/** The lens of a page over the grower's plants, from the entries the reference gave for their species (by slug). */
export function lensOf(plants: readonly LensPlant[], entries: ReadonlyMap<string, LensEntry>, of: LensOf): Lens {
  const live = growing(plants);
  const native = of.kind === 'region' ? new Set(of.native) : undefined;
  const by = new Map<string, LensSpecies>();
  const genusOnly: LensPlant[] = [];
  let notHeld = 0;
  for (const a of live) {
    const name = a.olderOf || a.taxonName;
    if (isGenusOnly(name)) { if (of.kind === 'genus' && slugify(genusOf(name)) === slugify(of.genus)) genusOnly.push(a); continue; }
    const e = entries.get(plantSlug(a));
    if (!e) { notHeld++; continue; }
    if (!belongs(e, of, native)) continue;
    const s = by.get(e.slug) ?? { slug: e.slug, name: e.name, plants: [] };
    s.plants.push(a);
    by.set(e.slug, s);
  }
  return { species: [...by.values()].sort((x, y) => x.name.localeCompare(y.name, 'en', { sensitivity: 'base' })), genusOnly, growing: live.length, notHeld };
}
