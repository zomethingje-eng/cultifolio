/**
 * Round ninety-two (docs/PLAN-92.md): flowering by month counted from one GBIF download of iNaturalist's research-grade
 * observations, under each page's GBIF keys, in place of iNaturalist's API a page at a time. What it proves:
 *
 *   1. the download asked: iNaturalist's dataset, Plantae, the flowers annotation, by key, month and annotation;
 *   2. the reader: "flowers" alone or with another annotation counts once, "flower buds" and "no flowers or fruits"
 *      never, a row with no month is left out and counted, columns found by name, a file with no header refused;
 *   3. the keys: the page's own key by taxon, accepted or species key; keys given to another page left out; another key's
 *      exceptions left out; a row counted once whichever keys reach it;
 *   4. the fill: every page with a key written (twelve zeros said as the download's none), the API's count taken off a
 *      page with no key, a page already counted from the same download passed by, the dry run writing nothing; the
 *      comparison with the API's counts;
 *   5. the plans: the round's first review passes on figures within its conditions and stops outside them; the second
 *      always stops; the monthly plan's review reads the fill's own line; the daily plan no longer counts flowering;
 *   6. the page's words: the download's citation and DOI, what was counted, none said with its source, "not asked" with
 *      why; the record's form; the carry; the old fill passing a counted page by;
 *   7. the loader: a download read whole from its zip, and refused (nothing taken) when it is not.
 *
 * On 0509684 (before this round): FAILED. src/lib/dossier/flowering-gbif.ts did not exist, the schema held the API's form
 * alone, and the daily plan still asked iNaturalist a page at a time.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as v from 'valibot';
import { render } from 'svelte/server';
import {
  FLOWERING_SQL, INAT_GBIF_DATASET, isFlowering, parseFloweringRows, countUnder, fillFloweringGbif, compare, compareFigures,
  floweringGbifLine, sharplyApart, monthsApart, type FloweringDownload, type FloweringGbifPage, type PageKeys
} from '$dossier/flowering-gbif';
import { floweringWanted } from '$dossier/flowering';
import { carryLinks } from '$dossier/links-carry';
import { Flowering as FloweringSchema } from '$dossier/schema';
import { floweringView, FLOWERING_NO_KEY, FLOWERING_NOT_YET } from '$lib/ui/ref/links-words';
import Flowering from '$lib/ui/ref/Flowering.svelte';
import { floweringRequest } from '../../scripts/gbif-request-lib';
import { parsePlan } from '../../scripts/corpus-step.mjs';
import { runChecks } from '../../scripts/review-checks.mjs';
import { loadFloweringDownload } from '../../scripts/bulk-load';
import { writeZip } from '../../scripts/dev/zip-store';

const HEAD = 'taxonkey\tacceptedtaxonkey\tspecieskey\tmonth\treproductivecondition\tn';
const row = (t: number | '', a: number | '', s: number | '', m: number | '', cond: string, n: number) => [t, a, s, m, cond, n].join('\t');
const DL: FloweringDownload = { key: '0000001-261115000000000', doi: '10.15468/dl.test92', made: '2026-11-15' };
const memStore = (pages: Record<string, unknown>) => {
  const m = new Map(Object.entries(pages).map(([k, d]) => [k, structuredClone(d)]));
  const writes: string[] = [];
  return { m, writes, files: () => [...m.keys()], read: <T,>(f: string) => structuredClone(m.get(f)) as T, write: (f: string, d: unknown) => { writes.push(f); m.set(f, structuredClone(d)); } };
};
const html = (props: Record<string, unknown>) => render(Flowering, { props: props as never }).body.replace(/<!--[^]*?-->/g, '').replace(/\s+/g, ' ');

describe('r92a 1: the download asked', () => {
  it("one SQL query: iNaturalist's research-grade dataset, Plantae, the flowers annotation, by key, month and annotation", () => {
    expect(INAT_GBIF_DATASET).toBe('50c9509d-22c7-4a22-a47d-8c48425ef4a7');
    // On 7897f2a: FAILED. The query asked the plain key columns, which in GBIF's SQL table are the Catalogue of Life's
    // (docs/COLXR-87.md): `kingdomkey = 6` matched nothing, and GBIF's download of 15 November 2026 held no row.
    const bb = 'occurrence.gbif_classification';
    expect(FLOWERING_SQL).toBe(`SELECT ${bb}.taxonkey AS taxonkey, ${bb}.acceptedtaxonkey AS acceptedtaxonkey, ${bb}.specieskey AS specieskey, "month", reproductivecondition, COUNT(*) AS n FROM occurrence WHERE datasetkey = '50c9509d-22c7-4a22-a47d-8c48425ef4a7' AND ${bb}.kingdomkey = '6' AND reproductivecondition LIKE '%flowers%' GROUP BY ${bb}.taxonkey, ${bb}.acceptedtaxonkey, ${bb}.specieskey, "month", reproductivecondition`);
    expect(floweringRequest()).toEqual({ sendNotification: false, format: 'SQL_TSV_ZIP', sql: FLOWERING_SQL });
    expect(floweringRequest({ creator: 'someone', email: 'someone@example.org' })).toMatchObject({ creator: 'someone', notificationAddresses: ['someone@example.org'], format: 'SQL_TSV_ZIP' });
  });
});

describe('r92a 2: the reader', () => {
  it('"flowers", alone or beside another annotation; never buds, never "no flowers or fruits"', () => {
    for (const c of ['flowers', 'flowers|flower buds', 'fruits or seeds|flowers', ' Flowers ']) expect(isFlowering(c), c).toBe(true);
    for (const c of ['flower buds', 'no flowers or fruits', 'fruits or seeds', '', undefined]) expect(isFlowering(c), String(c)).toBe(false);
  });
  it('columns by name in any order; rows with no month, other annotations and no key left out and counted; the header required', () => {
    const t = parseFloweringRows([
      'n\treproductivecondition\tmonth\tspecieskey\tacceptedtaxonkey\ttaxonkey',
      ['7', 'flowers', '4', '100', '100', '100'].join('\t'),
      ['3', 'flowers|flower buds', '5', '100', '101', '101'].join('\t'),
      ['2', 'no flowers or fruits', '6', '100', '100', '100'].join('\t'),
      ['9', 'flowers', '', '100', '100', '100'].join('\t'),
      ['4', 'flowers', '13', '100', '100', '100'].join('\t'),
      ['1', 'flowers', '7', '', '', ''].join('\t'),
      ['x', 'flowers', '7', '100', '100', '100'].join('\t'),
      ''
    ]);
    expect(t.read).toEqual({ lines: 7, rows: 2, observations: 10, notFlowers: 2, noMonth: 13, noKey: 1, bad: 1 });
    expect(t.rows).toEqual([{ taxon: 100, accepted: 100, species: 100, month: 4, n: 7 }, { taxon: 101, accepted: 101, species: 100, month: 5, n: 3 }]);
    expect(() => parseFloweringRows(['taxonkey\tmonth\tn'])).toThrow(/has no "acceptedtaxonkey" column/);
    expect(() => parseFloweringRows([])).toThrow(/empty/);
  });
});

describe('r92a 3: the keys a page counts under', () => {
  const t = parseFloweringRows([
    HEAD,
    row(10, 10, 10, 3, 'flowers', 5), //   the page's own key
    row(11, 10, 10, 4, 'flowers', 2), //   a synonym of it: accepted key 10
    row(12, 12, 10, 5, 'flowers', 3), //   a variety under it: species key 10
    row(13, 13, 10, 5, 'flowers', 4), //   a variety given to another page
    row(20, 20, 20, 6, 'flowers', 6), //   another key the page reads
    row(21, 20, 20, 7, 'flowers', 8), //   a name under that key Kew holds as another plant: an exception
    row(30, 30, 30, 8, 'flowers', 9) //    another plant altogether
  ]);
  it("the page's own key by taxon, accepted or species key; a key given away left out", () => {
    expect(countUnder(t, { own: 10, extra: [] })).toEqual({ months: [0, 0, 5, 2, 7, 0, 0, 0, 0, 0, 0, 0], keys: [10] });
    expect(countUnder(t, { own: 10, givenAway: new Set([13]), extra: [] }).months).toEqual([0, 0, 5, 2, 3, 0, 0, 0, 0, 0, 0, 0]);
  });
  it("another key's rows, less its exceptions; each row once whichever keys reach it", () => {
    expect(countUnder(t, { own: 10, extra: [{ key: 20, except: [21] }] })).toEqual({ months: [0, 0, 5, 2, 7, 6, 0, 0, 0, 0, 0, 0], keys: [10, 20] });
    expect(countUnder(t, { own: 10, extra: [{ key: 20 }] }).months[6]).toBe(8);
    // Key 12 is under the page's own key already: its rows are not counted twice.
    expect(countUnder(t, { own: 10, extra: [{ key: 12 }] }).months[4]).toBe(7);
    // A page with no key of its own, reading the keys Kew's synonymy gives it.
    expect(countUnder(t, { extra: [{ key: 30 }] })).toEqual({ months: [0, 0, 0, 0, 0, 0, 0, 9, 0, 0, 0, 0], keys: [30] });
  });
});

describe('r92a 4: the fill', () => {
  const t = parseFloweringRows([HEAD, row(10, 10, 10, 4, 'flowers', 12), row(10, 10, 10, 5, 'flowers', 20), row(30, 30, 30, 1, 'flowers', 4)]);
  const api = (months: number[]) => ({ taxon: 1, months, read: '2026-11-10' });
  const page = (key: string, ids: Record<string, number>, flowering?: unknown) => ({ key, name: { scientific: `Plant ${key}` }, ids, ...(flowering ? { flowering } : {}) });
  const keysOf = (d: FloweringGbifPage): PageKeys => (d.ids.gbif ? { own: d.ids.gbif, extra: [] } : d.key === 'k3' ? { extra: [{ key: 30 }] } : { extra: [] });
  const pages = () => memStore({
    'k1.json': page('k1', { gbif: 10, inat: 1 }, api([0, 0, 0, 15, 25, 0, 0, 0, 0, 0, 0, 0])),
    'k2.json': page('k2', { gbif: 99 }),
    'k3.json': page('k3', {}),
    'k4.json': page('k4', { inat: 4 }, api(Array(12).fill(1)))
  });
  it('every page with a key written, twelve zeros where the download holds none; the API count taken off a page with no key', () => {
    const s = pages();
    const c = fillFloweringGbif(s, t, DL, '2026-11-16', keysOf);
    expect(s.m.get('k1.json')).toMatchObject({ flowering: { source: 'gbif', key: 10, keys: [10], months: [0, 0, 0, 12, 20, 0, 0, 0, 0, 0, 0, 0], doi: DL.doi, made: '2026-11-15', read: '2026-11-16' } });
    expect(s.m.get('k2.json')).toMatchObject({ flowering: { source: 'gbif', key: 99, keys: [], months: Array(12).fill(0) } });
    expect((s.m.get('k3.json') as { flowering: { key?: number; keys: number[] } }).flowering).toMatchObject({ keys: [30], months: [4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
    expect((s.m.get('k3.json') as { flowering: { key?: number } }).flowering.key).toBeUndefined();
    expect(s.m.get('k4.json')).not.toHaveProperty('flowering');
    expect(c).toMatchObject({ pages: 4, counted: 2, none: 1, noKey: 1, apiDropped: 1, same: 0 });
    for (const f of ['k1.json', 'k2.json', 'k3.json']) expect(() => v.parse(FloweringSchema, (s.m.get(f) as { flowering: unknown }).flowering)).not.toThrow();
    // Again from the same download: every page passed by, nothing written.
    s.writes.length = 0;
    expect(fillFloweringGbif(s, t, DL, '2026-11-17', keysOf).same).toBe(3);
    expect(s.writes).toEqual([]);
  });
  it('the dry run writes no page, and says the same figures', () => {
    const s = pages();
    const c = fillFloweringGbif(s, t, DL, '2026-11-16', keysOf, { dryRun: true });
    expect(s.writes).toEqual([]);
    expect(c).toMatchObject({ counted: 2, none: 1, noKey: 1, apiDropped: 1 });
    expect(c.compared).toEqual([expect.objectContaining({ page: 'k1', api: 40, gbif: 32, ratio: 0.8, peakApi: 4, peakGbif: 4, tenthSame: true })]);
  });
  it('the comparison: ratios, peaks a month apart on the year\'s circle, the pages sharply apart', () => {
    expect(monthsApart(0, 11)).toBe(1);
    expect(monthsApart(2, 7)).toBe(5);
    const near = compare('a', 'A', [0, 0, 10, 40, 20, 0, 0, 0, 0, 0, 0, 0], [0, 0, 8, 30, 15, 0, 0, 0, 0, 0, 0, 0]);
    const lost = compare('b', 'B', [0, 0, 0, 0, 0, 0, 0, 0, 0, 200, 50, 0], Array(12).fill(0));
    const far = compare('c', 'C', [0, 0, 0, 0, 0, 0, 0, 0, 0, 60, 0, 0], [60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect([near, lost, far].map(sharplyApart)).toEqual([false, true, true]);
    expect(compareFigures([near, lost, far])).toMatchObject({ compared: 3, both: 2, big: 2, peakWithin1: 50, over100: 1, lostOver100: 100, apiOnly: 1, gbifOnly: 0 });
  });
});

/** The fill's output for a run of `n` pages compared, `bad` of them a taxon mismatch, as the plans' reviews read it. */
function output(o: { n: number; ratio?: number; bad?: number; noKey?: number; dryRun?: boolean }) {
  const rows = [HEAD];
  const pages: Record<string, unknown> = {};
  for (let i = 0; i < o.n; i++) {
    const k = 1000 + i;
    const api = [0, 0, 10, 40, 20, 0, 0, 0, 0, 0, 0, 0].map((x) => x * 3);
    const mismatch = i < (o.bad ?? 0);
    const gb = mismatch ? Array(12).fill(0) : api.map((x) => Math.round(x * (o.ratio ?? 0.8)));
    gb.forEach((n, m) => { if (n) rows.push(row(k, k, k, m + 1, 'flowers', n)); });
    pages[`k${k}.json`] = { key: `k${k}`, name: { scientific: `P${k}` }, ids: { gbif: k, inat: k }, flowering: { taxon: k, months: api, read: '2026-11-10' } };
  }
  for (let i = 0; i < (o.noKey ?? 10); i++) pages[`n${i}.json`] = { key: `n${i}`, name: { scientific: `N${i}` }, ids: {} };
  for (let i = o.n + (o.noKey ?? 10); i < 48375; i++) pages[`z${i}.json`] = { key: `z${i}`, name: { scientific: `Z${i}` }, ids: { gbif: 1 } };
  const t = parseFloweringRows(rows);
  const s = memStore(pages);
  const c = fillFloweringGbif(s, t, DL, '2026-11-16', (d) => (d.ids.gbif ? { own: d.ids.gbif, extra: [] } : { extra: [] }), { dryRun: o.dryRun ?? true });
  return floweringGbifLine(c, t, DL, o.dryRun ?? true);
}

describe('r92a 5: the plans', () => {
  const first = parsePlan(readFileSync('scripts/corpus-plan-r92-flowering.txt', 'utf8'));
  const monthly = parsePlan(readFileSync('scripts/corpus-plan-r92-monthly.txt', 'utf8'));
  it('the round: a backup, the dry run, a review on figures, a review that always stops, then the fill, the index, the upload, the live check', () => {
    expect(first.map((s) => s.line.split(/\s+/).slice(0, 6).join(' '))).toEqual([
      'backup', 'dossier --fill flowering-gbif --bulk bulk --dry-run', 'review Read the dry run\'s three', 'review The figures held. Now read',
      'dossier --fill flowering-gbif --bulk bulk', 'dossier --index', 'upload', 'live-check'
    ]);
    expect(first[3].expects ?? []).toEqual([]);
  });
  it("the first review: within its conditions it carries on; a low ratio, a peak moved, the API's big pages lost, too many with no key: a stop", { timeout: 60_000 }, () => {
    const review = first[2];
    const ok = runChecks(review.expects, output({ n: 200 }));
    expect(ok.lines.filter((l: string) => l.startsWith('  ✗'))).toEqual([]);
    expect(ok.pass).toBe(true);
    expect(runChecks(review.expects, output({ n: 200, ratio: 0.5 })).pass).toBe(false);
    expect(runChecks(review.expects, output({ n: 200, bad: 10 })).pass).toBe(false);
    expect(runChecks(review.expects, output({ n: 200, noKey: 1200 })).pass).toBe(false);
    expect(runChecks(review.expects, `${output({ n: 200 })}\n  not counted, nothing written: no bulk/flowering-download.json`).pass).toBe(false);
  });
  it("the monthly refresh: the fill's own line read; a short run or a refusal stops it", { timeout: 60_000 }, () => {
    expect(monthly.map((s) => s.line.split(/\s+/).slice(0, 3).join(' '))).toEqual(['dossier --fill flowering-gbif', 'review Read the', 'dossier --index', 'upload', 'live-check']);
    const review = monthly[1];
    expect(runChecks(review.expects, output({ n: 20, dryRun: false })).pass).toBe(true);
    expect(runChecks(review.expects, output({ n: 20, dryRun: false, noKey: 1500 })).pass).toBe(false);
  });
  it('the daily plan no longer counts flowering; BHL keeps it alone', () => {
    const daily = parsePlan(readFileSync('scripts/corpus-plan-r87-daily.txt', 'utf8'));
    expect(daily.filter((s) => s.daily).map((s) => s.line)).toEqual(['daily dossier --fill bhl']);
    expect(daily.some((s) => /--fill flowering\b/.test(s.line))).toBe(false);
  });
});

describe("r92a 6: the page's words, the record, the carry", () => {
  const gbif = { source: 'gbif' as const, key: 10, keys: [10], months: [0, 0, 3, 9, 14, 6, 1, 0, 0, 0, 0, 0], doi: '10.15468/dl.test92', made: '2026-11-15', read: '2026-11-16' };
  it('the download cited as GBIF asks, its DOI the link; what was counted; never the API\'s words', () => {
    const view = floweringView({ ids: { gbif: 10, inat: 7 }, flowering: gbif });
    expect(view).toMatchObject({ state: 'read', source: 'gbif', total: 33, made: '2026-11-15', href: 'https://doi.org/10.15468/dl.test92' });
    const h = html({ dossier: { ids: { gbif: 10, inat: 7 }, flowering: gbif } });
    expect(h).toContain('Flowering observations of wild plants on iNaturalist, as iNaturalist shares them with GBIF: GBIF.org (2026-11-15) GBIF Occurrence Download');
    expect(h).toContain('href="https://doi.org/10.15468/dl.test92"');
    expect(h.replace(/<span class="term[^"]*"[^>]*><button[^>]*>([^<]*)<\/button><span class="tip[^"]*"[^>]*><\/span><\/span>/g, '$1')).toContain("33 observations, research grade, openly licensed (CC0, CC BY or CC BY-NC), counted under the page's GBIF keys."); // round 103: 'research grade' is a word with a tip
    expect(h).not.toContain('inaturalist.org/observations');
  });
  it("twelve zeros said as the download's answer, never as a plant that does not flower", () => {
    const h = html({ dossier: { ids: { gbif: 10 }, flowering: { ...gbif, months: Array(12).fill(0) } } });
    // On b9963f7: FAILED. The sentence said none "in GBIF's download"; on Peucedanum palustre (GBIF files iNaturalist's
    // 2,893 observations of it under Apiaceae) the download holds them, under the family, not under the page's keys.
    expect(h).toContain("No research-grade observation of a wild plant that iNaturalist shares with GBIF is annotated flowering under this page's GBIF keys, in GBIF's download.");
    expect(h).not.toMatch(/does not flower|\bnone\b/i);
  });
  it('"not asked" says why: no key, or not counted yet (a page reading other keys has one)', () => {
    expect(floweringView({ ids: {} })).toEqual({ state: 'not-asked', why: FLOWERING_NO_KEY });
    expect(floweringView({ ids: { gbif: 10 } })).toEqual({ state: 'not-asked', why: FLOWERING_NOT_YET });
    expect(floweringView({ ids: {}, occurrences: { keys: [{}] } })).toEqual({ state: 'not-asked', why: FLOWERING_NOT_YET });
  });
  it('the record: the download\'s form and the API\'s both read; a malformed one refused', () => {
    expect(v.parse(FloweringSchema, gbif)).toEqual(gbif);
    expect(v.parse(FloweringSchema, { taxon: 1, months: Array(12).fill(0), read: '2026-11-09' })).toMatchObject({ taxon: 1 });
    expect(() => v.parse(FloweringSchema, { ...gbif, months: Array(11).fill(0) })).toThrow();
    expect(() => v.parse(FloweringSchema, { ...gbif, doi: undefined })).toThrow();
  });
  it("carried by a build while the page's own key is the one counted under; the old fill passes a counted page by", () => {
    const d1: Record<string, unknown> = { ids: { gbif: 10, inat: 7 } };
    carryLinks({ ids: { gbif: 10, inat: 7 }, flowering: gbif } as never, d1 as never);
    expect(d1.flowering).toEqual(gbif);
    const d2: Record<string, unknown> = { ids: { gbif: 11, inat: 7 } };
    carryLinks({ ids: { gbif: 10, inat: 7 }, flowering: gbif } as never, d2 as never);
    expect(d2.flowering).toBeUndefined();
    expect(floweringWanted({ ids: { inat: 7 }, flowering: gbif })).toBe(false);
  });
});

describe('r92a 7: the loader', () => {
  const dir = () => mkdtempSync(join(tmpdir(), 'r92a-'));
  const meta = (d: string, o: Record<string, unknown>) => writeFileSync(join(d, 'flowering-download.json'), JSON.stringify(o));
  it('a download read whole from its zip, with its key, DOI and day', async () => {
    const d = dir();
    writeZip(join(d, 'flowering.zip'), { '0000001-261115000000000.csv': [HEAD, row(10, 10, 10, 4, 'flowers', 12), row(10, 10, 10, 5, 'no flowers or fruits', 3), ''].join('\n') });
    meta(d, { key: DL.key, doi: DL.doi, created: '2026-11-15T09:12:00.000+00:00', records: 2, csv: '0000001-261115000000000.csv', fetched: '2026-11-15T10:00:00Z' });
    const r = await loadFloweringDownload(d);
    expect('refused' in r).toBe(false);
    if ('refused' in r) return;
    expect(r.dl).toEqual(DL);
    expect(r.table.read).toMatchObject({ lines: 2, rows: 1, observations: 12, notFlowers: 3 });
  });
  it('refused, nothing taken: no state, not fetched, no DOI, a count that is not the file\'s', async () => {
    const d = dir();
    expect(await loadFloweringDownload(d)).toEqual({ refused: expect.stringMatching(/no .*flowering-download\.json: ask GBIF for the download first/) });
    meta(d, { key: DL.key });
    expect(await loadFloweringDownload(d)).toEqual({ refused: expect.stringMatching(/is not fetched yet/) });
    meta(d, { key: DL.key, created: '2026-11-15', csv: 'x.csv', fetched: 'x' });
    expect(await loadFloweringDownload(d)).toEqual({ refused: expect.stringMatching(/has no DOI: a page could not cite it/) });
    writeZip(join(d, 'flowering.zip'), { 'x.csv': [HEAD, row(10, 10, 10, 4, 'flowers', 12), ''].join('\n') });
    meta(d, { key: DL.key, doi: DL.doi, created: '2026-11-15', records: 5, csv: 'x.csv', fetched: 'x' });
    expect(await loadFloweringDownload(d)).toEqual({ refused: expect.stringMatching(/holds 1 rows and 12 observations, and GBIF counts 5: not the whole download/) });
  });
  // On 7897f2a: FAILED. GBIF's first answer (0008674-261110092616502, 15 November 2026) held no row; the loader took it,
  // and the fill would have said "none in the download" on every page with a key.
  // GBIF's download of 15 November 2026 (0008715-261110092616502) begins with a byte-order mark before "taxonkey".
  it('a header that begins with a byte-order mark, as GBIF writes it, is read by name', async () => {
    const d = dir();
    writeZip(join(d, 'flowering.zip'), { 'x.csv': ['﻿' + HEAD, row(10, 10, 10, 4, 'flowers', 12), ''].join('\n') });
    meta(d, { key: DL.key, doi: DL.doi, created: '2026-11-15', records: 1, csv: 'x.csv', fetched: 'x' });
    const r = await loadFloweringDownload(d);
    expect(r).toMatchObject({ table: { read: { lines: 1, rows: 1, observations: 12 } } });
  });
  it('refused, nothing taken: a download with no observation annotated flowers', async () => {
    const d = dir();
    writeZip(join(d, 'flowering.zip'), { 'x.csv': [HEAD, ''].join('\n') });
    meta(d, { key: DL.key, doi: DL.doi, created: '2026-11-15', records: 0, csv: 'x.csv', fetched: 'x' });
    expect(await loadFloweringDownload(d)).toEqual({ refused: expect.stringMatching(/holds no observation annotated flowers \(0 rows\): an empty answer from GBIF, not a count of none/) });
    writeZip(join(d, 'flowering.zip'), { 'x.csv': [HEAD, row(10, 10, 10, 4, 'no flowers or fruits', 3), ''].join('\n') });
    meta(d, { key: DL.key, doi: DL.doi, created: '2026-11-15', records: 1, csv: 'x.csv', fetched: 'x' });
    expect(await loadFloweringDownload(d)).toEqual({ refused: expect.stringMatching(/holds no observation annotated flowers \(1 rows\)/) });
  });
});
