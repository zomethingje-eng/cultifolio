/**
 * Round eighty-two, agent F: review 1's 7, its real remainder. Of the rows not "ok" with no reason, the iNaturalist rows
 * awaiting the fill and the "none" answers the page says as such are not faults; what is left is a row the page cannot
 * word: Bisnaga hamatacantha's range ("wcvp.distribution" none, 461 open records, no range, no reason) and Wikidata
 * "none" rows with no reason (eight pages built on 2026-10-21 and 22). On the reviewers' copies of 9,463 live dossiers:
 * 10 pages, 2 ranges and 8 Wikidata rows. Now the build says why, and `--list-no-reason` lists the pages built before.
 * Each case FAILED on r82base: the range and Wikidata rows were a bare "none", and there is no `no-reason.ts`, no
 * `wikidataSaid` and no `--list-no-reason`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { WcvpIndex, bulkFetcher, type WcvpName, type WcvpDist } from '$dossier/bulk';
import { distributions } from '$dossier/sources/gbif';
import * as build from '$dossier/build';
import { NO_ITEM } from '$dossier/sources/wikimedia';
import { fixtureFetcher, type JsonFetcher } from '$dossier/fetch';

const root = resolve('.');
const GBIF = 'https://api.gbif.org/v1';
const nm = (id: string, name: string, status: string, acceptedId: string, authors: string): WcvpName => ({ id, name, status, acceptedId, rank: 'Species', authors });
const ds = (id: string, l3: string, area: string): WcvpDist => ({ id, l3, area, introduced: false, extinct: false, doubtful: false });

describe("Bisnaga hamatacantha's range: a none from Kew's files says why", () => {
  // Kew's file of 2026-06-04 holds Ferocactus hamatacanthus and Echinocactus hamatacanthus, and no row of Bisnaga hamatacantha.
  const kew = () => { const k = new WcvpIndex(); for (const r of [nm('2808164', 'Ferocactus hamatacanthus', 'Accepted', '2808164', '(Muehlenpf.) Britton & Rose'), nm('2781860', 'Echinocactus hamatacanthus', 'Synonym', '2808164', 'Muehlenpf.')]) k.addName(r, () => true); k.addDist(ds('2808164', 'TEX', 'Texas')); k.fileDay = '2026-06-04'; return k; };
  const fetcher = (syn: unknown[]) => {
    const base = fixtureFetcher({ [`${GBIF}/species/7281739`]: { key: 7281739, canonicalName: 'Bisnaga hamatacantha', authorship: '(Muehlenpf.) Orcutt', family: 'Cactaceae' }, [`${GBIF}/species/7281739/distributions?limit=200`]: { results: [], endOfRecords: true } }, { status: 'none' } as never);
    const answer = (async (url: string) => (url.startsWith(`${GBIF}/species/7281739/synonyms`) ? { status: 'ok', data: { results: syn, endOfRecords: true } } : base(url))) as JsonFetcher;
    return bulkFetcher(answer, { wcvp: kew() }) as JsonFetcher;
  };
  it('GBIF lists no older name for it, and GBIF holds no checklist range', async () => {
    const f = fetcher([]);
    await f(`${GBIF}/species/7281739`);
    expect(await distributions(f, 7281739)).toEqual({ status: 'none', detail: "Kew's file of 2026-06-04 holds no row of Bisnaga hamatacantha (Muehlenpf.) Orcutt, and GBIF lists no older name for it; GBIF holds no national checklist's range for it" });
  });
  it('older names that lead to no species Kew accepts with a range are counted', async () => {
    const f = fetcher([{ key: 1, scientificName: 'Bisnaga x Mill.', canonicalName: 'Bisnaga x', authorship: 'Mill.', rank: 'SPECIES', taxonomicStatus: 'SYNONYM' }]);
    await f(`${GBIF}/species/7281739`);
    expect(await distributions(f, 7281739)).toMatchObject({ status: 'none', detail: expect.stringContaining("and none of GBIF's 1 older name for it leads to one species Kew accepts with a native range") });
  });
});

describe('a Wikidata "none" says why', () => {
  it('no route found an item: the words --fill wikidata writes; with the older names not asked, those (guard on their words)', () => {
    const said = (build as unknown as { wikidataSaid?: typeof build.wikidataSaid }).wikidataSaid;
    expect(said?.({ status: 'none' })).toEqual({ status: 'none', detail: NO_ITEM });
    expect(said?.({ status: 'none' }, 'older names not asked: GBIF synonyms refused')).toEqual({ status: 'none', detail: 'older names not asked: GBIF synonyms refused' });
    expect(said?.({ status: 'none', detail: 'not taken: x' })).toEqual({ status: 'none', detail: 'not taken: x' });
  });
  it('the build writes the row through it', () => {
    expect(readFileSync('src/lib/dossier/build.ts', 'utf8')).toContain("else mark('wikidata', wikidataSaid(x, olderNotAsked));");
  });
});

describe('the real remainder, and --list-no-reason', () => {
  const page = (key: string, name: string, upstream: Record<string, { status: string; detail?: string }>, climate?: { status: string; detail?: string }) => ({ key, name: { scientific: name }, upstream, ...(climate ? { climate } : {}) });
  const PAGES = [
    page('g7281739', 'Bisnaga hamatacantha', { 'wcvp.distribution': { status: 'none' }, wikipedia: { status: 'none' }, 'inat.taxon': { status: 'skipped' }, climate: { status: 'none' } }, { status: 'none', detail: 'native range not verified: …' }),
    page('k2948609', 'Fragaria ananassa', { wikidata: { status: 'none' }, commons: { status: 'none' }, 'gbif.media': { status: 'none' }, 'inat.photos.cultivated': { status: 'skipped' } }),
    page('k2781134', 'Echeveria elegans', { wikidata: { status: 'ok' }, openalex: { status: 'none' }, climate: { status: 'none' } }, { status: 'none', detail: 'no records' })
  ];
  it('leaves out the rows awaiting the fill and the answers the page says as such', async () => {
    const m = await import('$dossier/no-reason').catch(() => null);
    expect(m).not.toBeNull();
    expect(PAGES.map((d) => m!.rowsWithoutReason(d))).toEqual([['wcvp.distribution'], ['wikidata'], []]);
  });
  it('the real builder writes rebuild-no-reason.txt for (d)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'r82f-noreason-'));
    const v3 = join(dir, 'static/s/v3');
    mkdirSync(v3, { recursive: true });
    for (const p of PAGES) {
      const d = JSON.parse(readFileSync('fixtures/dossiers/s/v3/k339841.json', 'utf8'));
      Object.assign(d, { key: p.key, upstream: p.upstream, ...(p.climate ? { climate: p.climate } : {}) });
      d.name.scientific = p.name.scientific;
      writeFileSync(join(v3, `${p.key}.json`), JSON.stringify(d));
    }
    const r = spawnSync(process.execPath, ['--import', pathToFileURL(join(root, 'node_modules/tsx/dist/loader.mjs')).href, join(root, 'scripts/build-dossiers.ts'), '--list-no-reason'], { cwd: dir, encoding: 'utf8', env: { ...process.env, TSX_TSCONFIG_PATH: join(root, 'tsconfig.json') } });
    expect(r.stdout).toMatch(/2 pages with a row not ok and no reason \(wcvp\.distribution 1, wikidata 1\) → rebuild-no-reason\.txt/);
    expect(existsSync(join(dir, 'rebuild-no-reason.txt'))).toBe(true);
    expect(readFileSync(join(dir, 'rebuild-no-reason.txt'), 'utf8')).toBe('g7281739 Bisnaga hamatacantha\twcvp.distribution: not ok, and no reason given\nk2948609 Fragaria ananassa\twikidata: not ok, and no reason given\n');
  });
});
