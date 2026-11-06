/**
 * The pages whose origin names no TDWG level-3 region (round eighty-six; the plan's B16, the browse notes): Kew gives some
 * ranges only as a level-2 region ("Mexico", "Brazil", "Malesia") or a continent, and the index's `origin` carries Kew's
 * name for it. A region page, a country preset or a filter by level-3 region must take these in by name, never drop them:
 * the list is for the browse work (C1), and `scripts/dev/r86-wide-origins.ts` writes it from an index.
 *
 * On the live index of 5 November 2026 (48,375 pages): 8 pages, Aechmea rubens, Begonia rigida, Goeppertia argyraea and
 * Neoregelia amandae ("Brazil"), Agave calodonta and Begonia rhizocaulis ("Mexico"), Trichotosia barbarossa ("Malesia"),
 * and Caladium praetermissum, whose origin was "" (Kew gives it only its continent, "SOUTHERN AMERICA", which the build
 * named nothing before round eighty-six; it reads "Southern America" once the page is derived again).
 */
import rows from './tdwg3.json';

const LEVEL3 = new Set((rows as Array<[string, string, ...number[]]>).map((r) => r[1]));

/** Whether a region's name is one of TDWG's 369 level-3 regions, as the index writes them. */
export const isLevel3Name = (name: string): boolean => LEVEL3.has(name);

/** Each page whose origin holds a name that is no level-3 region, with those names. */
export function wideOrigins(index: ReadonlyArray<{ key: string; name: string; origin?: ReadonlyArray<string> }>): Array<{ key: string; name: string; wide: string[]; origin: string[] }> {
  return index.flatMap((e) => {
    const wide = (e.origin ?? []).filter((o) => !isLevel3Name(o));
    return wide.length ? [{ key: e.key, name: e.name, wide, origin: [...(e.origin ?? [])] }] : [];
  });
}
