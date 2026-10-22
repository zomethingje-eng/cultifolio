/**
 * Round eighty, agent I: the wild sets and the CC0 credits.
 *   - `/about/how` said the wild photographs come from the open data, but 48 of 68 sampled old pages kept sets the API gave
 *     before it (round seventy-eight's), which the open data's pass passed by as settled. The fill now reads such a set
 *     again as the rule reads it: from the open data, at no request, where its set is the whole set (24 observations or
 *     fewer); else the API's 24 most voted (agent V's rule), several taxa a search. A set of a taxon the open data does
 *     not hold is the API's by the rule, and stays.
 *   - 492 CC0 photographs from iNaturalist named no author: the API and the open data write "no rights reserved" alone.
 *     The credit now names the observer (`cc0Credit`), and a set holding such a credit is read again.
 * Each case FAILED on r80f unless it says "guard": there `cc0Credit` does not exist, a CC0 credit is "no rights
 * reserved", and the fill passes by an API-era set and a set whose credits name no one.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { FetchResult, JsonFetcher } from '$dossier/fetch';
import * as open from '$dossier/inat-open';
import * as inat from '$dossier/sources/inat';
import { creditWithoutMail } from '$dossier/photo-kind';
import { tileCreditOf } from '$lib/ui/ref/head';

const batchMod = await import('$dossier/inat-batch').catch(() => null);
const DAY = '2026-09-27';
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const openObs = (n: number, taxon: number, who: { login: string; name: string }, licence = 'cc0') => ({
  id: uuid(n), uuid: uuid(n), observed_on: '2024-03-01', quality_grade: 'research', taxon: { id: taxon, name: 'Copiapoa cinerea', rank: 'species' }, user: { id: n, ...who },
  photos: [{ id: n * 7, license_code: licence, url: `${open.OPEN_DATA}/photos/${n * 7}/square.jpg`, attribution: open.attributionOf(licence, who.name, who.login), original_dimensions: { width: 2048, height: 1536 } }]
});
const apiObs = (n: number, taxon: number, votes: number) => ({ ...openObs(n, taxon, { login: `obs${n}`, name: `Observer ${n}` }), id: 900_000 + n, cached_votes_total: votes, captive: false, place_guess: 'Taltal, Chile', taxon: { id: taxon, name: 'Copiapoa cinerea', rank: 'species', ancestor_ids: [47126, taxon] } });

describe("a CC0 photograph's credit names its observer", () => {
  it('the name, or the login where there is no name; no "(c)"', () => {
    const cc0Credit = (inat as unknown as { cc0Credit?: (a: string, u: object) => string }).cc0Credit;
    expect(cc0Credit).toBeTypeOf('function');
    expect(cc0Credit!('no rights reserved', { login: 'whiteoak', name: 'Alan Weakley' })).toBe('Alan Weakley, no rights reserved (CC0)');
    expect(cc0Credit!('no rights reserved', { login: 'mfeaver', name: '' })).toBe('mfeaver, no rights reserved (CC0)');
    expect(cc0Credit!('no rights reserved', undefined as never)).toBe('no rights reserved'); // guard: no observer, nothing invented
    expect(cc0Credit!('(c) Jo, some rights reserved (CC BY)', { login: 'x', name: 'X' })).toBe('(c) Jo, some rights reserved (CC BY)'); // guard
    // The tile reads it as CC0 and the observer; an address is never the author (guard: as for the other licences).
    expect(tileCreditOf({ licence: 'cc0', attribution: 'Alan Weakley, no rights reserved (CC0)' })).toBe('CC0, Alan Weakley');
    expect(creditWithoutMail({ src: 'inat', licence: 'cc0', attribution: 'jo@example.org, no rights reserved (CC0)' })).toBe('author not stated, no rights reserved (CC0)');
  });

  it("inat.photos names the observer the API's and the open data's observation gives", async () => {
    const f = (async <T,>(): Promise<FetchResult<T>> => ({ status: 'ok', data: { results: [apiObs(1, 135254, 0), openObs(2, 135254, { login: 'bo', name: '' })] } as T })) as JsonFetcher;
    const r = await inat.photos(f, 135254, true, 24);
    expect(r.status === 'ok' && r.data.map((p) => p.attribution)).toEqual(['Observer 1, no rights reserved (CC0)', 'bo, no rights reserved (CC0)']); // r80f: "no rights reserved" twice
  });
});

describe('the fill, run', () => {
  const root = resolve('.');
  /** API-era photographs: numbered pages, a place, CC0 credits naming no one. */
  const apiEra = (n: number, captive = false) => Array.from({ length: n }, (_, i) => ({ src: 'inat', id: String(5000 + i), url: `${open.OPEN_DATA}/photos/${5000 + i}/large.jpg`, thumb: `${open.OPEN_DATA}/photos/${5000 + i}/medium.jpg`, licence: 'cc0', attribution: 'no rights reserved', page: `https://www.inaturalist.org/observations/${7000 + i}`, captive, place: 'Taltal, Chile' }));
  function folder() {
    const dir = mkdtempSync(join(tmpdir(), 'r80i-sets-'));
    const v3 = join(dir, 'static/s/v3');
    mkdirSync(v3, { recursive: true });
    const read = (k: string) => JSON.parse(readFileSync(`fixtures/dossiers/s/v3/${k}.json`, 'utf8'));
    const checked = (id: number) => ({ status: 'ok', at: '2026-10-20T00:00:00.000Z', detail: `iNaturalist's taxon ${id} is active` });
    const cultivated = { status: 'none', at: '2026-10-21T00:00:00.000Z', detail: `${inat.CULTIVATED_RULE}; filled 2026-10-21` };
    const carried = { status: 'ok', at: '2026-09-29T00:00:00.000Z', detail: 'carried from build of 2026-09-29; this build: skipped' };
    // Copiapoa cinerea (135254): an API-era wild set; the open data holds 2 of its taxon, the whole set.
    const cop = read('k2735933');
    Object.assign(cop.upstream, { 'inat.taxon': checked(135254), 'inat.photos.wild': carried, 'inat.photos.cultivated': cultivated });
    cop.photos = [...apiEra(3), ...cop.photos.filter((p: { src: string }) => p.src !== 'inat')];
    // Welwitschia (75434): an API-era wild set of a taxon the open data holds 40 of: the most voted, asked; with a CC0
    // cultivated photograph naming no one: its set asked again.
    const wel = read('k339841');
    Object.assign(wel.upstream, { 'inat.taxon': checked(75434), 'inat.photos.wild': carried, 'inat.photos.cultivated': { ...cultivated, status: 'ok' } });
    wel.photos = [...apiEra(2), ...apiEra(1, true), ...wel.photos.filter((p: { src: string }) => p.src !== 'inat')];
    // Copiapoa humilis under a taxon the open data does not hold (newer than the export): the API's set by the rule; stays.
    const hum = read('k2735990');
    hum.ids.inat = 123456;
    Object.assign(hum.upstream, { 'inat.taxon': checked(123456), 'inat.photos.wild': { status: 'ok', at: '2026-10-21T00:00:00.000Z', detail: 'filled 2026-10-21' }, 'inat.photos.cultivated': cultivated });
    hum.photos = apiEra(1).map((p) => ({ ...p, attribution: '(c) Jo, some rights reserved (CC BY)', licence: 'by' }));
    for (const [k, d] of [['k2735933', cop], ['k339841', wel], ['k2735990', hum]] as const) writeFileSync(join(v3, `${k}.json`), JSON.stringify(d));
    const path = join(dir, 'inat-wild.jsonl');
    writeFileSync(path, [JSON.stringify({ inatOpenWild: 1, day: DAY, read: '2026-10-20T00:00:00.000Z', files: {}, keep: 24, rule: open.openWildDetail(DAY), counts: {} }),
      JSON.stringify({ t: 135254, n: 2, results: [openObs(1, 135254, { login: 'ann', name: 'Ann Observer' }), openObs(2, 135254, { login: 'bo', name: '' }, 'cc-by')] }),
      JSON.stringify({ t: 75434, n: 40, results: Array.from({ length: 24 }, (_, i) => openObs(100 + i, 75434, { login: 'cy', name: 'Cy' })) })].join('\n') + '\n');
    const answers = batchMod ? {
      [batchMod.lightUrl('wild', [75434], 24)]: { total_results: 40, results: [apiObs(1, 75434, 5), apiObs(2, 75434, 0)] },
      [batchMod.lightUrl('cultivated', [75434], 12)]: { total_results: 1, results: [{ ...apiObs(3, 75434, 0), captive: true, quality_grade: 'casual', community_taxon_id: 75434, num_identification_disagreements: 0, identifications: [{ current: true, taxon: { id: 75434 } }, { current: true, taxon: { id: 75434 } }] }] }
    } : {};
    writeFileSync(join(dir, 'answers.json'), JSON.stringify(answers));
    writeFileSync(join(dir, 'fake.mjs'), `import { appendFileSync, readFileSync } from 'node:fs';\nconst answers = JSON.parse(readFileSync(${JSON.stringify(join(dir, 'answers.json'))}, 'utf8'));\nglobalThis.fetch = async (u) => { const url = String(u); appendFileSync(${JSON.stringify(join(dir, 'asked.txt'))}, url + '\\n'); const a = answers[url]; if (a) return new Response(JSON.stringify(a), { status: 200, headers: { 'content-type': 'application/json' } }); throw new TypeError('fetch failed'); };\n`);
    return { dir, v3, hum };
  }
  const fill = (dir: string, ...more: string[]) => spawnSync(process.execPath, ['--import', pathToFileURL(join(dir, 'fake.mjs')).href, '--import', pathToFileURL(join(root, 'node_modules/tsx/dist/loader.mjs')).href, join(root, 'scripts/build-dossiers.ts'), '--fill', 'inat', '--inat-open', join(dir, 'inat-wild.jsonl'), '--no-cache', ...more], { cwd: dir, encoding: 'utf8', env: { ...process.env, TSX_TSCONFIG_PATH: join(root, 'tsconfig.json'), CULTIFOLIO_INAT_WAITS: '0' } });
  const askedIn = (dir: string) => (existsSync(join(dir, 'asked.txt')) ? readFileSync(join(dir, 'asked.txt'), 'utf8').trim().split('\n') : []);
  const page = (v3: string, k: string) => JSON.parse(readFileSync(join(v3, `${k}.json`), 'utf8'));
  type Ph = { src: string; captive?: boolean; page: string; attribution: string; place?: string };

  it('reads an API-era wild set again from the open data where it is the whole set, else the most voted; a CC0 set naming no one is asked again; a taxon the file does not hold stays', () => {
    if (!batchMod) throw new Error('src/lib/dossier/inat-batch.ts is missing');
    const { dir, v3, hum } = folder();
    const r = fill(dir);
    expect(r.stderr).not.toMatch(/Error/);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/\(2 whose wild set the API gave before the open data, read again; 2 with a CC0 photograph whose credit names no one, read again\)/);
    // Two requests: Welwitschia's most voted and its cultivated set. Copiapoa cinerea's from the file, at none.
    expect(askedIn(dir).sort()).toEqual([batchMod.lightUrl('cultivated', [75434], 12), batchMod.lightUrl('wild', [75434], 24)].sort());
    const cop = page(v3, 'k2735933');
    expect(cop.upstream['inat.photos.wild'].detail).toMatch(/^from iNaturalist's open data of 2026-09-27: .*; filled \d{4}-\d{2}-\d{2}$/);
    const copWild = cop.photos.filter((p: Ph) => p.src === 'inat' && !p.captive);
    expect(copWild.map((p: Ph) => [p.page, p.attribution, p.place])).toEqual([[`https://www.inaturalist.org/observations/${uuid(1)}`, 'Ann Observer, no rights reserved (CC0)', undefined], [`https://www.inaturalist.org/observations/${uuid(2)}`, '(c) bo, some rights reserved (CC BY)', undefined]]);
    const wel = page(v3, 'k339841');
    expect(wel.upstream['inat.photos.wild'].detail).toMatch(/^from iNaturalist's API: .*the observations iNaturalist puts first by votes, 24 of them \(the open data of 2026-09-27 holds 40, and no votes\); filled/);
    expect(wel.photos.filter((p: Ph) => p.src === 'inat' && !p.captive).map((p: Ph) => p.attribution)).toEqual(['Observer 1, no rights reserved (CC0)', 'Observer 2, no rights reserved (CC0)']);
    expect(wel.photos.filter((p: Ph) => p.src === 'inat' && p.captive).map((p: Ph) => p.attribution)).toEqual(['Observer 3, no rights reserved (CC0)']);
    // No photograph left whose CC0 credit names no one.
    for (const d of [cop, wel]) expect(d.photos.filter((p: Ph & { licence?: string }) => p.src === 'inat' && p.licence === 'cc0' && p.attribution === 'no rights reserved')).toEqual([]);
    // The taxon the file does not hold: as it was (guard).
    expect(page(v3, 'k2735990').upstream['inat.photos.wild']).toEqual(hum.upstream['inat.photos.wild']);
    // Again: nothing to ask.
    const again = fill(dir);
    expect(again.stdout).toMatch(/3 dossiers on disk; 0 without iNaturalist's photographs/);
    expect(askedIn(dir).length).toBe(2);
    rmSync(dir, { recursive: true, force: true });
  }, 180_000);

  it('--wild reads again, from the file alone, only the API-era sets that are the whole set (asking nothing)', () => {
    if (!batchMod) throw new Error('src/lib/dossier/inat-batch.ts is missing');
    const { dir, v3 } = folder();
    const r = fill(dir, '--wild');
    expect(r.status).toBe(0);
    expect(askedIn(dir)).toEqual([]);
    expect(page(v3, 'k2735933').upstream['inat.photos.wild'].detail).toMatch(/^from iNaturalist's open data of 2026-09-27/);
    // More than 24: the most voted is the API's to give, so --wild leaves it for the fill.
    expect(page(v3, 'k339841').upstream['inat.photos.wild'].detail).toBe('carried from build of 2026-09-29; this build: skipped');
    rmSync(dir, { recursive: true, force: true });
  }, 180_000);
});

describe("Kew's reading of descendants, in the fill itself", () => {
  const root = resolve('.');
  it("a page Kew's file makes a candidate, not yet read against it, has its set read again with Kew's filter from the open data and is marked, so its taxon's children are not asked", () => {
    const dir = mkdtempSync(join(tmpdir(), 'r80i-kew-'));
    const v3 = join(dir, 'static/s/v3');
    const bulk = join(dir, 'bulk');
    mkdirSync(v3, { recursive: true });
    mkdirSync(bulk);
    // Kew places Copiapoa cinerea var. columna-alba under Copiapoa columna-alba, another species.
    writeFileSync(join(bulk, 'wcvp_names.csv'), ['plant_name_id|taxon_name|taxon_status|accepted_plant_name_id|ipni_id', '1|Copiapoa cinerea|Accepted||1-1', '2|Copiapoa columna-alba|Accepted||2-1', '3|Copiapoa cinerea var. columna-alba|Synonym|2|3-1'].join('\n') + '\n');
    const cop = JSON.parse(readFileSync('fixtures/dossiers/s/v3/k2735933.json', 'utf8'));
    Object.assign(cop.upstream, {
      'inat.taxon': { status: 'ok', at: '2026-10-20T00:00:00.000Z', detail: "iNaturalist's taxon 135254 is active" },
      'inat.photos.wild': { status: 'ok', at: '2026-10-21T00:00:00.000Z', detail: `${open.openWildDetail(DAY)}; filled 2026-10-21` },
      'inat.photos.cultivated': { status: 'none', at: '2026-10-21T00:00:00.000Z', detail: `${inat.CULTIVATED_RULE}; filled 2026-10-21` }
    });
    const col = { ...openObs(3, 999, { login: 'cy', name: 'Cy' }), taxon: { id: 999, name: 'Copiapoa cinerea columna-alba', rank: 'variety' } };
    cop.photos = [...[openObs(1, 135254, { login: 'ann', name: 'Ann' }), col].map((o) => ({ src: 'inat', id: String(o.photos[0].id), url: o.photos[0].url.replace('square', 'large'), thumb: '', licence: 'cc0', attribution: `${o.user.name}, no rights reserved (CC0)`, page: `https://www.inaturalist.org/observations/${o.uuid}` })), ...cop.photos.filter((p: { src: string }) => p.src !== 'inat')];
    writeFileSync(join(v3, 'k2735933.json'), JSON.stringify(cop));
    writeFileSync(join(dir, 'inat-wild.jsonl'), [JSON.stringify({ inatOpenWild: 1, day: DAY, read: 'x', files: {}, keep: 24, rule: open.openWildDetail(DAY), counts: {} }), JSON.stringify({ t: 135254, n: 2, results: [openObs(1, 135254, { login: 'ann', name: 'Ann' }), col] })].join('\n') + '\n');
    writeFileSync(join(dir, 'fake.mjs'), `import { appendFileSync } from 'node:fs';\nglobalThis.fetch = async (u) => { appendFileSync(${JSON.stringify(join(dir, 'asked.txt'))}, String(u) + '\\n'); throw new TypeError('fetch failed'); };\n`);
    const r = spawnSync(process.execPath, ['--import', pathToFileURL(join(dir, 'fake.mjs')).href, '--import', pathToFileURL(join(root, 'node_modules/tsx/dist/loader.mjs')).href, join(root, 'scripts/build-dossiers.ts'), '--fill', 'inat', '--inat-open', join(dir, 'inat-wild.jsonl'), '--bulk', bulk, '--no-cache'], { cwd: dir, encoding: 'utf8', env: { ...process.env, TSX_TSCONFIG_PATH: join(root, 'tsconfig.json'), CULTIFOLIO_INAT_WAITS: '0' } });
    expect(r.stderr).not.toMatch(/Error/);
    expect(existsSync(join(dir, 'asked.txt'))).toBe(false); // r80f: its taxon's children asked (taxa?parent_id=135254)
    expect(r.stdout).toMatch(/1 read again against Kew's file of \d{4}-\d{2}-\d{2}, which places a taxon below one of their names under another species/);
    expect(r.stdout).toMatch(/1 pages hold a name below species that Kew places under another species and an iNaturalist taxon; 0 asked iNaturalist now, 1 read before/);
    const d = JSON.parse(readFileSync(join(v3, 'k2735933.json'), 'utf8'));
    expect(d.upstream['inat.photos.wild'].detail).toMatch(/^from iNaturalist's open data of 2026-09-27: .*; filled \d{4}-\d{2}-\d{2}; descendants read against Kew's file of \d{4}-\d{2}-\d{2}$/);
    // The observation of the variety Kew places under Copiapoa columna-alba is left out.
    expect(d.photos.filter((p: { src: string }) => p.src === 'inat').map((p: { page: string }) => p.page)).toEqual([`https://www.inaturalist.org/observations/${uuid(1)}`]);
    expect(r.status).toBe(0);
    rmSync(dir, { recursive: true, force: true });
  }, 180_000);
});

describe('/about/how', () => {
  it("says an API-era set is read again, that an iNaturalist photograph's author is its observer under CC0 too, and when an id is checked", () => {
    const page = readFileSync('src/routes/about/how/+page.svelte', 'utf8');
    expect(page).toContain("a set iNaturalist's API gave before the build read its open data is read again by this rule when the daily fill reaches the page, and until then is the 24 iNaturalist put first by votes the day it was asked, each with the locality iNaturalist names and its page by the observation's number");
    expect(page).toContain("an iNaturalist photograph's author is its observer, by name or, where there is none, login, under CC0 too");
    expect(page).toContain('where the build left iNaturalist to the daily fill, by the fill, thirty ids a request, before it asks iNaturalist for any photograph of the taxon');
    expect(page).toContain('A build that leaves iNaturalist to the fill keeps the id the page had');
  });
});
