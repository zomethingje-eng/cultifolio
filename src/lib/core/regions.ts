/**
 * Broad regions for grouping species on the front page. WCVP gives level-3
 * TDWG units ("Cape Provinces", "Mexico Northeast"), which is too fine for a
 * front page: a 52-species collection would make 25 headings. Each unit is
 * folded into one of ~18 broad regions by its centroid, with a few named
 * exceptions where geography and horticultural habit disagree (Madagascar and
 * Socotra stand alone; Arabia is not "Asia").
 */
import tdwg from '$dossier/tdwg3.json';

type Row = [string, string, number, number, number, number]; // code, name, s, w, n, e
const byName = new Map<string, Row>();
for (const r of tdwg as Row[]) byName.set(r[1], r);

const SPECIAL: Record<string, string> = {
  Madagascar: 'Madagascar',
  Socotra: 'Socotra',
  'Canary Is.': 'Macaronesia',
  Madeira: 'Macaronesia',
  'Cape Verde': 'Macaronesia',
  Azores: 'Macaronesia'
};

export function broadRegion(unitName: string): string {
  if (SPECIAL[unitName]) return SPECIAL[unitName];
  const r = byName.get(unitName);
  if (!r) return unitName;
  const lat = (r[2] + r[4]) / 2;
  // A box that wraps the antimeridian is stored west > east; its middle is on the far side of 180, not at 0.
  let lon = r[3] > r[5] ? (r[3] + r[5] + 360) / 2 : (r[3] + r[5]) / 2;
  if (lon > 180) lon -= 360;
  if (lat < -60) return 'Antarctica & subantarctic islands';
  // The Pacific: everything between the Americas and Asia at tropical and temperate latitudes, including Hawaii,
  // the Aleutians and the islands east of the antimeridian, is Oceania, not the continent whose longitude it shares.
  if ((lon < -125 && lat < 30 && lat > -50) || ((lon >= 165 || lon <= -165) && lat < 45)) return 'Australia & Oceania';
  if (lat > 50 && lon > 60) return 'Siberia & the Russian Far East';
  // Americas
  if (lon < -30) {
    if (lat > 49) return 'Northern North America';
    if (lat > 23 && lon < -100) return 'Western United States & northern Mexico';
    if (lat > 23) return 'Eastern North America';
    if (lat > 7 && lon < -77) return 'Mexico & Central America';
    if (lat > 7) return 'Caribbean';
    if (lon < -62 && lat > -56) return 'Andes & Chile';
    if (lat < -22) return 'Southern South America';
    return 'Brazil & tropical South America';
  }
  // Africa & Arabia
  if (lon < 52 && lat < 38) {
    if (lon > 34 && lat > 12 && lon > 40 - (lat - 12) * 0.3) return 'Arabia';
    if (lat < -22) return 'Southern Africa';
    if (lat < -8 && lon > 25) return 'South-central Africa';
    if (lon > 28 && lat > -12) return 'East Africa & Horn';
    if (lat > 20) return 'North Africa & Mediterranean';
    return 'West & Central Africa';
  }
  // Europe & western Asia
  if (lat > 35 && lon < 60) return lon < 30 && lat > 42 ? 'Europe' : 'Mediterranean & western Asia';
  if (lat > 38 && lon < 100) return 'Central Asia';
  // Asia & Australasia
  if (lon < 92 && lat > 5) return 'Indian subcontinent';
  if (lat > 20) return 'China, Japan & Korea';
  if (lat > 5 && lon < 110) return 'Indochina';
  if (lat > -11 && lon < 155) return 'Malesia';
  if (lon > 110) return 'Australia & Oceania';
  return unitName;
}

/** A TDWG unit's name as a person would say it: WCVP writes "Gambia,  The" and "Bahamas, The". */
export const unitName = (u: string) => u.replace(/^(.+?),\s+The$/, 'The $1');

/** The broad region most of a species' native units fall in; ties go to the first listed. The homepage groups by this, on the server and again on the client for the full list. */
export function groupFor(origin: string[]): string {
  const tally = new Map<string, number>();
  for (const u of origin) tally.set(broadRegion(u), (tally.get(broadRegion(u)) ?? 0) + 1);
  return [...tally.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? 'Origin not stated';
}
