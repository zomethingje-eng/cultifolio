/**
 * Round ninety (the owner's decision of 14 November 2026): a wide-ranging plant's typical spot no longer moves to another
 * continent on a few records more. Cells whose coldest month's mean nightly low is within 0.5 °C of the one nearest the
 * median count as equally near, and of those the cell holding the most records is taken (then the nearer, then the id).
 * Stage 2's dry run moved 79 typical spots, 24 of them over 1,000 km: Medicago lupulina from Shandong to Bern (8,591 km)
 * on 774 → 778 records in range, Oplismenus undulatifolius from Turin to Kōchi.
 *
 * Here two builds of one plant: the first has a well-recorded cell at Bern and a thinly recorded one in Shandong, the
 * median at Bern's; the second adds two records elsewhere, which move the median a tenth of a degree towards Shandong's.
 *
 * On fce7905: FAILED. The second build's typical spot was Shandong's (the nearest by 0.1 °C), 8,591 km from the first's.
 */
import { describe, it, expect } from 'vitest';
import { makeHeader, cellOf, encodeCell } from '$climate/grid';
import { memoryGridSource } from '$climate/source';
import { makeClimateProvider, TYPICAL_TIE_C } from '$climate/provider';
import { fixtureFetcher } from '$dossier/fetch';

const h = makeHeader({ built: '2026-09-14T00:00:00Z' });
const cell = (cold: number) => {
  const v: Record<string, number> = { elev: 400 };
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, '0');
    v[`tasmax_${mm}`] = 24; v[`tasmin_${mm}`] = cold + (m === 1 ? 0 : 5); v[`tas_${mm}`] = 14; v[`pr_${mm}`] = 60;
  }
  return v;
};
const BERN: [number, number] = [47.075, 7.625], SHANDONG: [number, number] = [36.175, 120.275];
// [place, coldest night, records there]
type Site = [[number, number], number, number];
const FIRST: Site[] = [[[60.1, 10.1], -9, 2], [[55.1, 37.1], -6, 3], [BERN, -2.1, 40], [SHANDONG, -2.0, 6], [[40.1, -3.1], 1, 5]];
const SECOND: Site[] = [...FIRST, [[38.1, 23.1], -1.9, 1], [[37.1, -7.1], 3, 1]];

async function spot(sites: Site[]) {
  const grid = new Map<string, ArrayBuffer>();
  const points: Array<[number, number]> = [];
  for (const [p, cold, n] of sites) {
    grid.set(cellOf(h, ...p).id, encodeCell(h, cell(cold)));
    for (let i = 0; i < n; i++) points.push(p);
  }
  // Shandong's records first, as GBIF may list them: the order must not decide.
  points.sort((a, b) => (a === SHANDONG ? -1 : 0) - (b === SHANDONG ? -1 : 0));
  const c = await makeClimateProvider({ grid: memoryGridSource(h, grid), fetcher: fixtureFetcher({}), noExtremes: true }).envelope(points);
  if (c.status !== 'ok') throw new Error(`${c.status}: ${'detail' in c ? c.detail : ''}`);
  return c;
}
const near = (at: { lat: number; lon: number }, p: [number, number]) => Math.abs(at.lat - p[0]) < 0.1 && Math.abs(at.lon - p[1]) < 0.1;

describe('r90c: the typical spot holds on a few records more', () => {
  it('the margin is half a degree', () => expect(TYPICAL_TIE_C).toBe(0.5));

  it('both builds take Bern, the most recorded of the cells near the median; before, the second took Shandong', async () => {
    const a = await spot(FIRST), b = await spot(SECOND);
    expect(near(a.at, BERN), JSON.stringify(a.at)).toBe(true);
    expect(near(b.at, BERN), JSON.stringify(b.at)).toBe(true); // base: Shandong, the nearest by 0.1 °C
    expect(b.src.envelope).toMatch(/the 3 cells within 0\.5 °C of the nearest count as equally near, and of those the one holding the most records is taken/);
  });

  it('guard: a cell more than half a degree further from the median is not taken for its records', async () => {
    // Bern's coldest night 0.6 °C from the median: Shandong, the nearest, stands, and the record says nothing of a tie.
    const c = await spot([[[60.1, 10.1], -9, 2], [[55.1, 37.1], -6, 3], [BERN, -1.4, 40], [SHANDONG, -2.0, 6], [[40.1, -3.1], 1, 5], [[45.1, 30.1], -8, 1], [[37.1, -7.1], 3, 1]]);
    expect(near(c.at, SHANDONG), JSON.stringify(c.at)).toBe(true);
    expect(c.src.envelope).not.toMatch(/equally near/);
  });
});
