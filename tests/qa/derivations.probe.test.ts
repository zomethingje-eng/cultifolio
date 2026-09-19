import { describe, it, expect } from 'vitest';
import { parseName, slugify } from '$core/names';
import { licenceTag } from '$core/licence';
import { broadRegion } from '$core/regions';
import { habitatCluster, habitatCentre, inBox } from '$core/geo';
import { growingYear, cultivationSheet } from '$core/sheet';
import { cellOf, makeHeader, encodeCell } from '$lib/climate/grid';
import { makeClimateProvider } from '$lib/climate/provider';
import { memoryGridSource } from '$lib/climate/source';
import { parseOccRow, occHeader, WcvpIndex, parseWcvpDist } from '$dossier/bulk';
import { parseDossier } from '$dossier/schema';
import { tdwgCode } from '$dossier/tdwg';
import { buildDossier } from '$dossier/build';
import { fixtureFetcher } from '$dossier/fetch';
import { copiapoa } from '../../fixtures/upstream';
import { buildBundle } from '../../scripts/export-corpus-lib';
import { GBIF } from '$dossier/sources/gbif';

const opts = (table: Record<string, unknown>) => ({ fetcher: fixtureFetcher(table), builtBy: 'node' as const, now: () => new Date('2026-09-14T12:00:00Z') });

describe('regions: Pacific and antimeridian units', () => {
  it('Fiji, Hawaii, the Society Islands, the Aleutians and Magadan land in the right broad region', () => {
    expect(broadRegion('Fiji')).toBe('Australia & Oceania');
    expect(broadRegion('Hawaii')).not.toBe('Mexico & Central America');
    expect(broadRegion('Society Is.')).not.toBe('Andes & Chile');
    expect(broadRegion('Aleutian Is.')).not.toBe('Europe');
    expect(broadRegion('Magadan')).not.toBe('Europe');
    expect(broadRegion('Antarctica')).not.toBe('Southern Africa');
  });
});

describe('geo: antimeridian and restricted-record centre', () => {
  it('a Fijian population straddling 180° is one cluster with a longitude near ±180', () => {
    const pts: Array<[number, number]> = [
      [-17.5, 179.9],
      [-17.6, 179.8],
      [-17.4, 179.95],
      [-17.5, -179.9],
      [-17.6, -179.85],
      [-17.55, -179.95]
    ];
    const c = habitatCluster(pts)!;
    expect(c.n).toBe(6);
    expect(Math.abs(c.lon)).toBeGreaterThan(170);
  });
  it('a record at lon 180 is inside a box that ends at 180', () => {
    expect(inBox(-75, 180, { s: -90, w: -180, n: -60, e: 180 })).toBe(true);
    expect(inBox(-75, -180, { s: -90, w: -180, n: -60, e: 180 })).toBe(true);
  });
  it('cell-centre snap never lands on a restricted record', () => {
    // Three CC BY-NC records at tenth-degree precision (a common rounding); no open record.
    const nc: Array<[number, number]> = [
      [-24.9, -70.5],
      [-24.8, -70.4],
      [-25.0, -70.6]
    ];
    const c = habitatCluster(nc)!;
    const at = habitatCentre(c, []);
    expect(at.snapped).toBe('cell-centre');
    const hit = nc.some((p) => p[0] === at.lat && p[1] === at.lon);
    expect(hit).toBe(false);
  });
});

describe('build: coordinate dedupe versus licence', () => {
  it('an open record sharing a 3-decimal coordinate with an earlier restricted one is not lost', async () => {
    const fx = copiapoa();
    const key = 5384013;
    const NC = 'http://creativecommons.org/licenses/by-nc/4.0/legalcode';
    const BY = 'http://creativecommons.org/licenses/by/4.0/legalcode';
    const rec = (k: number, lat: number, lon: number, lic: string) => ({ key: k, decimalLatitude: lat, decimalLongitude: lon, license: lic, basisOfRecord: 'HUMAN_OBSERVATION', datasetKey: 'ds-' + lic.length });
    fx[`re:${GBIF.replace(/\./g, '\\.')}/occurrence/search\\?taxonKey=${key}&hasCoordinate`] = {
      count: 6,
      endOfRecords: true,
      results: [rec(1, -24.9, -70.4, NC), rec(2, -24.9, -70.4, BY), rec(3, -24.95, -70.45, NC), rec(4, -24.85, -70.35, NC)]
    };
    const r = await buildDossier('Copiapoa cinerea', opts(fx));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dossier.occurrences.nOpenInRange).toBe(1);
    expect(r.dossier.centroid?.how).toMatch(/openly licensed record nearest/);
  });
});

describe('sheet: even year wording', () => {
  const mk = (tmean: number[], pr: number[]) => tmean.map((t, i) => ({ tmax: t + 5, tmin: t - 5, tmean: t, precipMm: pr[i], dli: 30, rh: 70 }));
  it('a sharp rainy season under a flat temperature curve is not described as no sharp season', () => {
    // Equatorial highland: 3 months carry 80% of the rain; tmean moves 1.5 °C.
    const tmean = [17, 17.5, 18, 18.2, 18, 17.5, 17, 16.8, 17, 17.5, 18, 17.5];
    const pr = [5, 5, 200, 250, 200, 10, 10, 10, 20, 40, 40, 20];
    const y = growingYear(mk(tmean, pr), 0)!;
    expect(y.grow).toBe('even');
    expect(y.growMonths).toEqual([3, 4, 5]);
    const { rows } = cultivationSheet({ scientific: 'Testus aequatorialis', family: 'Cactaceae', months: mk(tmean, pr), lat: 0 });
    const yr = rows.find((r) => r.k === 'Its year')!;
    expect(yr.s).not.toMatch(/no sharp season \(3 months carry 70%/);
    expect(yr.short).not.toMatch(/No sharp season in the habitat rainfall/);
  });
  it('the even-year card names the hemisphere of the cooler months it prints', () => {
    // Southern hemisphere, rain spread evenly, temperature moves 10 °C: the card prints the cooler months.
    const tmean = [22, 22, 20, 17, 14, 12, 12, 13, 15, 18, 20, 21];
    const pr = [50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50];
    const { rows } = cultivationSheet({ scientific: 'Testus australis', family: 'Cactaceae', months: mk(tmean, pr), lat: -30, readerLat: 50 });
    const yr = rows.find((r) => r.k === 'Its year')!;
    expect(yr.s).toMatch(/cooler months are April to September/); // habitat (southern) time
    // The reader is in the north: the card should say whose hemisphere these months are, or shift them (how#year).
    expect(yr.s).toMatch(/hemisphere/);
  });
});

describe('names', () => {
  it('cv. form', () => {
    const p = parseName('Echeveria cv. Blue Curls');
    expect(p.cultivar).toBe('Blue Curls');
    expect(p.scientific).toBe('Echeveria');
  });
  it('nothogenus without a space', () => {
    const p = parseName("xGraptoveria 'Fred Ives'");
    expect(p.genus).toBe('Graptoveria');
  });
  it('an intergeneric cross with a bare genus on the right does not invent a species', () => {
    const p = parseName('Aloe vera × Gasteria');
    expect(p.parentage).not.toMatch(/Aloe gasteria/);
  });
  it('slugs of a nothospecies and its homonym species collide', () => {
    expect(slugify('Echeveria × imbricata')).not.toBe(slugify('Echeveria imbricata'));
  });
});

describe('licence strings', () => {
  it('Commons long-form share-alike is by-sa, not by', () => {
    expect(licenceTag('Creative Commons Attribution-Share Alike 3.0 Unported')).toBe('by-sa');
  });
  it('the common forms', () => {
    expect(licenceTag('CC_BY_NC_4_0')).toBe('nc');
    expect(licenceTag('CC0_1_0')).toBe('cc0');
    expect(licenceTag('CC_BY_4_0')).toBe('by');
    expect(licenceTag('http://creativecommons.org/publicdomain/zero/1.0/legalcode')).toBe('cc0');
    expect(licenceTag('cc-by-nc-sa')).toBe('nc');
    expect(licenceTag('CC BY-NC-ND 2.0')).toBe('nc');
    expect(licenceTag('UNSPECIFIED')).toBe('other');
    expect(licenceTag('Copyrighted free use')).toBe('other');
  });
});

describe('tdwg', () => {
  it('codes with prefixes', () => {
    expect(tdwgCode('TDWG:FIJ')).toBe('FIJ');
    expect(tdwgCode('WGSRPD:L3:FIJ')).toBe('FIJ');
    expect(tdwgCode(undefined, 'Cook Islands')).toBe('COO');
    expect(tdwgCode(undefined, 'Cook Is.')).toBe('COO');
  });
});

describe('grid', () => {
  it('cell edges', () => {
    const h = makeHeader();
    expect(cellOf(h, 90, -180).row).toBe(0);
    expect(cellOf(h, -90, 180).row).toBe(3599);
    expect(cellOf(h, 89.95, -180).row).toBe(1); // a point on a grid line reads the cell to its north (float error); low
    expect(cellOf(h, 0, 179.99).col).toBe(7199);
    expect(cellOf(h, 0, 180).col).toBe(0);
  });
  it('a coastal cell with negative ETOPO elevation is not used for a lapse correction', async () => {
    const h = makeHeader();
    const vals: Record<string, number> = { elev: -600 };
    for (const v of ['tasmax', 'tasmin', 'tas', 'pr', 'rsds', 'hurs']) for (let m = 1; m <= 12; m++) vals[`${v}_${String(m).padStart(2, '0')}`] = v === 'pr' ? 5 : v === 'rsds' ? 20 : v === 'hurs' ? 70 : 15;
    const buf = encodeCell(h, vals);
    const cells = new Map([[cellOf(h, -24.9, -70.5).id, buf]]);
    const dates: string[] = [], tmin: number[] = [], tmax: number[] = [];
    for (let y = 1981; y <= 2024; y++) for (let d = 0; d < 365; d++) {
      const dt = new Date(Date.UTC(y, 0, 1 + d));
      dates.push(dt.toISOString().slice(0, 10)); tmin.push(8); tmax.push(22);
    }
    const p = makeClimateProvider({ grid: memoryGridSource(h, cells), fetcher: async () => ({ status: 'ok', data: {} }) as never, powerCache: { get: async () => ({ cell: 'x', elevationM: 300, series: { dates, tmin, tmax, precip: [] } }), set: async () => {} } });
    const c = await p.at(-24.9, -70.5);
    expect(c.status).toBe('ok');
    if (c.status !== 'ok') return;
    // deltaM = -600 - 300 = -900 m → +5.85 °C added to every extreme from bathymetry.
    expect(c.extremes?.lapseAppliedM ?? 0).toBeGreaterThanOrEqual(0);
  });
});

describe('bulk parsing', () => {
  it('whitespace-only coordinate is rejected', () => {
    const h = occHeader('gbifID\tdecimalLatitude\tdecimalLongitude\tyear\tcountryCode\tbasisOfRecord\tlicense\tdatasetKey\testablishmentMeans\tspeciesKey\ttaxonKey');
    const o = parseOccRow(h, '1\t \t-70.4\t\t\t\t\t\t\t5\t5');
    expect(o).toBeNull();
  });
  it('a WCVP region where the plant is extinct is not offered as plain NATIVE', () => {
    const idx = new WcvpIndex();
    idx.addName({ id: '1', name: 'Testus extinctus', status: 'Accepted', acceptedId: '1', rank: 'Species' }, () => true);
    idx.addDist(parseWcvpDist(['plant_name_id', 'area_code_l3', 'area', 'introduced', 'extinct', 'location_doubtful'], '1|CLN|Chile North|0|1|0'));
    const rows = idx.distributions('Testus extinctus')!;
    // build.ts:123-124 tests /introduced|.../ then /native/: 'NATIVE (extinct)' becomes a native region with a box.
    expect(rows[0].establishmentMeans).not.toMatch(/native/i);
  });
});

describe('schema gaps', () => {
  it('rejects a climate with five months', async () => {
    const r = await buildDossier('Copiapoa cinerea', opts(copiapoa()));
    if (!r.ok) throw new Error();
    const d = JSON.parse(JSON.stringify(r.dossier));
    d.climate = { status: 'ok', cell: 'x', months: [{ tmax: 1, tmin: 1, tmean: 1, precipMm: 1 }], src: { normals: 'x' } };
    expect(() => parseDossier(d)).toThrow();
  });
  it('rejects a restricted record in occurrences.open', async () => {
    const r = await buildDossier('Copiapoa cinerea', opts(copiapoa()));
    if (!r.ok) throw new Error();
    const d = JSON.parse(JSON.stringify(r.dossier));
    d.occurrences.open.push([-24.9, -70.4, null, null, null, 'nc']);
    expect(() => parseDossier(d)).toThrow();
  });
  it('rejects a centroid off the globe', async () => {
    const r = await buildDossier('Copiapoa cinerea', opts(copiapoa()));
    if (!r.ok) throw new Error();
    const d = JSON.parse(JSON.stringify(r.dossier));
    d.centroid.lat = 200;
    expect(() => parseDossier(d)).toThrow();
  });
});

describe('export', () => {
  it('a carriage return in a cell is quoted', async () => {
    const r = await buildDossier('Copiapoa cinerea', opts(copiapoa()));
    if (!r.ok) throw new Error();
    const d = JSON.parse(JSON.stringify(r.dossier));
    d.name.authorship = 'Britton\r& Rose';
    const b = buildBundle({ index: [{ key: d.key, slug: d.slug, name: d.name.scientific, family: 'Cactaceae', origin: [], photos: 0, open: 0, climate: 'none' }], dossiers: new Map([[d.key, d]]) }, { version: '1', homepage: 'h', repo: 'r' });
    const line = b.files['species.csv'].split('\n')[1];
    expect(line).toMatch(/"Britton\r& Rose"/);
  });
});
