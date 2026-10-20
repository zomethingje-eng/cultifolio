/**
 * Round seventy-nine (D): GBIF's records in either form give the build the same sample and the same photographs. The
 * Darwin Core Archive (occurrence.txt with its camel-case names among some 250 columns, and multimedia.txt) and GBIF's SQL
 * download (one <key>.csv of the fifteen columns the build reads, under lower-case aliases, as GBIF writes it: empty for
 * null, a double as Java writes it, licences as GBIF's codes) beside the images' download (bulk/media.zip, a DWCA of the
 * records with images) are read by the real loader from real zips. The SQL values' forms are those of a public SQL
 * download GBIF made on 2026-10-19 (0035024-260928105237408). Each case FAILED on r79base unless marked a guard: the base
 * read `gbifid` and `specieskey` as no column (every SQL row dropped), had no media.zip, no parts, no `SQL_SELECT`, no key
 * check and took a page's thirty photographs in file order.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { occHeader, parseOccRow, OCC_TERMS, SQL_SELECT, MediaIndex, OccIndex, parseMediaRow } from '$dossier/bulk';
import { loadOccurrences, downloadShortOf } from '../../scripts/bulk-load';
import { writeZip } from '../../scripts/dev/zip-store';

type Rec = { id: number; lat: string; lon: string; unc?: string; prec?: string; year?: number; cc: string; basis: string; lic: string; ds: string; est?: string; deg?: string; species: number; taxon: number; accepted: number; images: Array<{ url: string; lic: string; who: string }> };
const INAT = '50c9509d-22c7-4a22-a47d-8c48425ef4a7';
const recs: Rec[] = [];
// Two species, one with a subspecies record and a synonym's record; observations with images (some NC, some open), sheets, living specimens.
for (let i = 0; i < 90; i++) {
  const sp = i % 3 === 0 ? 5384013 : 3084426;
  recs.push({
    id: 4_000_000_000 + i * 7919,
    lat: (-30 - i / 97).toFixed(1 + (i % 6)).replace(/0+$/, '').replace(/\.$/, '.0'),
    lon: (17 + i / 89).toFixed(2 + (i % 4)),
    unc: i % 4 ? String(10 * (i % 7) + 5) + '.0' : undefined,
    prec: i % 9 === 0 ? '1.0E-4' : undefined,
    year: i % 5 ? 1990 + (i % 30) : undefined,
    cc: i % 2 ? 'ZA' : 'NA',
    basis: i % 7 === 0 ? 'PRESERVED_SPECIMEN' : i % 11 === 0 ? 'LIVING_SPECIMEN' : 'HUMAN_OBSERVATION',
    lic: ['CC_BY_4_0', 'CC_BY_NC_4_0', 'CC0_1_0'][i % 3],
    ds: i % 2 ? INAT : '7a3679ef-5582-4aaa-81f0-8c2545cafc81',
    est: i % 13 === 0 ? 'Introduced' : undefined,
    deg: i % 17 === 0 ? 'Cultivated' : undefined,
    species: sp,
    taxon: i % 10 === 1 ? 7000001 : sp,
    accepted: i % 10 === 1 ? 7000001 : sp,
    images: i % 2 === 0 || i % 7 === 0 ? Array.from({ length: 1 + (i % 3) }, (_, j) => ({ url: `https://img.example.org/${i}/${j}.jpg`, lic: j === 1 ? 'http://creativecommons.org/licenses/by-nc/4.0/' : 'http://creativecommons.org/licenses/by/4.0/', who: `Observer ${i}` })) : []
  });
}

// The DWCA's interpreted occurrence.txt: GBIF's names, among others the build does not read, in GBIF's order.
const DWCA_COLS = ['gbifID', 'accessRights', 'license', 'rightsHolder', 'datasetKey', 'basisOfRecord', 'occurrenceID', 'recordedBy', 'establishmentMeans', 'degreeOfEstablishment', 'year', 'countryCode', 'locality', 'decimalLatitude', 'decimalLongitude', 'coordinateUncertaintyInMeters', 'coordinatePrecision', 'mediaType', 'issue', 'taxonKey', 'acceptedTaxonKey', 'speciesKey', 'species', 'verbatimScientificName'];
const dwcaCell = (r: Rec, c: string): string => ({ gbifID: String(r.id), license: r.lic, datasetKey: r.ds, basisOfRecord: r.basis, establishmentMeans: r.est ?? '', degreeOfEstablishment: r.deg ?? '', year: r.year ? String(r.year) : '', countryCode: r.cc, decimalLatitude: r.lat, decimalLongitude: r.lon, coordinateUncertaintyInMeters: r.unc ?? '', coordinatePrecision: r.prec ?? '', mediaType: r.images.length ? 'StillImage' : '', taxonKey: String(r.taxon), acceptedTaxonKey: String(r.accepted), speciesKey: String(r.species), recordedBy: 'Someone', locality: 'A place; with words', issue: 'COORDINATE_ROUNDED' } as Record<string, string>)[c] ?? '';
const MEDIA_COLS = ['gbifID', 'type', 'format', 'identifier', 'references', 'title', 'description', 'source', 'audience', 'created', 'creator', 'contributor', 'publisher', 'license', 'rightsHolder'];
const mediaLines = (rs: Rec[]) => rs.flatMap((r) => r.images.map((im) => MEDIA_COLS.map((c) => ({ gbifID: String(r.id), type: 'StillImage', format: 'image/jpeg', identifier: im.url, creator: im.who, license: im.lic, rightsHolder: im.who } as Record<string, string>)[c] ?? '').join('\t')));
const dwca = (rs: Rec[]) => ({ 'occurrence.txt': [DWCA_COLS.join('\t'), ...rs.map((r) => DWCA_COLS.map((c) => dwcaCell(r, c)).join('\t'))].join('\n') + '\n', 'multimedia.txt': [MEDIA_COLS.join('\t'), ...mediaLines(rs)].join('\n') + '\n', 'verbatim.txt': 'gbifID\n' });
// The SQL download: the aliases as the header, in the query's order, Unix lines.
const sqlCell = (r: Rec, alias: string): string => ({ gbifid: String(r.id), specieskey: String(r.species), taxonkey: String(r.taxon), acceptedtaxonkey: String(r.accepted), decimallatitude: r.lat, decimallongitude: r.lon, coordinateuncertaintyinmeters: r.unc ?? '', coordinateprecision: r.prec ?? '', year: r.year ? String(r.year) : '', countrycode: r.cc, basisofrecord: r.basis, license: r.lic, datasetkey: r.ds, establishmentmeans: r.est ?? '', degreeofestablishment: r.deg ?? '' } as Record<string, string>)[alias];
const sqlCsv = (rs: Rec[]) => [SQL_SELECT.map(([, a]) => a).join('\t'), ...rs.map((r) => SQL_SELECT.map(([, a]) => sqlCell(r, a)).join('\t'))].join('\n') + '\n';
const imaged = (rs: Rec[]) => rs.filter((r) => r.images.length && r.basis === 'HUMAN_OBSERVATION');

let root: string;
const dir = (name: string) => { const d = join(root, name); mkdirSync(d, { recursive: true }); return d; };
const shuffled = <T,>(a: T[]) => a.map((x, i) => [(i * 2654435761) % 1000003, x] as const).sort((p, q) => p[0] - q[0]).map(([, x]) => x);
const KEYS = [5384013, 3084426, 7000001];
const view = (l: Awaited<ReturnType<typeof loadOccurrences>>) => KEYS.map((k) => ({ k, rows: l!.occ.get(k)?.map(({ downloadDoi, downloadDay, ...r }) => r), photos: l!.media?.page(k) }));

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'r79d-forms-'));
  const a = dir('dwca');
  writeZip(join(a, 'occurrence.zip'), dwca(recs));
  writeFileSync(join(a, 'download.json'), JSON.stringify({ key: '0000001-261020000000000', doi: '10.15468/dl.aaaaaa', csv: 'occurrence.txt', media: 'multimedia.txt', fetched: '2026-10-20T10:00:00Z' }));
  const b = dir('sql');
  writeZip(join(b, 'occurrence.zip'), { '0000002-261020000000000.csv': sqlCsv(shuffled(recs)) });
  writeFileSync(join(b, 'download.json'), JSON.stringify({ key: '0000002-261020000000000', format: 'SQL_TSV_ZIP', doi: '10.15468/dl.bbbbbb', csv: '0000002-261020000000000.csv', fetched: '2026-10-20T11:00:00Z' }));
  // The images' download: a DWCA of the imaged human observations alone, in yet another order.
  writeZip(join(b, 'media.zip'), dwca(shuffled(imaged(recs)).reverse()));
  writeFileSync(join(b, 'media-download.json'), JSON.stringify({ key: '0000003-261020000000000', doi: '10.15468/dl.cccccc', csv: 'occurrence.txt', media: 'multimedia.txt', inat: true, fetched: '2026-10-20T11:30:00Z' }));
});

describe('the reader reads either header', () => {
  it('maps the SQL download\'s lower-case aliases to the DWCA\'s names, and an SQL row reads as the DWCA row of the same record', () => {
    const r = recs[6];
    const a = parseOccRow(occHeader(DWCA_COLS.join('\t')), DWCA_COLS.map((c) => dwcaCell(r, c)).join('\t'))!;
    const b = parseOccRow(occHeader(SQL_SELECT.map(([, x]) => x).join('\t')), SQL_SELECT.map(([, x]) => sqlCell(r, x)).join('\t'))!;
    const { mediaType, ...dwcaRow } = a;
    expect(mediaType).toBe('StillImage');
    expect(b).toEqual(dwcaRow);
    expect(b.speciesKey).toBe(5384013);
  });
  it('the SQL download selects every column the reader reads but mediaType, under its own name, and the three keys from the backbone', () => {
    expect(SQL_SELECT.map(([, a]) => a)).toEqual(OCC_TERMS.filter((t) => t !== 'mediaType').map((t) => t.toLowerCase()).sort((x, y) => SQL_SELECT.findIndex(([, a]) => a === x) - SQL_SELECT.findIndex(([, a]) => a === y)));
    expect(new Set(SQL_SELECT.map(([, a]) => a))).toEqual(new Set(OCC_TERMS.filter((t) => t !== 'mediaType').map((t) => t.toLowerCase())));
    for (const k of ['specieskey', 'taxonkey', 'acceptedtaxonkey']) expect(SQL_SELECT.find(([, a]) => a === k)![0]).toBe(`occurrence.gbif_classification.${k}`);
  });
});

describe('the same records in either form give the same sample and photographs', () => {
  it('a DWCA, and an SQL download with the images\' download beside it, read by the loader: every species\' rows and photographs equal', async () => {
    const A = await loadOccurrences(join(root, 'dwca'), 25, new Set(KEYS));
    const B = await loadOccurrences(join(root, 'sql'), 25, new Set(KEYS));
    expect(A!.format).toBe('dwca');
    expect(B!.format).toBe('sql');
    expect(A!.photos).toBe('multimedia.txt');
    expect(B!.photos).toBe('media.zip');
    const a = view(A), b = view(B);
    expect(a.every((x) => x.rows?.length)).toBe(true);
    // The subspecies' photographs are its species' page's (its records name a wanted species).
    expect(a.map((x) => x.photos?.results.length)).toEqual([expect.any(Number), expect.any(Number), undefined]);
    expect(b).toEqual(a);
    // Each form's records cite their own download.
    expect(A!.occ.get(5384013)![0].downloadDoi).toBe('10.15468/dl.aaaaaa');
    expect(B!.occ.get(5384013)![0].downloadDoi).toBe('10.15468/dl.bbbbbb');
    expect(B!.mediaDoi).toBe('10.15468/dl.cccccc');
  });
  it('the images\' download without iNaturalist\'s dataset gives the other datasets\' photographs only, and the records are unchanged', async () => {
    const c = dir('sql-no-inat');
    writeZip(join(c, 'occurrence.zip'), { 'x.csv': sqlCsv(recs) });
    writeFileSync(join(c, 'download.json'), JSON.stringify({ key: 'x', doi: '10.15468/dl.bbbbbb', csv: 'x.csv', fetched: '2026-10-20T11:00:00Z' }));
    writeZip(join(c, 'media.zip'), dwca(imaged(recs).filter((r) => r.ds !== INAT)));
    writeFileSync(join(c, 'media-download.json'), JSON.stringify({ key: 'y', csv: 'occurrence.txt', media: 'multimedia.txt', inat: false, fetched: '2026-10-20T11:30:00Z' }));
    const C = await loadOccurrences(c, 25, new Set(KEYS));
    const A = await loadOccurrences(join(root, 'dwca'), 25, new Set(KEYS));
    expect(view(C).map((x) => x.rows)).toEqual(view(A).map((x) => x.rows));
    const ids = KEYS.flatMap((k) => C!.media?.page(k)?.results.map((o) => o.key) ?? []);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => recs.find((r) => r.id === id)!.ds !== INAT)).toBe(true);
  });
  it('an SQL download alone: the records, and no photographs (the builder then marks GBIF\'s not asked)', async () => {
    const d = dir('sql-alone');
    writeZip(join(d, 'occurrence.zip'), { 'z.csv': sqlCsv(recs) });
    writeFileSync(join(d, 'download.json'), JSON.stringify({ key: 'z', csv: 'z.csv', fetched: '2026-10-20T11:00:00Z' }));
    const D = await loadOccurrences(d, 25, new Set(KEYS));
    expect(D!.media).toBeNull();
    expect(D!.photos).toBe('none');
    expect(readFileSync('scripts/build-dossiers.ts', 'utf8')).toMatch(/if \(loaded\?\.format === 'sql' && !loaded\.media && !skip\.includes\('gbif\.media'\)\) \{ skip\.push\('gbif\.media'\)/);
  });
  it('a download in parts: each part its own zip, read in turn, the same rows, each citing its own part', async () => {
    const p = dir('parts');
    const one = recs.filter((r) => r.species === 5384013), two = recs.filter((r) => r.species !== 5384013);
    writeZip(join(p, 'occurrence-1.zip'), { 'p1.csv': sqlCsv(one) });
    writeZip(join(p, 'occurrence-2.zip'), { 'p2.csv': sqlCsv(two) });
    writeFileSync(join(p, 'download.json'), JSON.stringify({ format: 'SQL_TSV_ZIP', of: 2, parts: [{ key: '0000004-261020000000000', file: 'occurrence-1.zip', csv: 'p1.csv', doi: '10.15468/dl.p1', fetched: 'x' }, { key: '0000005-261020000000000', file: 'occurrence-2.zip', csv: 'p2.csv', doi: '10.15468/dl.p2', fetched: 'x' }] }));
    const P = await loadOccurrences(p, 25, new Set(KEYS));
    const B = await loadOccurrences(join(root, 'sql'), 25, new Set(KEYS));
    expect(view(P).map((x) => x.rows)).toEqual(view(B).map((x) => x.rows));
    expect(new Set(P!.occ.get(5384013)!.map((r) => r.downloadDoi))).toEqual(new Set(['10.15468/dl.p1']));
    expect(new Set(P!.occ.get(3084426)!.map((r) => r.downloadDoi))).toEqual(new Set(['10.15468/dl.p2']));
  });
  it('a record two parts both hold is kept once', async () => {
    const p = dir('parts-overlap');
    writeZip(join(p, 'occurrence-1.zip'), { 'p1.csv': sqlCsv(recs.slice(0, 60)) });
    writeZip(join(p, 'occurrence-2.zip'), { 'p2.csv': sqlCsv(recs.slice(30)) });
    writeFileSync(join(p, 'download.json'), JSON.stringify({ format: 'SQL_TSV_ZIP', of: 2, parts: [{ key: 'a', file: 'occurrence-1.zip', csv: 'p1.csv', fetched: 'x' }, { key: 'b', file: 'occurrence-2.zip', csv: 'p2.csv', fetched: 'x' }] }));
    const P = await loadOccurrences(p, 25, new Set(KEYS));
    const B = await loadOccurrences(join(root, 'sql'), 25, new Set(KEYS));
    expect(view(P).map((x) => x.rows)).toEqual(view(B).map((x) => x.rows));
  });
});

describe('what the reader refuses', () => {
  it('an SQL download of Catalogue of Life\'s keys (the table\'s own specieskey) is never read as backbone keys', async () => {
    const d = dir('col');
    writeZip(join(d, 'occurrence.zip'), { 'c.csv': sqlCsv(recs.slice(0, 3)).replace(/\t5384013\t5384013\t5384013\t/, '\tCVW5J\tCVW5J\tCVW5J\t') });
    writeFileSync(join(d, 'download.json'), JSON.stringify({ key: 'c', csv: 'c.csv', fetched: 'x' }));
    await expect(loadOccurrences(d, 25)).rejects.toThrow(/not a GBIF Backbone key \("CVW5J"\)/);
  });
  it('a download asked for and not fetched yet: the occurrence.zip on disk is an older one, and the build stops', async () => {
    const d = dir('pending');
    writeZip(join(d, 'occurrence.zip'), dwca(recs.slice(0, 3)));
    writeFileSync(join(d, 'download.json'), JSON.stringify({ key: '0000009-261020000000000', format: 'SQL_TSV_ZIP', requested: 'x', taxa: 46041 }));
    await expect(loadOccurrences(d, 25)).rejects.toThrow(/asked for and not fetched yet/);
  });
  it('a part not fetched yet stops the build too', async () => {
    const d = dir('part-missing');
    writeFileSync(join(d, 'download.json'), JSON.stringify({ format: 'DWCA', of: 2, parts: [{ key: 'a', file: 'occurrence-1.zip' }, { key: 'b', file: 'occurrence-2.zip' }] }));
    await expect(loadOccurrences(d, 25)).rejects.toThrow(/not fetched yet/);
  });
});

describe('a page\'s thirty photographs do not depend on the file\'s order', () => {
  it('rows added forwards, backwards and shuffled give the same page', () => {
    const occ = new OccIndex(2000);
    const h = occHeader(DWCA_COLS.join('\t'));
    const many: Rec[] = Array.from({ length: 40 }, (_, i) => ({ ...recs[0], id: 9_000_000 + i * 104729, basis: 'HUMAN_OBSERVATION', lic: i % 4 ? 'CC_BY_4_0' : 'CC_BY_NC_4_0', species: 100, taxon: 100, accepted: 100, images: [0, 1].map((j) => ({ url: `https://img.example.org/m${i}/${j}.jpg`, lic: 'cc0', who: 'X' })) }));
    for (const r of many) occ.add(parseOccRow(h, DWCA_COLS.map((c) => dwcaCell(r, c)).join('\t'))!);
    // Records in another order, each record's own images in its own order, as two of GBIF's archives hold them.
    const pageOf = (rs: Rec[]) => { const m = new MediaIndex(occ.withMedia, occ.mediaRank); for (const l of mediaLines(rs)) m.add(parseMediaRow(MEDIA_COLS, l)!); return m.page(100); };
    const forward = pageOf(many);
    expect(forward!.results.flatMap((o) => o.media ?? []).length).toBe(MediaIndex.CAP);
    expect(pageOf([...many].reverse())).toEqual(forward);
    expect(pageOf(shuffled(many))).toEqual(forward);
  });
});

describe('a species list is built from the download asked for it', () => {
  const at = (name: string, files: Record<string, string>) => { const d = dir(name); for (const [f, t] of Object.entries(files)) writeFileSync(join(d, f), t); return d; };
  const KEYS4 = [1, 2, 3, 4];
  it('round seventy-two\'s download (no count of what it was asked for) is refused for the list', () => {
    expect(downloadShortOf(at('old', { 'download.json': JSON.stringify({ key: '0006100-260916113435855', doi: '10.15468/dl.3h4zam', csv: 'occurrence.txt', fetched: 'x' }) }), KEYS4)).toMatch(/from before round seventy-nine/);
  });
  it('one asked for fewer species is refused; the species left to the API path are counted with it', () => {
    expect(downloadShortOf(at('short', { 'download.json': JSON.stringify({ key: 'a', taxa: 2, csv: 'x.csv', fetched: 'x' }) }), KEYS4)).toMatch(/asked for 2 species \(and 0 left to the API path\), not the list's 4/);
    expect(downloadShortOf(at('heavy', { 'download.json': JSON.stringify({ key: 'a', taxa: 3, csv: 'x.csv', fetched: 'x' }), 'api-path.txt': '4\t250000\n' }), KEYS4)).toBeNull();
    expect(downloadShortOf(at('parts-ok', { 'download.json': JSON.stringify({ format: 'DWCA', parts: [{ key: 'a', taxa: 2 }, { key: 'b', taxa: 2 }] }) }), KEYS4)).toBeNull();
  });
  it('beside an SQL download, an images\' download asked for fewer species is refused', () => {
    const d = at('media-short', { 'download.json': JSON.stringify({ key: 'a', format: 'SQL_TSV_ZIP', taxa: 4, csv: 'x.csv', fetched: 'x' }), 'media-download.json': JSON.stringify({ key: 'm', taxa: 3, fetched: 'x' }), 'media.zip': '' });
    expect(downloadShortOf(d, KEYS4)).toMatch(/images' download .* asked for 3 species, not the records' 4/);
  });
  it('no download at all is the build\'s to say, as before (guard)', () => {
    expect(downloadShortOf(dir('none'), KEYS4)).toBeNull();
  });
});

