/**
 * The browse pages' country table (round eighty-seven, the plan's C5): each ISO 3166 country and the TDWG level-3 regions
 * it holds, from the shapes file's own country table (`scripts/tdwg3-shapes.json` `countries` and `places`: Natural
 * Earth's states and provinces placed in TDWG's level-3 regions by TDWG's tables, round eighty). The browse agent's
 * presets read it from `tdwg-levels.json` (`COUNTRIES` in `tdwg.ts`, written by scripts/dev/r87-tdwg-levels.ts), so it is
 * not carried again in the index or the browse table, which would grow both by its 250 rows for nothing: this is the one
 * rule, and a test holds the committed table to the shapes file it is read from.
 *
 * A region is a country's own when no other country is in it; its main one when more than half of the region's states
 * and provinces in `places` are the country's; otherwise one it shares (`also`).
 */
export interface CountryRegions { own: string[]; main: string[]; also: string[] }

export function countryTableOf(shapes: { countries: Record<string, readonly string[]>; places: Record<string, readonly string[]> }): Record<string, CountryRegions> {
  const out: Record<string, CountryRegions> = {};
  for (const [r, cs] of Object.entries(shapes.countries)) {
    const places = shapes.places[r] ?? [];
    for (const c of cs) {
      const x = (out[c] ??= { own: [], main: [], also: [] });
      if (cs.length === 1) x.own.push(r);
      else if (places.length && places.filter((p) => p.endsWith(`|${c}`)).length * 2 > places.length) x.main.push(r);
      else x.also.push(r);
    }
  }
  for (const x of Object.values(out)) for (const k of ['own', 'main', 'also'] as const) x[k].sort();
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}
