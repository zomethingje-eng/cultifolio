/**
 * Round 108 (docs/PLAN-108.md; the first hand-off's round 5): a habitat climate from records placed only to within 30 km,
 * where the records placed to within 10 km give none, inside the two regions round 108's proof read; each record read as
 * the land around it; the months, the rain and the light, and no NASA POWER figure, said as not derived and why.
 *
 * On 191e13e: FAILED, every test: `$core/coarse` did not exist, readRecords dropped a record placed to 20 km as vague and
 * read nothing from it, the provider had no coarse reading, and no page could say "placed to 30 km".
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { makeHeader, cellOf, encodeCell } from '$climate/grid';
import { memoryGridSource } from '$climate/source';
import { makeClimateProvider } from '$climate/provider';
import { fixtureFetcher } from '$dossier/fetch';
import { readRecords, withCoarse, type ClimateProvider } from '$dossier/build';
import { isCoarse, coarseRegionOf, areaRadiusM, coarseSentence, COARSE_REGIONS, COARSE_KM } from '$core/coarse';
import { coldFloor } from '$core/sheet';
import type { Climate } from '$dossier/schema';

const h = makeHeader({ built: '2026-11-22T00:00:00Z' });
/** A Namaqualand month set: `w` warms every month by that many degrees, `r` scales the rain. */
function cell(w = 0, r = 1, elev = 400): Record<string, number> {
  const v: Record<string, number> = { elev };
  for (let m = 1; m <= 12; m++) {
    const s = Math.cos(((m - 1) / 12) * 2 * Math.PI); // warm in January
    const mm = String(m).padStart(2, '0');
    v[`tasmax_${mm}`] = 26 + 6 * s + w;
    v[`tasmin_${mm}`] = 9 + 5 * s + w;
    v[`tas_${mm}`] = 17 + 5.5 * s + w;
    v[`pr_${mm}`] = (m >= 5 && m <= 8 ? 25 : 5) * r;
    v[`rsds_${mm}`] = 20 + 8 * s;
  }
  return v;
}
/** Every grid cell within 0.3° of each place filled, `sea` places' surroundings left as sea. */
function grid(places: Array<{ lat: number; lon: number; w: number; sea?: boolean }>) {
  const cells = new Map<string, ArrayBuffer>();
  for (const p of places) for (let la = p.lat - 0.3; la <= p.lat + 0.3; la += h.cell) for (let lo = p.lon - 0.3; lo <= p.lon + 0.3; lo += h.cell) {
    const c = cellOf(h, la, lo);
    cells.set(c.id, encodeCell(h, p.sea ? { elev: -200 } : cell(p.w)));
  }
  return memoryGridSource(h, cells);
}
const NAMAQUA = [{ lat: -29.6, lon: 17.9, w: 0 }, { lat: -30.4, lon: 18.2, w: 1 }, { lat: -28.9, lon: 17.4, w: 2 }];

describe('r108a the rule', () => {
  it('a record is coarse over 10 km and at most 30 km, by its stated uncertainty', () => {
    expect(isCoarse(10_000)).toBe(false);
    expect(isCoarse(10_001)).toBe(true);
    expect(isCoarse(27_800)).toBe(true);
    expect(isCoarse(30_000)).toBe(true);
    expect(isCoarse(30_001)).toBe(false);
    expect(isCoarse(undefined)).toBe(false);
  });
  it('only in the regions the proof read', () => {
    expect(coarseRegionOf(-29.6, 17.9)?.id).toBe('southern-africa');
    expect(coarseRegionOf(1.5, 110.3)?.id).toBe('south-east-asia');
    expect(coarseRegionOf(-24.9, -70.5)).toBeNull(); // the Atacama: not proved
    expect(coarseRegionOf(14.6, 121)).toBeNull(); // Luzon: outside the box
  });
  it('the area is the half-diagonal of iNaturalist\'s 0.2° cell: about 15.7 km at the equator, less toward the poles', () => {
    expect(Math.round(areaRadiusM(0) / 100) / 10).toBe(15.7);
    expect(areaRadiusM(-30)).toBeLessThan(areaRadiusM(0));
  });
});

describe('r108a readRecords: a coarse record is kept apart, in a proved region only', () => {
  const box = [{ s: -35, w: 11, n: -17, e: 33 }, { s: -30, w: -75, n: -20, e: -65 }];
  const rec = (lat: number, lon: number, unc: number) => ({ decimalLatitude: lat, decimalLongitude: lon, coordinateUncertaintyInMeters: unc, basisOfRecord: 'HUMAN_OBSERVATION', license: 'CC_BY_4_0', datasetKey: 'd' });
  it('placed to 5 km for the climate, to 20 km in southern Africa coarse, to 20 km in the Atacama neither, to 50 km neither', () => {
    const r = readRecords([rec(-29.6, 17.9, 5_000), rec(-30.4, 18.2, 20_000), rec(-24.9, -70.5, 20_000), rec(-28.9, 17.4, 50_000)] as never, box as never, true);
    expect(r.forClimate.map((p) => [p[0], p[1]])).toEqual([[-29.6, 17.9]]);
    expect(r.forCoarse.map((p) => [p[0], p[1]])).toEqual([[-30.4, 18.2]]);
  });
});

describe('r108a the provider\'s coarse reading', () => {
  const provider = (g = grid(NAMAQUA)) => makeClimateProvider({ grid: g, fetcher: fixtureFetcher({}) });
  it('three places: the median of the areas\' months, the rain the median of their years, no extremes, said why', async () => {
    const c = await provider().coarse!(NAMAQUA.map((p) => [p.lat, p.lon, 'strict'] as const));
    expect(c.status).toBe('ok');
    if (c.status !== 'ok') return;
    expect(c.cells).toBe(3);
    expect(c.records).toBe(3);
    expect(c.coarse).toEqual({ km: COARSE_KM, areas: 3, region: 'southern-africa' });
    // The middle place (w 1) is the median: January's high 26 + 6 + 1.
    expect(c.months[0].tmax).toBeCloseTo(33, 0);
    expect(c.p10[0].tmax).toBeLessThan(c.p90[0].tmax);
    expect(c.annualRain?.p50).toBeGreaterThan(0);
    expect(c.extremes).toBeUndefined();
    expect(c.extremesStatus).toBe('coarse');
    expect(c.src.extremes).toMatch(/^NASA POWER not derived: the records are placed only to within 30 km/);
    expect(c.src.envelope).toContain('placed only to within 30 km');
    // The typical place is said to 0.1°, never a record's own place.
    expect(Number.isInteger(c.at.lat * 10 + 1e-9) || Math.abs(c.at.lat * 10 - Math.round(c.at.lat * 10)) < 1e-9).toBe(true);
  });
  it('two places, or a place with no land around it, give no climate, with the reason', async () => {
    const two = await provider().coarse!(NAMAQUA.slice(0, 2).map((p) => [p.lat, p.lon] as const));
    expect(two).toMatchObject({ status: 'none' });
    expect(two.status === 'none' && two.detail).toBe('the in-range records placed only to within 30 km give 2 areas with land; three are needed');
    const sea = await provider(grid([...NAMAQUA.slice(0, 2), { lat: -31.5, lon: 16.5, w: 0, sea: true }])).coarse!([...NAMAQUA.slice(0, 2), { lat: -31.5, lon: 16.5 }].map((p) => [p.lat, p.lon] as const));
    expect(sea.status === 'none' && sea.detail).toContain('give 2 areas with land (1 more with none); three are needed');
  });
  it('one area a three-decimal position; many records there count as records, not areas', async () => {
    const pts = [...NAMAQUA, NAMAQUA[0], NAMAQUA[0]].map((p) => [p.lat, p.lon] as const);
    const c = await provider().coarse!(pts);
    expect(c.status === 'ok' && [c.cells, c.records]).toEqual([3, 5]);
  });
  it('an area is the land around the record: a cell of the area that is sea is left out of its mean', async () => {
    const centre = NAMAQUA[0];
    // The record's own cell made sea: the place still reads from the land within reach.
    const own = cellOf(h, centre.lat, centre.lon);
    const cells = new Map<string, ArrayBuffer>();
    for (let la = centre.lat - 0.3; la <= centre.lat + 0.3; la += h.cell) for (let lo = centre.lon - 0.3; lo <= centre.lon + 0.3; lo += h.cell) { const c = cellOf(h, la, lo); cells.set(c.id, encodeCell(h, c.id === own.id ? { elev: -10 } : cell(0))); }
    const c = await makeClimateProvider({ grid: memoryGridSource(h, new Map([...cells])), fetcher: fixtureFetcher({}) }).coarse!([[centre.lat, centre.lon], [centre.lat + 0.11, centre.lon], [centre.lat - 0.11, centre.lon]]);
    expect(c.status).toBe('ok');
  });
});

describe('r108a withCoarse: only where the 10 km records give none, never mixed', () => {
  const ok = { status: 'ok' } as unknown as Climate;
  const fake = (answer: Climate): ClimateProvider => ({ envelope: async () => ok, at: async () => ok, coarse: async () => answer });
  const pts = [[-29.6, 17.9, 'strict']] as const;
  it('a climate already read is not touched', async () => {
    expect(await withCoarse(ok, pts, { climate: fake({ status: 'none', detail: 'x' }) })).toBe(ok);
  });
  it('no climate, coarse records: the coarse climate', async () => {
    const coarse = { status: 'ok', coarse: { km: 30, areas: 3, region: 'southern-africa' } } as unknown as Climate;
    expect(await withCoarse({ status: 'none', detail: 'no record placed to within 10 km' }, pts, { climate: fake(coarse) })).toMatchObject({ coarse: { km: 30 } });
  });
  it('no climate either way: both reasons said', async () => {
    const c = await withCoarse({ status: 'none', detail: 'only 1 distinct land cell of the climate grid holds an in-range record placed to within 10 km; three are needed for an envelope' }, pts, { climate: fake({ status: 'none', detail: 'the in-range records placed only to within 30 km give 2 areas with land; three are needed' }) });
    expect(c.status === 'none' && c.detail).toBe('only 1 distinct land cell of the climate grid holds an in-range record placed to within 10 km; three are needed for an envelope; and the in-range records placed only to within 30 km give 2 areas with land; three are needed');
  });
  it('no coarse records, or a provider with no coarse reading: unchanged', async () => {
    const none: Climate = { status: 'none', detail: 'x' };
    expect(await withCoarse(none, [], { climate: fake(ok) })).toBe(none);
    expect(await withCoarse(none, pts, { climate: { envelope: async () => ok, at: async () => ok } })).toBe(none);
  });
});

describe('r108a the words: not derived, never none (rule 2), and /about/how true of the code (rule 5)', () => {
  const months = Array.from({ length: 12 }, (_, i) => ({ tmax: 30, tmin: 8 + (i === 6 ? -3 : 0), tmean: 18, precipMm: 10 }));
  it('the cold floor of a coarse climate is "not derived", with why', () => {
    const f = coldFloor(months as never, null, null, 'metric', 'coarse');
    expect(f!.s).toMatch(/^Cold floor: not derived\. The nearest figure is 5\.0 °C, the coldest month's mean nightly low/);
    expect(f!.s).toContain('this climate rests on records placed only to within 30 km');
    expect(f!.plain.lead).toContain('the records are placed only to within 30 km, so no floor is derived');
    expect(f!.s).not.toMatch(/none on file|no daily extremes/i);
  });
  it('the notice says what the figures rest on and what is left out', () => {
    const s = coarseSentence({ km: 30, areas: 4 }, 9);
    expect(s).toContain('read from 9 records in 4 areas, each placed by its publisher only to within 30 km');
    expect(s).toContain('no cold floor, record low or hardiness band is derived');
  });
  it('/about/how gives the regions as the code holds them, and /about/formats the field', () => {
    const how = readFileSync('src/routes/about/how/+page.svelte', 'utf8');
    expect(how).toContain('<h2 id="coarse">From records placed only to within 30 km</h2>');
    const [sa, sea] = COARSE_REGIONS;
    expect(how).toContain(`southern Africa (${-sa.n}° to ${-sa.s}° S, ${sa.w}° to ${sa.e}° E)`);
    expect(how).toContain(`South-East Asia (${-sea.s}° S to ${sea.n}° N, ${sea.w}° to ${sea.e}° E)`);
    expect(readFileSync('src/routes/about/formats/+page.svelte', 'utf8')).toContain('<code>climate.coarse</code>');
  });
});

describe('r108a the strip says "placed to 30 km" and counts places', () => {
  it('the mark, linked to the notice, in place of the few-records mark; the line under the figures', async () => {
    const { render } = await import('svelte/server');
    const { default: HabitatLine } = await import('$lib/ui/ref/HabitatLine.svelte');
    const months = Array.from({ length: 12 }, () => ({ tmax: 30, tmin: 8, tmean: 18, precipMm: 10, dli: 40 }));
    const body = render(HabitatLine, { props: { months, units: 'metric', few: { records: 9, cells: 4 }, coarse: { km: 30 }, records: 9, cells: 4 } }).body;
    expect(body).toMatch(/<a class="few[^"]*" id="coarse-line" href="#coarse-records">placed to 30 km<\/a>/);
    expect(body).not.toContain('id="few-records-line"');
    expect(body.replace(/<!--[^]*?-->/g, '')).toContain('from 9 records placed only to within 30 km, in 4 areas');
    expect(body).toContain('href="/about/how#coarse"');
  });
});
