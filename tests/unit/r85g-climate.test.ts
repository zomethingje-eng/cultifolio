/**
 * Round eighty-five, G: the climate at derive time and at read.
 *
 * - Decision 4 (A7): the extremes are set aside only when the gap passes 1.5 °C, the correction's own uncertainty; a page
 *   of today's corpus set aside on a smaller gap shows them again at read (step 1), its record saying they were used.
 * - D8: a species with records on both sides of the equator has its envelope and its typical cell from one side, however
 *   few cells the other side holds; Physalis viscosa's spot was 20.8° N under months whose coldest is July.
 * - A23: the envelope counts its cells by why their best record is in range, and names each cell off the shapes.
 *
 * FAILS on r85base: Cedrus deodara's and Aloe vera's live extremes stay set aside (gaps of 0.7 and 1.2 °C), one southern
 * cell among five northern is read into the median (no `hemispheres`), and the envelope has no `admitted` or `edge`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { makeHeader, cellOf, encodeCell } from '$climate/grid';
import { memoryGridSource } from '$climate/source';
import { makeClimateProvider } from '$climate/provider';
import { fixtureFetcher } from '$dossier/fetch';
import { parseDossier, setAsideExtremes, type Dossier } from '$dossier/schema';
import { lapseSetAside, DISAGREE_MARGIN_C } from '$core/lapse';

const LIVE = '/tmp/claude-0/rev85r/D-s/dos';
const months = (cold: number) => Array.from({ length: 12 }, (_, i) => ({ tmax: 25, tmin: i === 0 ? cold : cold + 3, tmean: 18, precipMm: 40 }));

describe('decision 4: the extremes rule keeps its check, not on a hair', () => {
  it('the margin is 1.5 °C', () => expect(DISAGREE_MARGIN_C).toBe(1.5));
  it('a gap within it stands (Lonicera alberti, Cedrus deodara, Eulychnia acida +0.7; Tectaria +1.0; Aloe vera +1.2); beyond it, set aside', () => {
    for (const gap of [0.7, 1.0, 1.2, 1.5]) expect(lapseSetAside({ months: months(-1.8), extremes: { minAbs: -6, minP01: -1.8 + gap, lapseAppliedM: 311 } }), String(gap)).toBeNull();
    expect(lapseSetAside({ months: months(-1.8), extremes: { minAbs: -6, minP01: -1.8 + 1.6, lapseAppliedM: 311 } })).toMatch(/by more than the 1\.5 °C a correction can be out by/);
    expect(lapseSetAside({ months: months(-1.8), extremes: { minAbs: -6, minP01: 0, lapseAppliedM: 311 } }, 'us')).toMatch(/by more than the 2\.7 °F/);
  });
  for (const [key, name] of [['k382693', 'Cedrus deodara'], ['k298116', 'Aloe vera']] as const) {
    it.skipIf(!existsSync(`${LIVE}/${key}.json`))(`${name}'s live page (set aside on the walk) shows its extremes again at read, its record saying they were used`, () => {
      const raw = JSON.parse(readFileSync(`${LIVE}/${key}.json`, 'utf8'));
      expect(raw.climate.extremesStatus).toBe('lapse');
      expect(raw.upstream['climate.extremes'].status).toBe('none');
      const d = parseDossier(raw);
      if (d.climate.status !== 'ok') throw new Error(d.climate.status);
      expect(d.climate.extremesStatus).toBe('ok');
      expect(d.climate.extremes?.minAbs).toBe(raw.climate.extremesLapse.minAbs);
      expect(d.climate.extremesLapse).toBeUndefined();
      expect(d.upstream['climate.extremes'].status).toBe('ok');
      expect(d.upstream['climate.extremes'].detail).not.toContain('not used');
    });
  }
  it('a page set aside beyond the margin stays set aside at read', () => {
    const c = { status: 'ok', months: months(6.8), extremesLapse: { years: 44, minAbs: 4.3, minP01: 8.5, maxP99: 32, frostDaysPerYear: 0, lapseAppliedM: -432 }, extremesStatus: 'lapse', landFraction: 1 } as unknown as Dossier['climate'];
    expect(setAsideExtremes(c)).toBe(c);
  });
});

describe('D8: one side of the equator, however few cells the other holds', () => {
  const h = makeHeader({ built: '2026-09-14T00:00:00Z' });
  const cell = (cold: number) => {
    const v: Record<string, number> = { elev: 400 };
    for (let m = 1; m <= 12; m++) {
      const mm = String(m).padStart(2, '0');
      v[`tasmax_${mm}`] = 28; v[`tasmin_${mm}`] = cold + (m === 1 ? 0 : 4); v[`tas_${mm}`] = 20; v[`pr_${mm}`] = 30;
    }
    return v;
  };
  it('five cells at 20° N and one at 20° S: the southern one is left out, said, and never the typical cell', async () => {
    const cells = new Map<string, ArrayBuffer>();
    const points: Array<[number, number]> = [];
    [10, 11, 12, 13, 14].forEach((cold, k) => { const p: [number, number] = [20.8, -100 + k * 0.5]; cells.set(cellOf(h, ...p).id, encodeCell(h, cell(cold))); points.push(p); });
    // The southern cell's coldest night is the median of all six: before, it was the typical cell.
    const south: [number, number] = [-20.8, -60];
    cells.set(cellOf(h, ...south).id, encodeCell(h, cell(12)));
    points.push(south);
    const c = await makeClimateProvider({ grid: memoryGridSource(h, cells), fetcher: fixtureFetcher({}), noExtremes: true }).envelope(points);
    if (c.status !== 'ok') throw new Error(c.status);
    expect(c.hemispheres).toEqual({ north: 5, south: 1, used: 'north', equatorial: 0 });
    expect(c.cells).toBe(5);
    expect(c.at.lat).toBeGreaterThan(0);
  });
  it('two cells a side: no envelope from either, and the reason says why', async () => {
    const cells = new Map<string, ArrayBuffer>();
    const points: Array<[number, number]> = [[20.8, -100], [20.8, -99], [-20.8, -60], [-20.8, -59]];
    for (const p of points) cells.set(cellOf(h, ...p).id, encodeCell(h, cell(12)));
    const c = await makeClimateProvider({ grid: memoryGridSource(h, cells), fetcher: fixtureFetcher({}), noExtremes: true }).envelope(points);
    expect(c).toMatchObject({ status: 'none', detail: expect.stringMatching(/only 2 distinct land cells of the climate grid on the northern side of the equator.*the two sides' seasons are not combined/) });
  });
  it('A23: the cells counted by their best record\'s reason, and those off the shapes named', async () => {
    const cells = new Map<string, ArrayBuffer>();
    const pts: Array<[number, number, 'strict' | 'buffer' | 'coast' | 'island']> = [[20.8, -100, 'strict'], [20.8, -99.01, 'buffer'], [20.8, -99.02, 'strict'], [20.8, -98, 'island']];
    for (const p of pts) cells.set(cellOf(h, p[0], p[1]).id, encodeCell(h, cell(12)));
    const c = await makeClimateProvider({ grid: memoryGridSource(h, cells), fetcher: fixtureFetcher({}), noExtremes: true }).envelope(pts);
    if (c.status !== 'ok') throw new Error(c.status);
    expect(c.admitted).toEqual({ strict: 2, buffer: 0, coast: 0, island: 1 });
    expect(c.edge).toEqual([[20.775, -97.975, 'island']]); // the cell's middle, never the record's place
  });
});

describe("A5: a thin page says where its typical cell is", () => {
  it('the few-records notice names the place a build of this round gives', async () => {
    const { fewRecords, fewRecordsSentence } = await import('$core/few-records');
    const f = fewRecords({ status: 'ok', records: 10, cells: 6, place: 'São Paulo, Brazil' });
    expect(f).toEqual({ records: 10, cells: 6, place: 'São Paulo, Brazil' });
    expect(fewRecordsSentence(f!)).toMatch(/The typical spot, where the cold figures are read, is in São Paulo, Brazil \(Natural Earth's provinces\)\.$/); // round eighty-six: its source said
    // A page of today's corpus has no place: the notice as before.
    expect(fewRecordsSentence(fewRecords({ status: 'ok', records: 10, cells: 6 })!)).not.toContain('typical spot');
  });
});
