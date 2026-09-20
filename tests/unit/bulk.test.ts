import { describe, it, expect } from 'vitest';
import { WcvpIndex, OccIndex, MediaIndex, parseMediaRow, parseWcvpName, parseWcvpDist, occHeader, parseOccRow, bulkFetcher, idHash } from '$lib/dossier/bulk';
import type { JsonFetcher } from '$lib/dossier/fetch';

const NAMES_H = 'plant_name_id|ipni_id|taxon_rank|taxon_status|family|genus_hybrid|genus|species_hybrid|species|infraspecific_rank|infraspecies|parenthetical_author|primary_author|publication_author|place_of_publication|volume_and_page|first_published|nomenclatural_remarks|geographic_area|lifeform_description|climate_description|taxon_name|taxon_authors|accepted_plant_name_id|basionym_plant_name_id|replaced_synonym_author|homotypic_synonym|parent_plant_name_id|powo_id|hybrid_formula|reviewed'.split('|');
const row = (id: string, status: string, name: string, acc: string, lifeform = 'succulent shrub', climate = 'desert or dry shrubland') =>
  [id, '', 'Species', status, 'Crassulaceae', '', name.split(' ')[0], '', name.split(' ')[1], '', '', '', 'Schönland', '', '', '', '(1907)', '', 'Namibia to Cape Prov.', lifeform, climate, name, 'Schönland', acc, '', '', '', '', 'urn:lsid:ipni.org:names:1', '', 'Y'].join('|');
const DIST_H = 'plant_name_id|continent_code_l1|continent|region_code_l2|region|area_code_l3|area|introduced|extinct|location_doubtful'.split('|');

describe('WCVP index', () => {
  it('keeps wanted names, resolves a synonym to its accepted record, and gives distributions in the GBIF shape', () => {
    const w = new WcvpIndex();
    const wanted = (n: string) => ['Tylecodon pearsonii', 'Cotyledon pearsonii'].includes(n);
    for (const l of [row('1', 'Accepted', 'Tylecodon pearsonii', '1'), row('2', 'Synonym', 'Cotyledon pearsonii', '1'), row('3', 'Accepted', 'Tylecodon wallichii', '3')]) w.addName(parseWcvpName(NAMES_H, l), wanted);
    expect(w.size).toBe(2);
    expect(w.acceptedIds()).toEqual(new Set(['1']));
    for (const l of ['1|2|AFRICA|27|Southern Africa|NAM|Namibia|0|0|0', '1|2|AFRICA|27|Southern Africa|CPP|Cape Provinces|0|0|0', '1|8|NORTHERN AMERICA|76|Southwestern U.S.A.|CAL|California|1|0|0', '1|2|AFRICA|27|Southern Africa|BOT|Botswana|0|0|1']) w.addDist(parseWcvpDist(DIST_H, l));
    const got = w.distributions('Cotyledon pearsonii'); // the synonym finds the accepted record's range
    if (!got || got === 'ambiguous') throw new Error('expected rows');
    expect(got.rows.map((r) => r.locationId)).toEqual(['TDWG:NAM', 'TDWG:CPP', 'TDWG:CAL']); // the doubtful one is dropped
    expect(got.rows[2].establishmentMeans).toBe('INTRODUCED');
    expect(got.rows[0].source).toMatch(/WCVP/);
    expect(got.kew).toEqual({ lifeform: 'succulent shrub', climate: 'desert or dry shrubland' }); // Kew's own words ride along
    expect(w.distributions('Tylecodon wallichii')).toBeNull(); // accepted but not wanted, no rows kept
    expect(w.distributions('Nobody knowsii')).toBeNull();
    const a = w.accepted('Tylecodon pearsonii');
    expect(a && a !== 'ambiguous' ? a.lifeform : undefined).toBe('succulent shrub');
  });
  it('an accepted name outside the wanted genera (the target of a followed synonym) is still found, and its range kept', () => {
    const w = new WcvpIndex();
    const wanted = (n: string) => n.startsWith('Cotyledon ');
    for (const l of [row('1', 'Accepted', 'Adromischus mckayi', '1'), row('2', 'Synonym', 'Cotyledon mckayi', '1')]) w.addName(parseWcvpName(NAMES_H, l), wanted);
    expect(w.acceptedIds()).toEqual(new Set(['1'])); // the second pass keeps the accepted target's rows
    w.addDist(parseWcvpDist(DIST_H, '1|2|AFRICA|27|Southern Africa|CPP|Cape Provinces|0|0|0'));
    const got = w.distributions('Adromischus mckayi'); // asked by the accepted name the backbone followed to
    expect(got && got !== 'ambiguous' ? got.rows.length : 0).toBe(1);
  });
  it('homonyms: two accepted rows with one spelling resolve by authorship, and are ambiguous without it', () => {
    const w = new WcvpIndex();
    const wanted = () => true;
    const l1 = row('1', 'Accepted', 'Homonymus example', '1').replace('|Schönland|1|', '|L.|1|');
    const l2 = row('2', 'Accepted', 'Homonymus example', '2').replace('|Schönland|2|', '|Mill.|2|');
    for (const l of [l1, l2]) w.addName(parseWcvpName(NAMES_H, l), wanted);
    w.addDist(parseWcvpDist(DIST_H, '1|2|AFRICA|27|Southern Africa|NAM|Namibia|0|0|0'));
    w.addDist(parseWcvpDist(DIST_H, '2|8|NORTHERN AMERICA|76|Southwestern U.S.A.|CAL|California|0|0|0'));
    expect(w.distributions('Homonymus example')).toBe('ambiguous');
    const mill = w.distributions('Homonymus example', 'Mill.');
    expect(mill && mill !== 'ambiguous' ? mill.rows[0].locationId : null).toBe('TDWG:CAL');
    expect(w.distributions('Homonymus example', 'Nobody')).toBe('ambiguous');
  });
  it('a region where WCVP says the plant is extinct is marked so, never plain native', () => {
    const w = new WcvpIndex();
    w.addName(parseWcvpName(NAMES_H, row('1', 'Accepted', 'Gonus lostii', '1')), () => true);
    w.addDist(parseWcvpDist(DIST_H, '1|2|AFRICA|27|Southern Africa|NAM|Namibia|0|1|0'));
    const got = w.distributions('Gonus lostii');
    expect(got && got !== 'ambiguous' ? got.rows[0].establishmentMeans : null).toBe('EXTINCT');
  });
});

describe('GBIF occurrence download', () => {
  const h = occHeader('gbifID\tdatasetKey\tspecies\tcountryCode\tdecimalLatitude\tdecimalLongitude\tyear\ttaxonKey\tspeciesKey\tbasisOfRecord\tlicense\testablishmentMeans\r');
  it('parses rows, drops those without coordinates, indexes by species and taxon key', () => {
    const idx = new OccIndex(3);
    const rows = [
      '10\tds1\tTylecodon pearsonii\tZA\t-30.1\t17.9\t2019\t100\t100\tHUMAN_OBSERVATION\tCC_BY_4_0\t',
      '11\tds1\tTylecodon pearsonii\tZA\t\t\t2019\t100\t100\tHUMAN_OBSERVATION\tCC_BY_4_0\t',
      '12\tds2\tTylecodon pearsonii subsp. x\tNA\t-28.0\t16.5\t2001\t101\t100\tPRESERVED_SPECIMEN\tCC_BY_NC_4_0\t',
      '13\tds1\tTylecodon pearsonii\tZA\t-30.2\t17.8\t2020\t100\t100\tHUMAN_OBSERVATION\tCC_BY_4_0\t',
      '14\tds1\tTylecodon pearsonii\tZA\t-30.3\t17.7\t2021\t100\t100\tHUMAN_OBSERVATION\tCC_BY_4_0\t',
      '15\tds1\tTylecodon pearsonii\tZA\t-30.4\t17.6\t2022\t100\t100\tHUMAN_OBSERVATION\tCC_BY_4_0\t'
    ];
    for (const r of rows) {
      const o = parseOccRow(h, r);
      if (o) idx.add(o);
    }
    idx.seal();
    expect(idx.species).toBe(2); // 100 and 101
    const sp = idx.get(100)!;
    expect(sp).toHaveLength(3); // capped from 5
    expect(sp.map((o) => o.key)).toEqual([...sp.map((o) => o.key)].sort((a, b) => a - b)); // id order
    const again = new OccIndex(3);
    for (const r of rows) { const o = parseOccRow(h, r); if (o) again.add(o); }
    again.seal();
    expect(again.get(100)!.map((o) => o.key)).toEqual(sp.map((o) => o.key)); // the same sample every time
    const first = sp.find((o) => o.key === 10);
    if (first) expect(first).toMatchObject({ decimalLatitude: -30.1, decimalLongitude: 17.9, license: 'CC_BY_4_0', countryCode: 'ZA', year: 2019 });
    expect(idx.get(101)).toHaveLength(1);
    expect(idx.get(999)).toBeUndefined();
  });
});

describe('the sample', () => {
  it('keeps a bounded, uniform, deterministic subset while streaming', () => {
    const idx = new OccIndex(100);
    for (let i = 1; i <= 5000; i++) idx.add({ key: i * 7, decimalLatitude: 0, decimalLongitude: 0, speciesKey: 1 });
    idx.seal();
    const s = idx.get(1)!;
    expect(s).toHaveLength(100);
    const mean = s.reduce((a, o) => a + o.key, 0) / s.length;
    expect(mean).toBeGreaterThan(5000 * 7 * 0.35);
    expect(mean).toBeLessThan(5000 * 7 * 0.65);
    const hs = Array.from({ length: 1000 }, (_, i) => idHash(i));
    expect(Math.min(...hs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...hs)).toBeLessThan(1);
    expect(new Set(hs).size).toBeGreaterThan(990);
  });
});

describe('the bulk fetcher', () => {
  it('answers distribution and occurrence URLs from the files and passes everything else through', async () => {
    const calls: string[] = [];
    const base: JsonFetcher = async (url) => {
      calls.push(url);
      if (/\/species\/100$/.test(url)) return { status: 'ok', data: { key: 100, scientificName: 'Tylecodon pearsonii Schönland', canonicalName: 'Tylecodon pearsonii' } as never };
      return { status: 'none' };
    };
    const w = new WcvpIndex();
    w.addName(parseWcvpName(NAMES_H, row('1', 'Accepted', 'Tylecodon pearsonii', '1')), () => true);
    w.addDist(parseWcvpDist(DIST_H, '1|2|AFRICA|27|Southern Africa|NAM|Namibia|0|0|0'));
    const occ = new OccIndex();
    occ.add({ key: 10, decimalLatitude: -30, decimalLongitude: 17, speciesKey: 100 });
    occ.seal();
    const f = bulkFetcher(base, { wcvp: w, occ });
    // the builder asks for the species first, as it does; the name is learned on the way past
    await f('https://api.gbif.org/v1/species/100');
    const d = await f<{ results: unknown[] }>('https://api.gbif.org/v1/species/100/distributions?limit=200');
    expect(d.status).toBe('ok');
    expect((d as { data: { results: Array<{ locationId: string }> } }).data.results[0].locationId).toBe('TDWG:NAM');
    const o = await f<{ results: unknown[]; endOfRecords: boolean }>('https://api.gbif.org/v1/occurrence/search?taxonKey=100&hasCoordinate=true&hasGeospatialIssue=false&occurrenceStatus=PRESENT&limit=300&offset=0');
    expect(o.status).toBe('ok');
    expect((o as { data: { results: unknown[]; endOfRecords: boolean } }).data.results).toHaveLength(1);
    // media is not in the download: it goes to the API
    await f('https://api.gbif.org/v1/occurrence/search?taxonKey=100&mediaType=StillImage&limit=100');
    // a species the files lack falls through too
    await f('https://api.gbif.org/v1/species/200/distributions?limit=200');
    expect(f.stats).toEqual({ wcvp: 1, occ: 1, media: 0, through: 3 }); // species/100, media, species/200/distributions (its name lookup goes to base directly)
    expect(calls.filter((u) => /\/species\/200$/.test(u))).toHaveLength(1);
    expect(calls.filter((u) => u.includes('/species/100/distributions'))).toHaveLength(0);
  });
});

describe('photographs from a DWCA download', () => {
  const MH = 'gbifID\ttype\tformat\tidentifier\treferences\ttitle\tdescription\tsource\taudience\tcreated\tcreator\tcontributor\tpublisher\tlicense\trightsHolder'.split('\t');
  const mrow = (id: number, url: string, lic: string, creator = 'A. Grower', type = 'StillImage', format = 'image/jpeg') => [id, type, format, url, `https://www.inaturalist.org/observations/${id}`, '', '', '', '', '', creator, '', '', lic, creator].join('\t');
  it('keeps images of observation records the occurrence pass marked, open licences only, and serves them in the media search shape', async () => {
    const occ = new OccIndex();
    const h = occHeader('gbifID\tdecimalLatitude\tdecimalLongitude\tspeciesKey\tbasisOfRecord\tlicense\tmediaType');
    occ.add(parseOccRow(h, '10\t-30\t17\t100\tHUMAN_OBSERVATION\tCC_BY_NC_4_0\tStillImage')!);
    occ.add(parseOccRow(h, '11\t-30.1\t17.1\t100\tPRESERVED_SPECIMEN\tCC_BY_4_0\tStillImage')!); // a herbarium sheet: not a photograph of the plant
    occ.add(parseOccRow(h, '12\t-30.2\t17.2\t100\tHUMAN_OBSERVATION\tCC_BY_4_0\t')!); // no images
    occ.seal();
    expect([...occ.withMedia.keys()]).toEqual([10]);
    // a record identified to a subspecies (taxonKey 1001, speciesKey 100) belongs to the species' page
    const h2 = occHeader('gbifID\tdecimalLatitude\tdecimalLongitude\tspeciesKey\ttaxonKey\tbasisOfRecord\tlicense\tmediaType');
    occ.add(parseOccRow(h2, '13\t-30.3\t17.3\t100\t1001\tHUMAN_OBSERVATION\tCC_BY_4_0\tStillImage')!);
    expect(occ.withMedia.get(13)).toBe(100);
    const media = new MediaIndex(occ.withMedia);
    for (const l of [mrow(10, 'https://inaturalist-open-data.s3.amazonaws.com/photos/1/original.jpg', 'http://creativecommons.org/licenses/by/4.0/'), mrow(10, 'https://inaturalist-open-data.s3.amazonaws.com/photos/2/original.jpg', 'http://creativecommons.org/licenses/by-nc/4.0/'), mrow(11, 'https://x/sheet.jpg', 'http://creativecommons.org/licenses/by/4.0/'), mrow(10, 'https://x/clip.mp4', 'cc0', 'B', 'MovingImage', 'video/mp4')]) media.add(parseMediaRow(MH, l)!);
    const f = bulkFetcher(async () => ({ status: 'none' }), { occ, media });
    const r = await f<{ results: Array<{ key: number; media: Array<{ identifier: string; license?: string }> }> }>('https://api.gbif.org/v1/occurrence/search?taxonKey=100&mediaType=StillImage&limit=100');
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.data.results).toHaveLength(1);
    // the NC image is dropped at the index, so the count of species with photographs is a count of open ones
    expect(r.data.results[0].media.map((m) => m.identifier)).toEqual(['https://inaturalist-open-data.s3.amazonaws.com/photos/1/original.jpg']);
    // and the media adapter serves the same set it would on the API path
    const { media: adapter } = await import('$dossier/sources/gbif');
    const got = await adapter(f, 100);
    expect(got.status).toBe('ok');
    if (got.status !== 'ok') return;
    expect(got.data.map((m) => m.url)).toEqual(['https://inaturalist-open-data.s3.amazonaws.com/photos/1/original.jpg']);
    expect(got.data[0].creator).toBe('A. Grower');
    expect(f.stats.media).toBe(2); // once for the raw page, once through the adapter
  });
});

describe('a build through the bulk path', () => {
  it('produces the same dossier shape, with the range from WCVP and the points from the download, and never calls those two APIs', async () => {
    const { buildDossier } = await import('$dossier/build');
    const { fixtureFetcher } = await import('$dossier/fetch');
    const { copiapoa } = await import('../../fixtures/upstream');
    const table = copiapoa();
    const asked: string[] = [];
    const base: JsonFetcher = async (url, o) => {
      asked.push(url);
      return fixtureFetcher(table)(url, o);
    };
    const w = new WcvpIndex();
    w.addName(parseWcvpName(NAMES_H, row('77', 'Accepted', 'Copiapoa cinerea', '77')), () => true);
    w.addDist(parseWcvpDist(DIST_H, '77|8|SOUTHERN AMERICA|85|Southern South America|CLN|Chile North|0|0|0'));
    const occ = new OccIndex();
    // fifty points along the Atacama coast, open licence, plus one planted specimen that must be ignored
    for (let i = 0; i < 50; i++) occ.add({ key: 1000 + i, decimalLatitude: -25 - i * 0.02, decimalLongitude: -70.5 + (i % 5) * 0.01, year: 2010 + (i % 10), countryCode: 'CL', basisOfRecord: 'HUMAN_OBSERVATION', license: 'CC_BY_4_0', datasetKey: 'ds', speciesKey: 5384013 });
    occ.add({ key: 9999, decimalLatitude: -33.4, decimalLongitude: -70.6, basisOfRecord: 'LIVING_SPECIMEN', license: 'CC_BY_4_0', speciesKey: 5384013 });
    occ.seal();
    const f = bulkFetcher(base, { wcvp: w, occ });
    const r = await buildDossier('Copiapoa cinerea', { fetcher: f, builtBy: 'node', now: () => new Date('2026-09-15T12:00:00Z') });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const d = r.dossier;
    expect(d.distribution.native.map((n) => n.code)).toEqual(['CLN']);
    expect(d.distribution.source).toMatch(/WCVP/);
    expect(d.occurrences.nOpenInRange).toBe(50);
    expect(d.centroid?.lat).toBeCloseTo(-25.5, 0);
    expect(d.upstream['wcvp.distribution'].status).toBe('ok');
    expect(d.upstream['gbif.occurrences'].status).toBe('ok');
    expect(asked.some((u) => u.includes('/distributions'))).toBe(false);
    expect(asked.some((u) => u.includes('hasCoordinate=true'))).toBe(false);
    expect(asked.some((u) => u.includes('inaturalist'))).toBe(true); // photos still come from the APIs
    expect(f.stats.wcvp).toBe(1);
    expect(f.stats.occ).toBe(1);
  });
});

describe('OccIndex memory bound', () => {
  it('holds at most cap × 1.25 rows per species while streaming and the same sample as an unbounded sort', () => {
    const cap = 40;
    const idx = new OccIndex(cap);
    const all: number[] = [];
    let peak = 0;
    for (let id = 1; id <= 5000; id++) {
      all.push(id);
      idx.add({ key: id, decimalLatitude: 0, decimalLongitude: 0, speciesKey: 7 });
      peak = Math.max(peak, idx.kept);
    }
    expect(peak).toBeLessThanOrEqual(Math.ceil(cap * 1.25));
    idx.seal();
    const want = all.sort((a, b) => idHash(a) - idHash(b)).slice(0, cap).sort((a, b) => a - b);
    expect(idx.get(7)!.map((o) => o.key)).toEqual(want);
  });
});

describe('OccIndex wanted set', () => {
  it('keeps only the species asked for and drops everything else on the floor', () => {
    const idx = new OccIndex(10, new Set([7]));
    for (let id = 1; id <= 50; id++) idx.add({ key: id, decimalLatitude: 1, decimalLongitude: 2, countryCode: 'CL', speciesKey: id % 2 ? 7 : 8, taxonKey: id % 2 ? 7 : 9 });
    idx.seal();
    expect(idx.species).toBe(1);
    expect(idx.get(8)).toBeUndefined();
    expect(idx.get(7)).toHaveLength(10);
    expect(idx.get(7)![0]).toMatchObject({ decimalLatitude: 1, decimalLongitude: 2, countryCode: 'CL' });
    expect(idx.get(7)![0].year).toBeUndefined();
  });
});
