/**
 * Round eighty-seven (derived agent): what the walk now reads at the typical cell and how it chooses it.
 *
 *   - The extremes keep each calendar year's lowest night (`lows`), by the same lapse correction as the record low, so the
 *     habitat's USDA zone can be the mean of them.
 *   - Review D's D2 (the Poor Knights lily): the stage chose the typical cell among the cells holding an iNaturalist
 *     research-grade record; the review of stage 2 (S4) took that out, and the typical cell is every cell's again.
 *
 * FAILS on the base: no `lows`.
 */
import { describe, it, expect } from 'vitest';
import { makeHeader, cellOf, encodeCell } from '$climate/grid';
import { memoryGridSource } from '$climate/source';
import { makeClimateProvider } from '$climate/provider';
import { fixtureFetcher, type JsonFetcher } from '$dossier/fetch';

const h = makeHeader({ built: '2026-11-09T00:00:00Z' });
const lat = -35.4;
const lon0 = 174.5;
function cell(cold: number): Record<string, number> {
  const v: Record<string, number> = { elev: 100 };
  for (let m = 1; m <= 12; m++) {
    const k = String(m).padStart(2, '0');
    Object.assign(v, { [`tasmax_${k}`]: 22, [`tasmin_${k}`]: m === 7 ? cold : cold + 5, [`tas_${k}`]: 16, [`pr_${k}`]: 90, [`rsds_${k}`]: 15, [`hurs_${k}`]: 80, [`vpd_${k}`]: 500, [`sfcWind_${k}`]: 4 });
  }
  return v;
}
/** Five cells side by side, their coldest month's night 1 to 5 °C; `wild` marks the cells the taken-out rule would have read (a fourth element no longer read). */
function setup(wild: number[]) {
  const cells = new Map<string, ArrayBuffer>();
  const points: Array<[number, number, 'strict', boolean]> = [];
  for (let k = 0; k < 5; k++) {
    const lo = lon0 + k * h.cell;
    cells.set(cellOf(h, lat, lo).id, encodeCell(h, cell(k + 1)));
    points.push([lat, lo, 'strict', wild.includes(k)]);
  }
  return { grid: memoryGridSource(h, cells), points };
}

// Round eighty-seven's review of stage 2 (S4): the stage's rule that chose the typical cell among the cells holding an
// iNaturalist research-grade record is taken out; research grade is "not marked captive", not "marked wild".
describe('the typical cell among every cell (the stated-wild rule taken out, S4)', () => {
  it('cells that would have been "stated wild" choose nothing: the median of every cell, and no `wild`', async () => {
    const { grid, points } = setup([0, 3, 4]);
    const c = await makeClimateProvider({ grid, fetcher: fixtureFetcher({}), noExtremes: true }).envelope(points as never);
    if (c.status !== 'ok') throw new Error(c.status);
    expect(c.cell).toBe(cellOf(h, lat, lon0 + 2 * h.cell).id);
    expect((c as { wild?: unknown }).wild).toBeUndefined();
    expect(c.src.envelope).toMatch(/nearest the median across cells(, though|\))/);
    expect(c.src.envelope).not.toMatch(/states wild|research grade/);
  });
});

describe('the yearly lows kept with the extremes', () => {
  it('one a year from the same series, lapse-corrected, and their least is the record low', async () => {
    const tmin: Record<string, number> = {}, tmax: Record<string, number> = {}, pr: Record<string, number> = {};
    for (let y = 2000; y <= 2024; y++) for (let d = 0; d < 365; d++) {
      const day = new Date(Date.UTC(y, 0, 1 + d)).toISOString().slice(0, 10).replace(/-/g, '');
      tmin[day] = d === 190 ? -(y % 5) : 6; tmax[day] = 18; pr[day] = 1;
    }
    const power = { geometry: { coordinates: [lon0, lat, 100] }, header: { fill_value: -999 }, properties: { parameter: { T2M_MIN: tmin, T2M_MAX: tmax, PRECTOTCORR: pr } } };
    const fetcher: JsonFetcher = (async (url: string) => (url.includes('power.larc.nasa.gov') ? { status: 'ok', data: power } : { status: 'none' })) as JsonFetcher;
    const grid = memoryGridSource(h, new Map([[cellOf(h, lat, lon0).id, encodeCell(h, cell(2))]]));
    const c = await makeClimateProvider({ grid, fetcher }).at(lat, lon0);
    if (c.status !== 'ok') throw new Error(c.status);
    const ex = c.extremes!;
    expect(ex.lows?.from).toBe(2000);
    expect(ex.lows?.t).toHaveLength(25);
    // The grid's cell is 100 m and POWER's 100 m: no correction, so 2004's low is -4.
    expect(ex.lapseAppliedM).toBe(0);
    expect(ex.lows?.t[4]).toBe(-4);
    expect(Math.min(...ex.lows!.t.map((x) => x!))).toBe(ex.minAbs);
  });
});
