/** One species as the index lists it: what the catalogue, the search and the bucket files are built from, on the PC and in the Worker alike. */
export interface IndexEntry {
  key: number;
  slug: string;
  name: string;
  family?: string;
  common?: string;
  /** Every other English common name the species has (round sixty; the product review, 6), searched as `common` is. Absent in an index built before; none is then searched beyond `common`. */
  commons?: string[];
  origin?: string[];
  thumb?: string;
  photos: number;
  open: number;
  climate: string;
  /** The six species whose habitat climate is nearest (src/lib/core/near.ts), written at index time. */
  near?: number[];
  /** Older names for the species, as binomials, written at index time (round thirty-one, 3). */
  syn?: string[];
}

/**
 * A species' English common names as the index carries them: the first as `common` (what a row and a tile show), every
 * other as `commons`, each once whatever its case or spacing, in the order the source lists them (round sixty; the
 * product review, 6: "snake plant" found a species only when it was the first name GBIF listed).
 */
export function englishNames(vernacular: Array<{ name: string; lang?: string }>): { common?: string; commons?: string[] } {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const v of vernacular) {
    if (v.lang !== 'eng' || typeof v.name !== 'string') continue;
    const name = v.name.trim().replace(/\s+/g, ' ');
    const k = name.toLowerCase();
    if (!name || seen.has(k)) continue;
    seen.add(k);
    names.push(name);
  }
  if (!names.length) return {};
  return names.length > 1 ? { common: names[0], commons: names.slice(1) } : { common: names[0] };
}
