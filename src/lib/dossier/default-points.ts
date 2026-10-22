/**
 * Default points (round eighty, A; review-d 9): a coordinate a dataset gives records it has no locality for, not where a plant
 * was found. A MATERIAL_SAMPLE record with no year at 23.874, -101.554 (Mexico's middle) was on the map of five sampled
 * cacti and counted toward their markers; for Mammillaria zublerae it was one of two open points. Round seventy-nine (Q)
 * found such points but no openly licensed list of country or province centroids to make a rule of. This rule needs none:
 * it is read from the reference's own records. A point is a default point when the openly licensed in-range records of at
 * least `MIN_SPECIES` species of the reference lie at exactly that coordinate (to three decimals, about 100 m), and at least
 * `MIN_UNDATED` of all the records there have no year. Wild records of many species at one spot are dated (a survey plot,
 * a collector's camp); a centroid's are not. On round seventy-seven's corpus: 18 points, among them French Guiana's
 * (84 species), Guadeloupe's, Martinique's, Mayotte's, Madagascar's, China's and Mexico's (180 species).
 *
 * A record at a default point is left out of the map, the marker and the climate, and the page's record of its sources
 * counts it. The list is written by `--list-default-points` from the dossiers on disk (`scripts/default-points.txt`), and
 * every build reads it. Pure: the script reads the files.
 */
export const MIN_SPECIES = 20;
export const MIN_UNDATED = 0.95;

/** A coordinate as the rule keys it: three decimals, as the build rounds a record. */
export const pointKey = (lat: number, lon: number) => `${+lat.toFixed(3)},${+lon.toFixed(3)}`;

export interface DefaultPoint { key: string; species: number; records: number; undated: number }

/** The default points of a corpus: every page's open in-range records, `[lat, lon, year, …]`. */
export function defaultPoints(pages: Iterable<{ open: ReadonlyArray<readonly [number, number, (number | null)?, ...unknown[]]> }>): DefaultPoint[] {
  const at = new Map<string, { species: number; records: number; undated: number }>();
  for (const p of pages) {
    const seen = new Set<string>();
    for (const r of p.open) {
      const k = pointKey(r[0], r[1]);
      const x = at.get(k) ?? { species: 0, records: 0, undated: 0 };
      if (!seen.has(k)) { x.species++; seen.add(k); }
      x.records++;
      if (r[2] == null) x.undated++;
      at.set(k, x);
    }
  }
  return [...at].filter(([, x]) => x.species >= MIN_SPECIES && x.undated >= MIN_UNDATED * x.records).map(([key, x]) => ({ key, ...x })).sort((a, b) => b.species - a.species || (a.key < b.key ? -1 : 1));
}

/** `scripts/default-points.txt`: "lat,lon<TAB>species<TAB>records<TAB>undated" a line; "#" starts a comment. */
export function formatDefaultPoints(ps: readonly DefaultPoint[], head: string[]): string {
  return [...head.map((h) => `# ${h}`), ...ps.map((p) => `${p.key}\t${p.species}\t${p.records}\t${p.undated}`)].join('\n') + '\n';
}
export function parseDefaultPoints(text: string): Set<string> {
  const out = new Set<string>();
  for (const l of text.split(/\r?\n/)) {
    const m = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\t/.exec(l);
    if (m) out.add(pointKey(Number(m[1]), Number(m[2])));
  }
  return out;
}
