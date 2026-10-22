/**
 * Round eighty, agent I: iNaturalist's taxon ids, as the full build and its fill hold them.
 *   - An inactive id said as "nothing to report" (Iris germanica: 2 of 86 sampled ids inactive): `--fill inat` checks
 *     every id no build or fill has checked before it asks a set of it, and follows an inactive one to its current
 *     taxon by the build's rule; `--wild` never writes "none" for an id not yet checked; the open data's reader marks
 *     an inactive taxon, and its set is not read from the file.
 *   - "Not asked" with no reason (7 of 36 sampled new pages): a build that skips iNaturalist says why on each row.
 *   - The 475 pages that lost their id: a build that skips iNaturalist keeps the id the page had (`keptInatId`,
 *     `carryInatRows`); `--fill inat-restore <backup>` gives back the ids the build dropped, from the corpus before it.
 * Each case FAILED on r80f unless it says "guard": there the fill asks a set of an id without checking it, `--wild` writes
 * "none", the store has no `active`, the rows say nothing, and `keptInatId`, `carryInatRows` and `inat-restore.ts` do not
 * exist.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { FetchResult, JsonFetcher } from '$dossier/fetch';
import { fixtureFetcher } from '$dossier/fetch';
import * as open from '$dossier/inat-open';
import * as inat from '$dossier/sources/inat';
import * as buildMod from '$dossier/build';
import * as rederive from '$dossier/rederive';
import { buildKewDossier, type KewSpecies } from '$dossier/build-kew';
import { kewItemUrl, entityUrl, summaryUrl } from '$dossier/batch';
import { welwitschia } from '../../fixtures/upstream';

const restoreMod = await import('$dossier/inat-restore').catch(() => null);
const batchMod = await import('$dossier/inat-batch').catch(() => null);
const DAY = '2026-09-27';

/** An observation as the open data's reader writes it, with one CC0 photograph and its observer. */
const openObs = (n: number, taxon: number, who: { login: string; name: string }) => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, uuid: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, observed_on: '2024-03-01', quality_grade: 'research',
  taxon: { id: taxon, name: 'Copiapoa cinerea', rank: 'species' }, user: { id: n, ...who },
  photos: [{ id: n * 7, license_code: 'cc0', url: `${open.OPEN_DATA}/photos/${n * 7}/square.jpg`, attribution: open.attributionOf('cc0', who.name, who.login), original_dimensions: { width: 2048, height: 1536 } }]
});
/** The reader's file, its lines as given. */
function openFile(dir: string, lines: object[]): string {
  const path = join(dir, 'inat-wild.jsonl');
  writeFileSync(path, [JSON.stringify({ inatOpenWild: 1, day: DAY, read: '2026-10-20T00:00:00.000Z', files: {}, keep: 24, rule: open.openWildDetail(DAY), counts: {} }), ...lines.map((l) => JSON.stringify(l))].join('\n') + '\n');
  return path;
}

describe("the open data's word on an inactive taxon", () => {
  it('the reader marks an inactive taxon, the store says so, and its set goes to the API, never read from the file as none', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'r80i-open-'));
    const path = openFile(dir, [{ t: 57097, n: 0, active: false, results: [] }, { t: 709635, n: 1, results: [openObs(1, 709635, { login: 'ann', name: 'Ann Observer' })] }, { t: 1, n: 0, results: [] }]);
    const s = open.openWildStore(path);
    expect(s.active(57097)).toBe(false);
    expect(s.active(709635)).toBeUndefined(); // active, or a file of before that cannot tell
    expect(s.active(1)).toBeUndefined();
    const asked: string[] = [];
    const f = open.heldWild((async <T,>(url: string): Promise<FetchResult<T>> => { asked.push(url); return { status: 'refused', detail: 'not asked here' }; }) as JsonFetcher, s, { held: 0 });
    expect((await f(inat.wildUrl(57097, 24))).status).toBe('refused');
    expect(asked).toEqual([inat.wildUrl(57097, 24)]);
    expect((await f(inat.wildUrl(709635, 24))).status).toBe('ok'); // guard
    s.close();
    // The reader's lines: an inactive taxon of taxa.csv says so.
    const w = { taxa: new Map([[57097, { name: 'Iris germanica', rank: 'species', rankLevel: 10, active: false, groups: [57097] }], [709635, { name: 'Iris × germanica', rank: 'hybrid', rankLevel: 10, active: true, groups: [709635] }]]), groups: new Map(), observers: new Map(), counts: {} as never, keep: 24 };
    const lines = [...open.wildLines(w as never, { day: DAY, read: 'x', files: {} })].slice(1).map((l) => JSON.parse(l));
    expect(lines).toEqual([{ t: 57097, n: 0, active: false, results: [] }, { t: 709635, n: 0, results: [] }]);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('the fill, run', () => {
  const root = resolve('.');
  function folder(pages: Record<string, (d: Record<string, any>) => void>, lines: object[], answers: Record<string, unknown>) {
    const dir = mkdtempSync(join(tmpdir(), 'r80i-ids-'));
    const v3 = join(dir, 'static/s/v3');
    mkdirSync(v3, { recursive: true });
    for (const [k, edit] of Object.entries(pages)) {
      const d = JSON.parse(readFileSync(`fixtures/dossiers/s/v3/${k}.json`, 'utf8'));
      edit(d);
      writeFileSync(join(v3, `${k}.json`), JSON.stringify(d));
    }
    openFile(dir, lines);
    writeFileSync(join(dir, 'answers.json'), JSON.stringify(answers));
    writeFileSync(join(dir, 'fake.mjs'), `import { appendFileSync, readFileSync } from 'node:fs';\nconst answers = JSON.parse(readFileSync(${JSON.stringify(join(dir, 'answers.json'))}, 'utf8'));\nglobalThis.fetch = async (u) => { const url = String(u); appendFileSync(${JSON.stringify(join(dir, 'asked.txt'))}, url + '\\n'); const k = Object.keys(answers).find((x) => x === url || (x.startsWith('re:') && new RegExp(x.slice(3)).test(url))); const a = k && answers[k]; if (a && a.__status) return new Response('{}', { status: a.__status }); if (a) return new Response(JSON.stringify(a), { status: 200, headers: { 'content-type': 'application/json' } }); throw new TypeError('fetch failed'); };\n`);
    return { dir, v3 };
  }
  const fill = (dir: string, ...more: string[]) => spawnSync(process.execPath, ['--import', pathToFileURL(join(dir, 'fake.mjs')).href, '--import', pathToFileURL(join(root, 'node_modules/tsx/dist/loader.mjs')).href, join(root, 'scripts/build-dossiers.ts'), '--fill', 'inat', '--inat-open', join(dir, 'inat-wild.jsonl'), '--no-cache', ...more], { cwd: dir, encoding: 'utf8', env: { ...process.env, TSX_TSCONFIG_PATH: join(root, 'tsconfig.json'), CULTIFOLIO_SLOW_RETRY_MS: '5', CULTIFOLIO_INAT_WAITS: '0' } });
  const askedIn = (dir: string) => (existsSync(join(dir, 'asked.txt')) ? readFileSync(join(dir, 'asked.txt'), 'utf8').trim().split('\n') : []);
  const page = (v3: string, k: string) => JSON.parse(readFileSync(join(v3, `${k}.json`), 'utf8'));
  const wildNone = { status: 'none', at: '2026-10-21T00:00:00.000Z', detail: `${open.openWildDetail(DAY)}; filled 2026-10-21` };
  const cultDone = { status: 'none', at: '2026-10-21T00:00:00.000Z', detail: `${inat.CULTIVATED_RULE}; filled 2026-10-21` };

  it("checks an id no build or fill has checked before it asks a set of it, follows an inactive one to its current taxon, and reads that taxon's set", () => {
    // Copiapoa cinerea under an id iNaturalist has made inactive (as Iris germanica's 57097), its wild set the open
    // data's "none" from the wild pass, which read the id unchecked.
    const { dir, v3 } = folder({ k2735933: (d) => { delete d.upstream['inat.taxon']; d.upstream['inat.photos.wild'] = wildNone; d.upstream['inat.photos.cultivated'] = cultDone; d.photos = d.photos.filter((p: { src: string }) => p.src !== 'inat'); } },
      [{ t: 135254, n: 0, results: [] }, { t: 999001, n: 2, results: [openObs(1, 999001, { login: 'ann', name: 'Ann Observer' }), openObs(2, 999001, { login: 'bo', name: '' })] }],
      {
        [`${inat.INAT}/taxa/135254`]: { results: [{ id: 135254, name: 'Copiapoa cinerea', rank: 'species', is_active: false, current_synonymous_taxon_ids: [999001] }] },
        [`${inat.INAT}/taxa/999001`]: { results: [{ id: 999001, name: 'Copiapoa cinerea', rank: 'species', is_active: true }] },
        're:^https://api\\.gbif\\.org/v1/species/5384013$': { key: 5384013, scientificName: 'Copiapoa cinerea (Phil.) Britton & Rose', canonicalName: 'Copiapoa cinerea', rank: 'SPECIES', taxonomicStatus: 'ACCEPTED' },
        're:^https://api\\.gbif\\.org/v1/species/5384013/synonyms': { results: [], endOfRecords: true },
        ...(batchMod ? { [batchMod.lightUrl('cultivated', [999001], 12)]: { total_results: 0, results: [] } } : {})
      });
    const r = fill(dir);
    expect(r.stderr).not.toMatch(/Error/);
    const asked = askedIn(dir);
    expect(asked.slice(0, 2)).toEqual([`${inat.INAT}/taxa/135254`, `${inat.INAT}/taxa/999001`]); // r80f: the sets of 135254, unchecked
    expect(asked.some((u) => /observations\?taxon_id=135254/.test(u))).toBe(false);
    expect(r.stdout).toMatch(/first, the 1 iNaturalist ids no build or fill has checked, checked with iNaturalist/);
    expect(r.stdout).toMatch(/1 ids checked: 1 inactive ids followed to their current taxon/);
    const d = page(v3, 'k2735933');
    expect(d.ids.inat).toBe(999001);
    expect(d.links.inat).toBe('https://www.inaturalist.org/taxa/999001');
    expect(d.upstream['inat.taxon']).toMatchObject({ status: 'ok' });
    expect(d.upstream['inat.taxon'].detail).toMatch(/^iNaturalist's taxon 135254 \(Copiapoa cinerea\) is inactive; followed to its current taxon 999001 \(Copiapoa cinerea\)/);
    // The current taxon's wild set, from the open data at no request, its observers named.
    expect(d.upstream['inat.photos.wild'].status).toBe('ok');
    expect(d.upstream['inat.photos.wild'].detail).toMatch(/^from iNaturalist's open data of 2026-09-27/);
    expect(d.photos.filter((p: { src: string }) => p.src === 'inat').map((p: { attribution: string }) => p.attribution)).toEqual(['Ann Observer, no rights reserved (CC0)', 'bo, no rights reserved (CC0)']);
    expect(r.status).toBe(0);
    rmSync(dir, { recursive: true, force: true });
  }, 180_000);

  it("--wild never writes none for an id not yet checked, and passes by a taxon the file holds as inactive", () => {
    const { dir, v3 } = folder({
      // Welwitschia under an id the build kept unchecked, of which the file holds no observation.
      k339841: (d) => { delete d.upstream['inat.taxon']; d.upstream['inat.photos.wild'] = { status: 'skipped', at: '2026-10-21T00:00:00.000Z', detail: buildMod.INAT_SETS_LEFT ?? '' }; },
      // Copiapoa cinerea under an id the file holds as inactive.
      k2735933: (d) => { delete d.upstream['inat.taxon']; d.upstream['inat.photos.wild'] = { status: 'skipped', at: '2026-10-21T00:00:00.000Z' }; }
    }, [{ t: 75434, n: 0, results: [] }, { t: 135254, n: 0, active: false, results: [] }], {});
    const r = fill(dir, '--wild');
    expect(r.status).toBe(0);
    expect(askedIn(dir)).toEqual([]);
    const wel = page(v3, 'k339841').upstream['inat.photos.wild'];
    expect(wel.status).toBe('skipped'); // r80f: none, "nothing to report"
    expect(wel.detail).toMatch(/not yet checked with iNaturalist \(an inactive id holds none\); the next --fill inat checks it, then reads the set$/);
    expect(page(v3, 'k2735933').upstream['inat.photos.wild']).toEqual({ status: 'skipped', at: '2026-10-21T00:00:00.000Z' });
    rmSync(dir, { recursive: true, force: true });
  }, 180_000);
});

describe('a build that skips iNaturalist says why, and keeps the id the page had', () => {
  const cypress: KewSpecies = {
    id: '457911', name: 'Hesperocyparis lusitanica', authors: '(Mill.) Bartel', family: 'Cupressaceae', genus: 'Hesperocyparis', ipni: '60451554-2', powo: '60451554-2', synonyms: [],
    range: [{ locationId: 'TDWG:MXC', locality: 'Mexico Central', establishmentMeans: 'NATIVE', source: 'World Checklist of Vascular Plants (WCVP), RBG Kew' }] as KewSpecies['range'], file: '2026-06-04'
  };
  const sparql = { head: { vars: ['v', 'u', 'item'] }, results: { bindings: [{ v: { type: 'literal', value: '60451554-2' }, u: { type: 'literal', value: 'urn:lsid:ipni.org:names:60451554-2' }, item: { type: 'uri', value: 'http://www.wikidata.org/entity/Q50843040' } }] } };
  const entity = (claims: Record<string, unknown[]>) => ({ entities: { Q50843040: { id: 'Q50843040', claims: Object.fromEntries(Object.entries(claims).map(([p, vs]) => [p, vs.map((v) => ({ mainsnak: { datavalue: { value: v } } }))])), sitelinks: { enwiki: { title: 'Hesperocyparis lusitanica' } } } } });
  const kewFetcher = (claims: Record<string, unknown[]>) => fixtureFetcher({
    [kewItemUrl({ ipni: cypress.ipni, powo: cypress.powo })]: sparql,
    [entityUrl('Q50843040')]: entity(claims),
    [summaryUrl('Hesperocyparis lusitanica')]: { type: 'standard', title: 'Hesperocyparis lusitanica', extract: 'A conifer.', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Hesperocyparis_lusitanica' } } },
    're:^https://commons\\.wikimedia\\.org/': null
  });

  it("each iNaturalist row of a page without a GBIF key says why it was not asked, with the item's id and without", async () => {
    const withId = await buildKewDossier(cypress, { fetcher: kewFetcher({ P31: [{ id: 'Q16521' }], P225: ['Hesperocyparis lusitanica'], P3151: ['1515661'] }), builtBy: 'node', skip: ['inat'] });
    const d = (withId as { ok: true; dossier: import('$dossier/schema').Dossier }).dossier;
    expect(d.ids.inat).toBe(1515661); // guard: kept unchecked, as before
    expect(d.upstream['inat.taxon']).toMatchObject({ status: 'skipped', detail: "not asked: this build left iNaturalist to the daily fill (--fill inat), which checks taxon 1515661, as Wikidata gives it, by this species' own and Kew's names" });
    expect(d.upstream['inat.photos.wild']).toMatchObject({ status: 'skipped', detail: buildMod.INAT_SETS_LEFT });
    expect(d.upstream['inat.photos.cultivated']).toMatchObject({ status: 'skipped', detail: buildMod.INAT_SETS_LEFT });
    const without = await buildKewDossier(cypress, { fetcher: kewFetcher({ P31: [{ id: 'Q16521' }], P225: ['Hesperocyparis lusitanica'] }), builtBy: 'node', skip: ['inat'] });
    const e = (without as { ok: true; dossier: import('$dossier/schema').Dossier }).dossier;
    expect(e.upstream['inat.taxon']).toMatchObject({ status: 'skipped', detail: 'not asked: this build left iNaturalist to the daily fill (--fill inat), which asks the taxon by name' });
  });

  it('and of a page with a GBIF key', async () => {
    const r = await buildDossier();
    const d = r.ok ? r.dossier : null;
    expect(d?.upstream['inat.photos.wild']).toMatchObject({ status: 'skipped', detail: buildMod.INAT_SETS_LEFT });
    expect(d?.upstream['inat.taxon']?.detail).toMatch(/^not asked: this build left iNaturalist to the daily fill \(--fill inat\), which (asks the taxon by name|checks taxon \d+, as Wikidata gives it, before its photographs)$/);
    async function buildDossier() { return buildMod.buildDossier('Welwitschia', { fetcher: fixtureFetcher(welwitschia()), builtBy: 'node', now: () => new Date('2026-09-14T12:00:00Z'), skip: ['inat'] }); }
  });

  it('keeps the previous id where this build has none, or the same, or where the previous was checked; carries its taxon row and a set answered with none', () => {
    const { keptInatId, carryInatRows } = rederive as unknown as { keptInatId: (p: object, d: object, s: boolean) => boolean; carryInatRows: (p: object, d: object) => void };
    expect(keptInatId).toBeTypeOf('function');
    const skippedRows = () => ({ 'inat.taxon': { status: 'skipped', detail: buildMod.INAT_LEFT_TO_FILL }, 'inat.photos.wild': { status: 'skipped', detail: buildMod.INAT_SETS_LEFT }, 'inat.photos.cultivated': { status: 'skipped', detail: buildMod.INAT_SETS_LEFT } });
    const prev = { built: '2026-10-12T00:00:00.000Z', ids: { inat: 54321 }, links: { inat: 'https://www.inaturalist.org/taxa/54321' }, upstream: { 'inat.taxon': { status: 'ok', at: '2026-10-12T00:00:00.000Z', detail: 'Lithops dinteri, 54321' }, 'inat.photos.wild': { status: 'none', at: '2026-10-12T00:00:00.000Z', detail: 'filled 2026-10-12' }, 'inat.photos.cultivated': { status: 'ok', at: '2026-10-12T00:00:00.000Z' } } };
    // The item gave none: the id stays (r80f: dropped, as on 475 pages).
    const d = { ids: {} as { inat?: number }, links: {} as Record<string, string>, upstream: skippedRows() as Record<string, { status: string; detail?: string }> };
    expect(keptInatId(prev, d, true)).toBe(true);
    expect(d.ids.inat).toBe(54321);
    expect(d.links.inat).toBe('https://www.inaturalist.org/taxa/54321');
    carryInatRows(prev, d);
    expect(d.upstream['inat.taxon']).toMatchObject({ status: 'ok', detail: `carried from build of 2026-10-12 (that build: Lithops dinteri, 54321); this build: ${buildMod.INAT_LEFT_TO_FILL}` });
    expect(d.upstream['inat.photos.wild']).toMatchObject({ status: 'none', detail: `carried from build of 2026-10-12 (that build: filled 2026-10-12); this build: ${buildMod.INAT_SETS_LEFT}` });
    // An "ok" set is the photographs' carry's to bring, with its photographs (guard: not here).
    expect(d.upstream['inat.photos.cultivated'].status).toBe('skipped');
    // The item's other id against a checked one: the checked one stays; against an unchecked one: the item's.
    const other = { ids: { inat: 777 }, links: { inat: 'https://www.inaturalist.org/taxa/777' }, upstream: skippedRows() };
    expect(keptInatId(prev, other, true)).toBe(true);
    expect(other.ids.inat).toBe(54321);
    const unchecked = { ...prev, upstream: { ...prev.upstream, 'inat.taxon': { status: 'skipped' } } };
    const third = { ids: { inat: 777 }, links: {}, upstream: skippedRows() };
    expect(keptInatId(unchecked, third, true)).toBe(false);
    expect(third.ids.inat).toBe(777);
    // A build that asked iNaturalist decides by its own check (guard).
    const asked = { ids: {} as { inat?: number }, links: {}, upstream: {} };
    expect(keptInatId(prev, asked, false)).toBe(false);
    expect(asked.ids.inat).toBeUndefined();
  });

  it('the builder keeps the id before the photographs are carried, in a build that skips iNaturalist and is not a re-derivation', () => {
    const s = readFileSync('scripts/build-dossiers.ts', 'utf8');
    const kept = s.indexOf("const inatKept = keptInatId(prev, d, skip.includes('inat') && !rederive);");
    expect(kept).toBeGreaterThan(0);
    expect(kept).toBeLessThan(s.indexOf("for (const [src, is] of Object.entries(photoSrc))"));
    expect(s).toContain('if (inatKept) carryInatRows(prev, d);');
  });
});

describe('--fill inat-restore gives back the ids the build dropped', () => {
  const mem = (docs: Record<string, any>) => ({ files: () => Object.keys(docs), read: <T,>(k: string) => structuredClone(docs[k]) as T, write: (k: string, d: unknown) => { docs[k] = d; } });
  const p = (key: string, gbif: number | undefined, inatId: number | undefined, taxonRow?: object) => ({ key, name: { scientific: `Species ${key}` }, ids: { ...(gbif ? { gbif } : {}), ...(inatId ? { inat: inatId } : {}) }, links: {}, built: '2026-10-12T00:00:00.000Z', upstream: { ...(taxonRow ? { 'inat.taxon': taxonRow } : {}), 'inat.photos.wild': { status: 'skipped' }, 'inat.photos.cultivated': { status: 'skipped' } } });

  it('by the page\'s id or GBIF key, unchecked, for the fill to check; never one another page holds, nor one the fill refused, and never twice', () => {
    if (!restoreMod) throw new Error('src/lib/dossier/inat-restore.ts is missing');
    const backup = mem({ 'k1.json': p('k1', 11, 501), 'g22.json': p('g22', 22, 502), 'k3.json': p('k3', 33, 503), 'k4.json': p('k4', 44, 504), 'k5.json': p('k5', 55, 505) });
    const now = mem({
      'k1.json': p('k1', 11, undefined, { status: 'skipped', detail: buildMod.INAT_LEFT_TO_FILL }), // dropped by the build
      'k22.json': p('k22', 22, undefined, { status: 'none', detail: 'no iNaturalist taxon of this name' }), // rekeyed since; the fill found none by its name
      'k3.json': p('k3', 33, 600), // the fill found it a taxon since
      'k4.json': p('k4', 44, undefined), // another page holds its old id now
      'k9.json': p('k9', 99, 504),
      'k5.json': p('k5', 55, undefined, { status: 'none', detail: "iNaturalist's taxon 505 (X) is inactive; its current taxon 506 is not this species: …; asked by name: no iNaturalist taxon of this name" })
    });
    const c = restoreMod.restoreInatIds(now, backup, 'backups/v3-abc', () => '2026-10-23T20:00:00.000Z');
    expect(c).toMatchObject({ found: 4, restored: 2, heldElsewhere: 1, refused: 1 });
    const k1 = now.read<any>('k1.json');
    expect(k1.ids.inat).toBe(501);
    expect(k1.links.inat).toBe('https://www.inaturalist.org/taxa/501');
    expect(k1.upstream['inat.taxon'].status).toBe('skipped');
    expect(k1.upstream['inat.taxon'].detail).toMatch(/^iNaturalist's taxon 501, given back from the corpus before the build that skipped iNaturalist \(backups\/v3-abc, built 2026-10-12\) on 2026-10-23; not yet checked: the next --fill inat checks it with iNaturalist before its photographs/);
    expect(k1.upstream['inat.photos.wild']).toMatchObject({ status: 'skipped', detail: 'not asked: the iNaturalist taxon was given back (2026-10-23); the next --fill inat asks it' });
    expect(now.read<any>('k22.json').ids.inat).toBe(502);
    expect(now.read<any>('k3.json').ids.inat).toBe(600);
    expect(now.read<any>('k4.json').ids.inat).toBeUndefined();
    expect(now.read<any>('k5.json').ids.inat).toBeUndefined();
    expect(c.lines).toContain('Species k4 [k4]: 504 not given back: page k9 holds it');
    // A rerun gives back nothing more.
    expect(restoreMod.restoreInatIds(now, backup, 'backups/v3-abc').restored).toBe(0);
  });
});
