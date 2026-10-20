/**
 * Round seventy-nine, agent P: iNaturalist's wild photographs from its open data on AWS (`src/lib/dossier/inat-open.ts`,
 * `scripts/inat-open-load.ts`), in place of one API request a species.
 *
 * The fixture (`fixtures/r79p-inat-open/`) is real rows of the open data of 2026-09-27, kept in the files' order: the
 * taxa of Ericameria palmeri, its two varieties and Myosotis sylvatica (with the ranks above them that the rows name), 16
 * observations (research grade, needs ID and casual; one of a bird), their 28 photographs (CC0, CC BY, CC BY-SA and
 * CC BY-NC) and their observers. `fixtures/r79p-inat-api.json` is iNaturalist's API's answer of 2026-10-20 for seven of
 * those observations, by uuid, cut to the fields the builder reads. Every case FAILED on r79base (no `inat-open.ts`, and
 * `photos` gave no record words), unless it says "guard".
 */
import { describe, it, expect } from 'vitest';
import { createReadStream, readFileSync, writeFileSync, mkdtempSync, mkdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as open from '$dossier/inat-open';
import * as inat from '$dossier/sources/inat';
import type { JsonFetcher, FetchResult } from '$dossier/fetch';

const DIR = 'tests/unit/fixtures/r79p-inat-open';
const lines = (name: string) => open.lineBatches(createReadStream(`${DIR}/${name}.csv`));
const src = () => ({ taxa: lines('taxa'), observations: lines('observations'), photos: lines('photos'), observers: () => lines('observers') });
/** Array batches, for a join of the same rows in another order. */
async function* batches(rows: string[]): AsyncGenerator<string[]> { yield rows; }
const rowsOf = (name: string) => readFileSync(`${DIR}/${name}.csv`, 'utf8').trim().split('\n');
const api = JSON.parse(readFileSync('tests/unit/fixtures/r79p-inat-api.json', 'utf8')) as { results: Array<{ id: number; uuid: string; quality_grade: string; captive: boolean; taxon: { id: number; name: string; rank: string }; observed_on: string; place_guess: string | null; photos: Array<{ id: number; license_code: string; url: string; attribution: string; original_dimensions: { width: number; height: number } }> }> };
const PALMERI = 76888, PACHYLEPIS = 80715, VAR_PALMERI = 80716, MYOSOTIS = 55826, BIRD = 13723;
const answer = (data: unknown): JsonFetcher => (async <T>() => ({ status: 'ok', data: data as T }) as FetchResult<T>) as JsonFetcher;
const refuse: JsonFetcher = (async <T>(url: string) => ({ status: 'refused', detail: `asked: ${url}` }) as FetchResult<T>) as JsonFetcher;

describe('the reader, on real rows', () => {
  it('reads the plant taxa and what each observation counts for: its taxon and the taxa at species rank or below above it', async () => {
    const taxa = await open.readTaxa(lines('taxa'));
    expect(taxa.get(PACHYLEPIS)?.groups).toEqual([PACHYLEPIS, PALMERI]);
    expect(taxa.get(PALMERI)?.groups).toEqual([PALMERI]);
    expect(taxa.has(57933)).toBe(false); // the genus: no wild set of its own
    expect(taxa.has(BIRD)).toBe(false); // not a plant
  });

  it('a wild set is the research-grade observations with a CC0, CC BY or CC BY-SA photograph, the variety\'s in its species\', newest photograph first', async () => {
    const w = await open.readWild(src());
    const uuids = (t: number) => w.groups.get(t)?.rows.map((r) => r.s.split('\t')[0].slice(0, 8));
    // Ericameria palmeri: two of its own observations and one of var. pachylepis; the research-grade ones whose
    // photographs are all CC BY-NC (four), and those that need ID (three) or are casual (one), are not.
    expect(w.groups.get(PALMERI)?.n).toBe(3);
    expect(uuids(PALMERI)).toEqual(['253ea2cb', '677cac39', 'b9d5e36d']);
    expect(w.groups.get(PACHYLEPIS)?.n).toBe(1);
    expect(w.groups.get(VAR_PALMERI)?.n ?? 0).toBe(0);
    // Myosotis sylvatica: the casual (captive) observation's CC BY-SA photograph is not taken.
    expect(uuids(MYOSOTIS)).toEqual(['db52b901', 'f97daa92']);
    expect(w.counts).toMatchObject({ observations: 16, photos: 28, unjoined: 0, plantResearch: 10, plantResearchOpen: 5 });
  });

  it('keeps at most `keep` a taxon, and only the taxa asked for (`only`), while counting every plant taxon', async () => {
    const w = await open.readWild(src(), { keep: 2, only: new Set([PALMERI]) });
    expect(w.groups.get(PALMERI)?.rows.map((r) => r.s.slice(0, 8))).toEqual(['253ea2cb', '677cac39']);
    expect(w.groups.get(PALMERI)?.n).toBe(3);
    expect(w.groups.get(MYOSOTIS)?.n).toBe(2);
    expect(w.groups.get(MYOSOTIS)?.rows).toEqual([]);
    const out = [...open.wildLines(w, { day: '2026-09-27', read: 'test', files: {} })];
    expect(out.length).toBe(2); // the header and the one taxon asked for: Myosotis is not held, so the API is asked for it
  });

  it('joins photographs a little out of their observations\' order, as the files have them; one whose observation is out of the window is counted, never joined wrongly', async () => {
    const obs = rowsOf('observations'), ph = rowsOf('photos');
    // Myosotis's first observation's two photographs moved to the end, after thirteen other observations' photographs.
    const moved = [ph[0], ...ph.slice(3), ph[1], ph[2]];
    const near = await open.readWild({ taxa: lines('taxa'), observations: batches(obs), photos: batches(moved), observers: () => lines('observers') });
    expect(near.counts.unjoined).toBe(0);
    expect(near.counts.farthest).toBe(14); // read back fourteen observations to the first
    expect(near.groups.get(MYOSOTIS)?.n).toBe(2);
    const far = await open.readWild({ taxa: lines('taxa'), observations: batches(obs), photos: batches(moved), observers: () => lines('observers') }, { window: 5 });
    expect(far.counts.unjoined).toBe(2);
  });

  it('a column the reader needs, missing from a file, stops it, naming the column', async () => {
    const bad = rowsOf('photos').map((l) => l.split('\t').filter((_, i) => i !== 5).join('\t'));
    await expect(open.readWild({ taxa: lines('taxa'), observations: lines('observations'), photos: batches(bad), observers: () => lines('observers') })).rejects.toThrow(/photos: no column license/);
  });
});

describe('the same photographs as the API', () => {
  it("the author is iNaturalist's attribution as the API writes it: the observer's name, or login, and \"no rights reserved\" for CC0", () => {
    expect(open.attributionOf('cc-by', 'Jesse Rorabaugh', 'glmory')).toBe('(c) Jesse Rorabaugh, some rights reserved (CC BY)');
    expect(open.attributionOf('cc-by-sa', '', 'mackplichta')).toBe('(c) mackplichta, some rights reserved (CC BY-SA)');
    expect(open.attributionOf('cc0', 'Scott Loarie', 'loarie')).toBe('no rights reserved');
  });

  it("the builder's photographs from the open data are the API's, field by field, but for the page's address (by uuid) and the place (not in the open data)", async () => {
    const w = await open.readWild(src());
    for (const t of [PALMERI, MYOSOTIS]) {
      const held = w.groups.get(t)!.rows.map((r) => open.observationOf(r.s, w.taxa, w.observers));
      const fromOpen = await inat.photos(answer({ results: held }), t, true, 24);
      const same = api.results.filter((o) => held.some((h) => h.uuid === o.uuid));
      const fromApi = await inat.photos(answer({ results: same }), t, true, 24);
      if (fromOpen.status !== 'ok' || fromApi.status !== 'ok') throw new Error('no photographs');
      const key = (p: { id: string }) => p.id;
      const a = [...fromApi.data].sort((x, y) => key(x).localeCompare(key(y)));
      const o = [...fromOpen.data].sort((x, y) => key(x).localeCompare(key(y)));
      expect(o.map(({ page, place, ...rest }) => rest)).toEqual(a.map(({ page, place, ...rest }) => rest));
      // The page: the same observation, by its uuid (the open data has no observation number).
      for (const p of o) {
        const twin = a.find((x) => x.id === p.id)!;
        const obs = api.results.find((x) => `https://www.inaturalist.org/observations/${x.id}` === twin.page)!;
        expect(p.page).toBe(`https://www.inaturalist.org/observations/${obs.uuid}`);
      }
    }
  });

  it('the casual, captive observation is not in the wild set, by either route (guard: the API says it is captive)', () => {
    const cas = api.results.find((o) => o.uuid.startsWith('d27fd2f3'))!;
    expect(cas).toMatchObject({ quality_grade: 'casual', captive: true });
  });
});

describe("the builder's wild request answered from the reader's file", () => {
  const file = () => {
    const dir = mkdtempSync(join(tmpdir(), 'r79p-'));
    return { dir, path: join(dir, 'inat-wild.jsonl') };
  };
  it('the file holds every plant taxon at species rank or below, its count and its kept observations; the store reads a line by its place', async () => {
    const w = await open.readWild(src());
    const { path } = file();
    writeFileSync(path, [...open.wildLines(w, { day: '2026-09-27', read: 'test', files: { taxa: 1 } })].join('\n') + '\n');
    const s = open.openWildStore(path);
    expect(s.header).toMatchObject({ inatOpenWild: 1, day: '2026-09-27', keep: 24 });
    expect(s.holds(PALMERI) && s.holds(PACHYLEPIS) && s.holds(VAR_PALMERI) && s.holds(MYOSOTIS)).toBe(true);
    expect(s.holds(57933)).toBe(false);
    expect(s.get(VAR_PALMERI)).toEqual({ n: 0, results: [] });
    expect(s.get(PALMERI)?.results.map((o) => o.uuid.slice(0, 8))).toEqual(['253ea2cb', '677cac39', 'b9d5e36d']);
    s.close();
  });

  it('answers only the wild request of a taxon it holds, never counted against the day, with the record\'s words; anything else goes on', async () => {
    const w = await open.readWild(src());
    const { path } = file();
    writeFileSync(path, [...open.wildLines(w, { day: '2026-09-27', read: 'test', files: {} })].join('\n') + '\n');
    const s = open.openWildStore(path);
    const said = { held: 0 };
    const f = open.heldWild(refuse, s, said);
    const wild = await inat.photos(f, PALMERI, true, 24);
    expect(wild.status).toBe('ok');
    expect((wild as { detail?: string }).detail).toBe("from iNaturalist's open data of 2026-09-27: research-grade observations with an open-licence photograph, the 24 whose photographs iNaturalist received last (the open data holds no votes)");
    expect(wild.status === 'ok' && wild.data.map((p) => p.id)).toEqual(['1994685', '1994665', '1994662', '801115', '801117']);
    // None: the open data answered, and has none (a record that says where it was read).
    const none = await inat.photos(f, VAR_PALMERI, true, 24);
    expect(none).toEqual({ status: 'none', detail: s.detail });
    // A taxon it does not hold, the cultivated request, and more than it keeps: asked of the API.
    expect((await inat.photos(f, 999999, true, 24)).status).toBe('refused');
    expect((await inat.photos(f, PALMERI, false, 12)).status).toBe('refused');
    expect((await inat.photos(f, PALMERI, true, 30)).status).toBe('refused');
    expect(said.held).toBe(2);
    expect(open.wildAsk(inat.wildUrl(PALMERI, 24))).toEqual({ taxon: PALMERI, perPage: 24 });
    expect(open.wildAsk(inat.cultivatedUrl(PALMERI, 12))).toBeNull();
    expect(open.wildAsk(`${inat.wildUrl(PALMERI, 24)}&place_id=1`)).toBeNull();
    s.close();
  });

  it('guard: without the file, the fetcher is the API\'s, unchanged', () => {
    expect(open.heldWild(refuse, null)).toBe(refuse);
  });
});

describe('the fill', () => {
  it('asks the wild set from the open data whenever it holds the taxon, from the API only as before, and never under --wild or --cultivated', () => {
    const ask = open.wildToAsk;
    const base = { held: false, settled: false, wildOnly: false, cultivatedOnly: false, wildFromGbif: 0 };
    expect(ask({ ...base, held: true, wildFromGbif: 12 })).toBe(true); // free: whatever GBIF's download gave
    expect(ask({ ...base, held: true, cultivatedOnly: true })).toBe(true);
    expect(ask({ ...base, held: true, wildOnly: true })).toBe(true);
    expect(ask({ ...base, held: true, settled: true })).toBe(false);
    expect(ask({ ...base, wildFromGbif: 3 })).toBe(true); // the API, as before
    expect(ask({ ...base, wildFromGbif: 6 })).toBe(false);
    expect(ask({ ...base, wildOnly: true })).toBe(false);
    expect(ask({ ...base, cultivatedOnly: true })).toBe(false);
  });

  it("the corpus script reads the file from --bulk or --inat-open, answers from it before iNaturalist's day is counted, and --wild asks iNaturalist nothing", () => {
    const s = readFileSync('scripts/build-dossiers.ts', 'utf8');
    expect(s).toContain('`${bulk}/inat-wild.jsonl`');
    expect(s).toContain("process.argv.indexOf('--inat-open')");
    expect(s).toMatch(/return open \? heldWild\(upstreamApi\(\), open, inatOpenHeld\) : upstreamApi\(\);/);
    expect(s).toMatch(/const f = wildOnly \? heldWild\(\(async \(\) => \(\{ status: 'refused'/);
    expect(s).toContain('wildToAsk({ held: !!open && open.holds(id)');
    expect(s).toContain("const cult = !wildOnly && !inat.cultivatedSettled");
    // No image is fetched: the reader reads the four metadata files only.
    const r = readFileSync('scripts/inat-open-load.ts', 'utf8') + readFileSync('src/lib/dossier/inat-open.ts', 'utf8');
    expect(r).not.toMatch(/fetch\(/);
  });

  it('--fill inat --wild, run: the wild set from the file for a page whose taxon it holds, no request at all; a page without a GBIF key is read by its checked id, and one whose id is unchecked waits (agent K\'s rule)', async () => {
    const root = resolve('.');
    const dir = mkdtempSync(join(tmpdir(), 'r79p-wild-'));
    const v3 = join(dir, 'static/s/v3');
    mkdirSync(v3, { recursive: true });
    const read = (k: string) => JSON.parse(readFileSync(`fixtures/dossiers/s/v3/${k}.json`, 'utf8'));
    // Copiapoa cinerea (iNaturalist 135254), its wild set not yet answered.
    const cop = read('k2735933');
    delete cop.upstream['inat.photos.wild'];
    cop.photos = cop.photos.filter((p: { captive?: boolean }) => p.captive);
    writeFileSync(join(v3, 'k2735933.json'), JSON.stringify(cop));
    // Welwitschia mirabilis as a page without a GBIF key whose id (75434) its Wikidata item gave, not yet checked.
    const wel = read('k339841');
    delete wel.ids.gbif;
    wel.upstream['inat.taxon'] = { status: 'skipped', at: '2026-10-20T00:00:00.000Z', detail: 'not asked: --skip inat' };
    delete wel.upstream['inat.photos.wild'];
    writeFileSync(join(v3, 'k339841.json'), JSON.stringify(wel));
    // Copiapoa humilis as a page without a GBIF key whose id has passed Kew's names: read from the file like any page.
    const hum = read('k2735990');
    delete hum.ids.gbif;
    hum.ids.inat = MYOSOTIS;
    hum.upstream['inat.taxon'] = { status: 'ok', at: '2026-10-20T00:00:00.000Z' };
    delete hum.upstream['inat.photos.wild'];
    writeFileSync(join(v3, 'k2735990.json'), JSON.stringify(hum));
    // The reader's file, from the fixture's rows, with Ericameria palmeri's set filed under both pages' taxa.
    const w = await open.readWild(src());
    const file = [...open.wildLines(w, { day: '2026-09-27', read: '2026-10-20T00:00:00.000Z', files: {} })]
      .map((l) => l.replace(`{"t":${PALMERI},`, '{"t":135254,').replace(`{"t":${PACHYLEPIS},`, '{"t":75434,'))
      .join('\n') + '\n';
    writeFileSync(join(dir, 'inat-wild.jsonl'), file);
    // Any request at all is written down, and fails.
    writeFileSync(join(dir, 'offline.mjs'), `import { appendFileSync } from 'node:fs';\nglobalThis.fetch = async (u) => { appendFileSync(${JSON.stringify(join(dir, 'asked.txt'))}, String(u) + '\\n'); throw new TypeError('fetch failed'); };\n`);
    const r = spawnSync(process.execPath, ['--import', pathToFileURL(join(dir, 'offline.mjs')).href, '--import', pathToFileURL(join(root, 'node_modules/tsx/dist/loader.mjs')).href, join(root, 'scripts/build-dossiers.ts'), '--fill', 'inat', '--wild', '--inat-open', join(dir, 'inat-wild.jsonl')], { cwd: dir, encoding: 'utf8', env: { ...process.env, TSX_TSCONFIG_PATH: join(root, 'tsconfig.json') } });
    expect(r.stderr).not.toMatch(/Error/);
    expect(r.stdout).toMatch(/2 with an iNaturalist taxon whose wild photographs the open data of 2026-09-27 holds/); // r79base: no --wild, the API asked
    expect(r.stdout).toMatch(/2 wild sets read from iNaturalist's open data/);
    expect(existsSync(join(dir, 'asked.txt'))).toBe(false);
    const after = JSON.parse(readFileSync(join(v3, 'k2735933.json'), 'utf8'));
    expect(after.upstream['inat.photos.wild'].status).toBe('ok');
    expect(after.upstream['inat.photos.wild'].detail).toMatch(/^from iNaturalist's open data of 2026-09-27: research-grade observations with an open-licence photograph/);
    const wild = after.photos.filter((p: { src: string; captive?: boolean }) => p.src === 'inat' && !p.captive);
    expect(wild.length).toBeGreaterThan(0);
    for (const p of wild) {
      expect(p.page).toMatch(/^https:\/\/www\.inaturalist\.org\/observations\/[0-9a-f-]{36}$/);
      expect(['cc0', 'by', 'by-sa']).toContain(p.licence);
      expect(p.attribution).toBeTruthy();
    }
    // The captive photographs it had are kept; the unchecked page is left as it was.
    expect(after.photos.filter((p: { captive?: boolean }) => p.captive).length).toBe(cop.photos.length);
    expect(JSON.parse(readFileSync(join(v3, 'k339841.json'), 'utf8')).upstream['inat.photos.wild']).toBeUndefined();
    const humAfter = JSON.parse(readFileSync(join(v3, 'k2735990.json'), 'utf8'));
    expect(humAfter.upstream['inat.photos.wild'].detail).toMatch(/^from iNaturalist's open data of 2026-09-27/);
    expect(humAfter.photos.some((p: { src: string; page?: string }) => p.src === 'inat' && /observations\/[0-9a-f-]{36}$/.test(p.page ?? ''))).toBe(true);
  }, 120_000);
});
