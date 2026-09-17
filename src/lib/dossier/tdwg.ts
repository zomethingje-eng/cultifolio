/**
 * WGSRPD level-3 regions as bounding boxes: 369 rows, computed once from the
 * published geometry. Three wrap the antimeridian and are stored west > east.
 * Brummitt (2001) World Geographical Scheme for Recording Plant Distributions, ed. 2, TDWG.
 */
import rows from './tdwg3.json';
import type { Box } from '$core/geo';

type Row = [string, string, number, number, number, number];
const ROWS = rows as Row[];

export const TDWG3: Record<string, Box> = {};
const BY_NAME: Record<string, string> = {};
const NAMES: Record<string, string> = {};

export const tdwgName = (s: string) =>
  String(s || '')
    .toLowerCase()
    .replace(/\bislands?\b/g, 'is')
    .replace(/[.,’'–—-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

for (const r of ROWS) {
  TDWG3[r[0]] = { s: r[2], w: r[3], n: r[4], e: r[5] };
  BY_NAME[tdwgName(r[1])] = r[0];
  NAMES[r[0]] = r[1];
}

/** "TDWG:SCI", "TDWG:3:SCI", "WGSRPD:L3:SCI" — prefixes vary, the three letters do not. */
export function tdwgCode(locationId: string | undefined, locality?: string): string | null {
  const m = /(?:^|:)([A-Z]{3})$/.exec(String(locationId ?? '').toUpperCase().trim());
  if (m && TDWG3[m[1]]) return m[1];
  if (locality) {
    const c = BY_NAME[tdwgName(locality)];
    if (c) return c;
  }
  return null;
}

export const tdwgLabel = (code: string) => NAMES[code] ?? code;
