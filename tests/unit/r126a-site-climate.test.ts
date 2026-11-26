/**
 * Round 126 (SPECIES 20, the lens's Outdoors view): the site climate's tiles, read on the device.
 *
 * - The square is the site's south-west corner in whole degrees, across the antimeridian and at the poles' edges.
 * - The cell within the square: row 0 the northern band, column 0 the western, as scripts/site-tiles.ts writes them.
 * - A cell's twelve months at the grid's scales (°C ×10, mm); a cell of sea is null.
 * - The route answers a bad square 400 and a square it does not hold 404 ("no land climate").
 *
 * On b1760eb: FAILED (no module, no route).
 */
import { describe, it, expect } from 'vitest';
import { squareOf, cellIn, monthsOf, NODATA } from '../../src/lib/climate/site-climate';

describe('r126a the square and the cell', () => {
  it('Kew (51.48 N, 0.29 W) is in the square 51,-1, its cell row 10, column 14', () => {
    expect(squareOf(51.48, -0.29)).toEqual({ lat: 51, lon: -1 });
    expect(cellIn(51.48, -0.29)).toEqual({ row: 10, col: 14 });
  });
  it('the southern and western hemispheres, the antimeridian, a whole degree', () => {
    expect(squareOf(-33.9, 18.4)).toEqual({ lat: -34, lon: 18 });
    expect(squareOf(10, 181)).toEqual({ lat: 10, lon: -179 });
    expect(squareOf(40, 15)).toEqual({ lat: 40, lon: 15 });
    expect(cellIn(40, 15)).toEqual({ row: 19, col: 0 });
  });
});

describe('r126a a cell\'s months', () => {
  const tile = new Uint8Array(20 * 20 * 36 * 2);
  const dv = new DataView(tile.buffer);
  const put = (row: number, col: number, k: number, v: number) => dv.setInt16(((row * 20 + col) * 36 + k) * 2, v, true);
  for (let m = 0; m < 12; m++) { put(10, 14, m, 71 + m); put(10, 14, 12 + m, 20 + m); put(10, 14, 24 + m, 61); }
  for (let k = 0; k < 36; k++) put(0, 0, k, NODATA);
  it('reads the scales the grid stores', () => {
    const ms = monthsOf(tile, 10, 14)!;
    expect(ms).toHaveLength(12);
    expect(ms[0]).toEqual({ tmax: 7.1, tmin: 2, precipMm: 61 });
    expect(ms[11].tmax).toBeCloseTo(8.2);
  });
  it('a cell of sea is null', () => expect(monthsOf(tile, 0, 0)).toBeNull());
});

describe('r126a the route', () => {
  it('a square not in whole degrees is refused; one the bucket does not hold is no land climate', async () => {
    const { GET } = await import('../../src/routes/api/site-climate/+server');
    const call = (sq: string) => (GET as unknown as (e: unknown) => Promise<Response>)({ url: new URL(`http://x/api/site-climate?sq=${sq}`), platform: { env: { STORE: { get: async () => null } } }, fetch });
    expect((await call('51.5,-1')).status).toBe(400);
    expect((await call('95,0')).status).toBe(400);
    const sea = await call('0,-140');
    expect(sea.status).toBe(404);
    expect(await sea.text()).toBe('no land climate for this square');
  });
});

describe('r126a the Outdoors lines', async () => {
  const { outdoorsLines, monthRunsText, CLOSING } = await import('../../src/lib/climate/lens-outdoors');
  it('months as runs across the year\'s end', () => {
    expect(monthRunsText([10, 11, 0, 1, 2, 3])).toBe('November to April');
    expect(monthRunsText([5])).toBe('June');
    expect(monthRunsText([2, 3, 9])).toBe('March and April; October');
  });
  const site = Array.from({ length: 12 }, (_, m) => ({ tmax: 10, tmin: [0, 1, 3, 5, 8, 11, 13, 13, 10, 7, 3, 1][m], precipMm: 55 }));
  const habitat = Array.from({ length: 12 }, () => ({ tmin: 12, precipMm: 4 }));
  const lines = outdoorsLines({ site, siteLat: 51.5, habitat, habitatLat: -25, floorC: 6.5, temp: (c) => `${c} °C`, mm: (n) => `${n} mm` });
  it('names two figures in every line and predicts nothing', () => {
    expect(lines.map((l) => l.k)).toEqual(['floor', 'rain', 'day']);
    expect(lines[0].text).toBe('6 months: your average night is below its cold floor (6.5 °C): November to April.');
    expect(lines[1].text).toBe("Your rain a year: 660 mm; its habitat's: 48 mm. Your driest month (55 mm) is wetter than its wettest (4 mm).");
    for (const l of lines) expect(l.text).not.toMatch(/\b(will|needs?|wants?|tolerat|should|survive)/i);
    expect(CLOSING).toBe('It compares. It does not say what the plant will do.');
  });
  it('no floor on file: that line is not drawn', () => {
    expect(outdoorsLines({ site, siteLat: 51.5, habitat, habitatLat: -25, floorC: null, temp: String, mm: String }).map((l) => l.k)).toEqual(['rain', 'day']);
  });
});
