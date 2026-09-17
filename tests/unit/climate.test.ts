import { describe, it, expect } from 'vitest';
import { makeHeader, cellOf, byteRange, encodeCell, decodeCell, NODATA } from '$climate/grid';
import { memoryGridSource } from '$climate/source';
import { makeClimateProvider } from '$climate/provider';
import { powerCell, powerUrl } from '$climate/power';
import { fixtureFetcher } from '$dossier/fetch';

const h = makeHeader({ built: '2026-09-14T00:00:00Z' });

function atacamaCell(): Record<string, number> {
  // A plausible coastal Atacama climatology: mild, dry, foggy.
  const v: Record<string, number> = { elev: 620 };
  for (let m = 1; m <= 12; m++) {
    const s = Math.cos(((m - 1) / 12) * 2 * Math.PI); // warm in Jan (southern summer)
    const mm = String(m).padStart(2, '0');
    v[`tasmax_${mm}`] = 22 + 4 * s;
    v[`tasmin_${mm}`] = 12 + 3 * s;
    v[`tas_${mm}`] = 17 + 3.5 * s;
    v[`pr_${mm}`] = m > 5 && m < 9 ? 3 : 0.4;
    v[`rsds_${mm}`] = 18 + 8 * s;
    v[`hurs_${mm}`] = 78 - 6 * s;
    v[`vpd_${mm}`] = 500 + 250 * s;
    v[`sfcWind_${mm}`] = 3.2;
  }
  return v;
}

function powerFixture(lat: number, lon: number, elev: number) {
  const T2M_MAX: Record<string, number> = {},
    T2M_MIN: Record<string, number> = {},
    PRECTOTCORR: Record<string, number> = {};
  for (let y = 1981; y <= 2024; y++)
    for (let d = 1; d <= 365; d++) {
      const date = new Date(Date.UTC(y, 0, d));
      const k = date.toISOString().slice(0, 10).replace(/-/g, '');
      const s = Math.cos(((d - 15) / 365) * 2 * Math.PI);
      T2M_MAX[k] = 24 + 5 * s + ((y * 31 + d) % 7) - 3;
      T2M_MIN[k] = 11 + 4 * s + ((y * 17 + d) % 5) - 2;
      PRECTOTCORR[k] = 0;
    }
  T2M_MIN['19910704'] = -2.5; // one freak frost
  return { [powerUrl(lat, lon)]: { geometry: { coordinates: [lon, lat, elev] }, header: { fill_value: -999 }, properties: { parameter: { T2M_MAX, T2M_MIN, PRECTOTCORR } } } };
}

describe('climate grid', () => {
  it('maps coordinates to cells and byte ranges', () => {
    const c = cellOf(h, -24.877, -70.504);
    expect(c.row).toBe(Math.floor((90 + 24.877) / 0.05));
    expect(c.col).toBe(Math.floor((180 - 70.504) / 0.05));
    const r = byteRange(h, c.index);
    expect(r.length).toBe(h.layers.length * 2);
    expect(r.offset).toBe(c.index * r.length);
    expect(cellOf(h, 0, 180).col).toBe(0); // wraps
    expect(cellOf(h, 90, -180)).toMatchObject({ row: 0, col: 0 });
    expect(cellOf(h, -90, 179.99)).toMatchObject({ row: h.rows - 1, col: h.cols - 1 });
  });
  it('round-trips values through int16 quantisation and marks nodata', () => {
    const v = atacamaCell();
    const buf = encodeCell(h, v);
    const d = decodeCell(h, buf);
    expect(d.complete).toBe(true);
    expect(d.months[0].tasmax).toBeCloseTo(26, 1);
    expect(d.months[6].pr).toBeCloseTo(3, 0);
    expect(d.months[0].rsds).toBeCloseTo(26, 1);
    expect(d.elevationM).toBe(620);
    const sea = decodeCell(h, encodeCell(h, { elev: -3000 }));
    expect(sea.complete).toBe(false);
    expect(sea.months[0].tasmax).toBeUndefined();
    expect(new DataView(encodeCell(h, {})).getInt16(0, true)).toBe(NODATA);
  });
});

describe('climate provider', () => {
  const lat = -24.877,
    lon = -70.504;
  const pc = powerCell(lat, lon);
  it('snaps POWER requests to its 0.5° × 0.625° grid', () => {
    expect(pc.lat).toBe(-25);
    expect(pc.lon).toBe(-70.625);
  });
  it('returns normals, DLI and lapse-corrected extremes with provenance', async () => {
    const cells = new Map([[cellOf(h, lat, lon).id, encodeCell(h, atacamaCell())]]);
    const provider = makeClimateProvider({ grid: memoryGridSource(h, cells), fetcher: fixtureFetcher(powerFixture(pc.lat, pc.lon, 120)) });
    const c = await provider.at(lat, lon);
    expect(c.status).toBe('ok');
    if (c.status !== 'ok') return;
    expect(c.months).toHaveLength(12);
    expect(c.months[0].tmax).toBeCloseTo(26, 1);
    expect(c.months[0].dli).toBeCloseTo(26 * 2.07, 0);
    expect(c.months[0].vpdKpa).toBeCloseTo(0.75, 2);
    expect(c.extremes?.years).toBe(44);
    expect(c.extremes?.lapseAppliedM).toBe(500); // 620 m cell vs POWER's 120 m
    // freak frost of -2.5 at POWER elevation becomes -2.5 - 3.25 at the cell
    expect(c.extremes?.minAbs).toBeCloseTo(-5.75, 0);
    expect(c.src.normals).toContain('CHELSA');
    expect(c.src.extremes).toContain('lapse-corrected +500 m');
    expect(c.src.elevation).toContain('620 m');
  });
  it('a sea cell is "none", a missing grid is "refused", and POWER refusing keeps the normals', async () => {
    const seaCells = new Map([[cellOf(h, lat, lon).id, encodeCell(h, { elev: -1500 })]]);
    const sea = await makeClimateProvider({ grid: memoryGridSource(h, seaCells), fetcher: fixtureFetcher({}) }).at(lat, lon);
    expect(sea.status).toBe('none');
    const broken = makeClimateProvider({ grid: { header: async () => h, cell: async () => { throw new Error('R2 down'); } }, fetcher: fixtureFetcher({}) });
    expect((await broken.at(lat, lon)).status).toBe('refused');
    const cells = new Map([[cellOf(h, lat, lon).id, encodeCell(h, atacamaCell())]]);
    const c = await makeClimateProvider({ grid: memoryGridSource(h, cells), fetcher: fixtureFetcher({}) }).at(lat, lon);
    expect(c.status).toBe('ok');
    if (c.status !== 'ok') return;
    expect(c.extremes).toBeUndefined();
    expect(c.src.extremes).toContain('did not answer');
  });
});
