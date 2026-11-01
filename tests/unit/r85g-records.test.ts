/**
 * Round eighty-five, G: the records a page reads, and the check after the walk.
 *
 * - Decision 5 (S3, D11): the download's sample of a species keeps every distinct cell first, not the smallest id-hashes
 *   (a dense population filled the 2,000 before a sparse one was read); GBIF's search, past 900 records, is asked region
 *   by region.
 * - A23: the basionym rule refuses a range only where Kew's two records disagree; `--check-ranges` reads each page's
 *   reasons: every contributing cell off the shapes by its reason's reach, the open records again by the border rule, the
 *   counts present; and a typical cell on another region's land is said.
 *
 * FAILS on r85base: the sample keeps a handful of the 50 sparse cells; the search asks no region; a basionym with the
 * same range takes the range away; `checkPage` has no `edgeOutside`, `uncounted`, `reasonDiffers` or `cellOnOtherLand`.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { OccIndex, WcvpIndex, SAMPLE_CELL_DEG, type WcvpName, type WcvpDist } from '$dossier/bulk';
import { occurrences, MAX_REGION_PAGES } from '$dossier/sources/gbif';
import type { JsonFetcher } from '$dossier/fetch';
import { checkPage, cellTester, REACH_DEG, type CheckPage } from '$dossier/range-check';
import { regionTester, RANGE_RULE, SHAPES_FILE, type ShapesFile } from '$dossier/tdwg-shapes';

const occ = (key: number, lat: number, lon: number) => ({ key, speciesKey: 7, decimalLatitude: lat, decimalLongitude: lon, basisOfRecord: 'HUMAN_OBSERVATION', license: 'CC_BY_4_0' });

describe('decision 5: every distinct cell first', () => {
  it('2,000 records at one place and 50 at fifty others, a cap of 60: all fifty-one places are kept', () => {
    const idx = new OccIndex(60);
    let k = 1;
    for (let i = 0; i < 2000; i++) idx.add(occ(k++, 10.011, 10.011));
    for (let i = 0; i < 50; i++) idx.add(occ(k++, 20 + i * 0.3, 30));
    idx.seal();
    const got = idx.get(7)!;
    expect(got.length).toBe(60);
    const cells = new Set(got.map((o) => `${Math.floor(o.decimalLatitude! / SAMPLE_CELL_DEG)},${Math.floor(o.decimalLongitude! / SAMPLE_CELL_DEG)}`));
    expect(cells.size).toBe(51);
  });
  it('the same records in another order give the same sample', () => {
    const rows = [...Array.from({ length: 500 }, (_, i) => occ(i + 1, 10.011, 10.011)), ...Array.from({ length: 30 }, (_, i) => occ(1000 + i, 20 + i * 0.3, 30))];
    const a = new OccIndex(40), b = new OccIndex(40);
    for (const r of rows) a.add(r);
    for (const r of [...rows].reverse()) b.add(r);
    a.seal(); b.seal();
    expect(a.get(7)!.map((o) => o.key)).toEqual(b.get(7)!.map((o) => o.key));
  });
  it('under the cap, every record is kept, once', () => {
    const idx = new OccIndex(100);
    for (let i = 0; i < 20; i++) { idx.add(occ(i + 1, 10, 10)); idx.add(occ(i + 1, 10, 10)); }
    idx.seal();
    expect(idx.get(7)!.length).toBe(20);
  });
});

describe("decision 5: GBIF's search, past what its pages read, region by region", () => {
  it('one page from anywhere, then each native region\'s box (the largest first, at most five)', async () => {
    const asked: string[] = [];
    let n = 0;
    const f = (async (url: string) => {
      asked.push(url);
      return { status: 'ok', data: { results: Array.from({ length: 300 }, () => ({ key: ++n, decimalLatitude: 1, decimalLongitude: 1 })), endOfRecords: false, count: 50_000 } };
    }) as unknown as JsonFetcher;
    const boxes = Array.from({ length: 7 }, (_, i) => ({ s: i, w: i, n: i + 1 + i, e: i + 1 + i }));
    const r = await occurrences(f, 42, 3, boxes);
    expect(MAX_REGION_PAGES).toBe(5);
    expect(asked.length).toBe(1 + 5);
    expect(asked[0]).not.toContain('decimalLatitude');
    expect(asked[1]).toContain('decimalLatitude=6,13&decimalLongitude=6,13');
    expect(r.status === 'ok' && r.data.length).toBe(1800);
  });
  it('a species GBIF holds all of in its pages is read as before, region by none', async () => {
    const asked: string[] = [];
    const f = (async (url: string) => { asked.push(url); return { status: 'ok', data: { results: [{ key: 1 }], endOfRecords: true, count: 1 } }; }) as unknown as JsonFetcher;
    await occurrences(f, 42, 3, [{ s: 0, w: 0, n: 1, e: 1 }]);
    expect(asked.length).toBe(1);
  });
});

describe('A23: the basionym rule only where Kew\'s two records disagree', () => {
  const nm = (id: string, name: string, status: string, acceptedId: string, authors: string): WcvpName => ({ id, name, status, acceptedId, rank: 'Species', authors });
  const ds = (id: string, l3: string): WcvpDist => ({ id, l3, area: l3, introduced: false, extinct: false, doubtful: false });
  const kew = (basionymRange: string[]) => {
    const k = new WcvpIndex();
    // The basionym filed under another accepted entry of Kew's (whose range is read); one Kew holds unplaced has no range
    // read, and stays refused (no range is known to agree).
    for (const r of [nm('1', 'Sarcocaulon spinosum', 'Accepted', '1', '(Burm.f.) Kuntze'), nm('2', 'Geranium spinosum', 'Synonym', '1', 'Burm.f.'), nm('4', 'Sarcocaulon heritieri', 'Accepted', '4', 'Sweet'), nm('3', 'Sarcocaulon lheritieri', 'Synonym', '4', 'Sweet')]) k.addName(r, () => true);
    for (const d of [ds('1', 'CPP'), ds('1', 'NAM'), ...basionymRange.map((l) => ds('4', l))]) k.addDist(d);
    return k;
  };
  const older = [{ name: 'Geranium spinosum', authorship: 'Burm.fil.' }, { name: 'Sarcocaulon lheritieri', authorship: '(DC.) Sweet' }];
  const own = { name: 'Monsonia lheritieri', authorship: '(Sweet) Steud.' };
  it('the basionym\'s entry in the Cape alone, the older names\' in the Cape and Namibia: no range (as round eighty-four)', () => {
    expect(kew(['CPP']).viaOlderNames(older, own)).toMatchObject({ ambiguous: expect.any(String) });
  });
  it('the same native regions in both records: the range is the plant\'s, and kept', () => {
    expect(kew(['CPP', 'NAM']).viaOlderNames(older, own)).toMatchObject({ entry: { id: '1' } });
  });
});

describe('A23, D4: the check reads every page\'s reasons', () => {
  const file = JSON.parse(readFileSync(SHAPES_FILE, 'utf8')) as ShapesFile;
  const t = regionTester(file), cell = cellTester(file);
  // Every region's shape is prepared on the first record off a native one: seconds on a busy machine, once.
  beforeAll(() => { t.landOf(0, 0); cell.landOf(0, 0); }, 120_000);
  const counts = (o: Partial<Record<'strict' | 'buffer' | 'coast' | 'island', number>>) => ({ strict: 0, buffer: 0, coast: 0, island: 0, ...o });
  const page = (over: Record<string, unknown> = {}, occ: Record<string, unknown> = {}, climate: Record<string, unknown> = {}): CheckPage => ({
    key: 'k1', name: { scientific: 'Aus bus' }, distribution: { native: [{ code: 'NZN' }] },
    occurrences: { open: [[-36.85, 174.76, 2020, 'NZ', 'HUMAN_OBSERVATION', 'by'], [-35.47, 174.735, 2021, 'NZ', 'HUMAN_OBSERVATION', 'by']], nOpenInRange: 2, nRestrictedInRange: 3, nOutsideRange: 0, rangeTested: true, rangeRule: RANGE_RULE, admitted: counts({ strict: 4, island: 1 }), edge: { island: [1] }, ...occ },
    climate: { status: 'ok', at: { lat: -36.875, lon: 174.775 }, cells: 4, admitted: counts({ strict: 3, island: 1 }), edge: [[-35.475, 174.725, 'island']], ...climate },
    upstream: { 'gbif.occurrences': { status: 'ok' } }, ...over
  }) as unknown as CheckPage;
  it('a page right by this rule: nothing to say', () => {
    expect(checkPage(page(), cell, t, RANGE_RULE)).toMatchObject({ cellOutside: false, oldRule: false, openOutside: 0, edgeOutside: 0, uncounted: false, reasonDiffers: 0 });
  });
  it('a contributing cell off the shapes beyond its reason\'s reach is named (the typical cell alone was tested before)', () => {
    // A cell said to be in by the margin, half a degree out to sea.
    expect(checkPage(page({}, {}, { edge: [[-35.475, 174.725, 'island'], [-36.5, 176.2, 'buffer']], cells: 5, admitted: counts({ strict: 3, buffer: 1, island: 1 }) }), cell, t, RANGE_RULE).edgeOutside).toBe(1);
    expect(REACH_DEG.buffer).toBeCloseTo(0.086, 3);
  });
  it('counts missing or short, and an open record whose reason is not the dossier\'s, are named', () => {
    expect(checkPage(page({}, { admitted: undefined }), cell, t, RANGE_RULE).uncounted).toBe(true);
    expect(checkPage(page({}, {}, { admitted: counts({ strict: 3 }) }), cell, t, RANGE_RULE).uncounted).toBe(true);
    expect(checkPage(page({}, { edge: {} }), cell, t, RANGE_RULE).reasonDiffers).toBe(1);
  });
  it('an open record the border rule refuses (Aloe vera at Khor Fakkan, AE) is outside', () => {
    const d = page({ distribution: { native: [{ code: 'OMA' }] } }, { open: [[25.345, 56.315, 2019, 'AE', 'HUMAN_OBSERVATION', 'by']], nOpenInRange: 1, nRestrictedInRange: 0, admitted: counts({ buffer: 1 }), edge: { buffer: [0] } }, { status: 'none' });
    expect(checkPage(d, cell, t, RANGE_RULE).openOutside).toBe(1);
  });
  it.skipIf(!existsSync('/tmp/claude-0/rev85r/D-s/dos/k298116.json'))("D4: the live Aloe vera's typical cell, on the Emirates' land, is said; its page is of the rule before", () => {
    const d = JSON.parse(readFileSync('/tmp/claude-0/rev85r/D-s/dos/k298116.json', 'utf8'));
    const f = checkPage(d, cell, t, RANGE_RULE);
    expect(f.oldRule).toBe(true);
    expect(f.cellOnOtherLand).toEqual({ land: ['GST'], how: 'strict' });
  });
});

describe("the next walk's plan", () => {
  it('backup, the walk, Kew\'s names, then the index, the check and a review before the upload and the live check', () => {
    const steps = readFileSync('scripts/corpus-plan-r85.txt', 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split(' ').slice(0, 2).join(' '));
    expect(steps.slice(0, 2)).toEqual(['backup', 'dossier --walk']);
    const at = (s: string) => steps.indexOf(s);
    expect(at('dossier --index')).toBeGreaterThan(at('dossier --walk'));
    expect(at('dossier --check-ranges')).toBeGreaterThan(at('dossier --index'));
    expect(at('review Read')).toBeGreaterThan(at('dossier --check-ranges'));
    expect(steps.slice(-2)).toEqual(['upload', 'live-check']);
    // N's online steps between Kew's names and the index (decision 6 to 8), and the step runner reads every line.
    expect(at('dossier --fill')).toBeLessThan(at('dossier --index'));
    expect(steps).toContain('if-exists rebuild-renamed.txt');
  });
  it('the step runner reads it', async () => {
    const { parsePlan } = await import('../../scripts/corpus-step.mjs');
    const plan = parsePlan(readFileSync('scripts/corpus-plan-r85.txt', 'utf8')) as Array<{ kind: string }>;
    expect(plan.map((x) => x.kind)).toEqual(['backup', ...Array(9).fill('dossier'), 'review', 'upload', 'live-check']);
    // The credits' days take two or three days of iNaturalist's allowance: their own plan, after the upload (the coordinator).
    const credits = parsePlan(readFileSync('scripts/corpus-plan-r85-credits.txt', 'utf8')) as Array<{ kind: string; line: string }>;
    expect(credits.map((x) => x.kind)).toEqual([...Array(3).fill('dossier'), 'review', 'upload', 'live-check']);
    expect(credits[0].line).toContain('--fill credits');
  });
});
