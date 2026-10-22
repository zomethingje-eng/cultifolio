/**
 * Round eighty, agent V: the wild photographs' choice for well-photographed species. iNaturalist's open data holds no
 * votes, so for a taxon with more than 24 qualifying observations the open data's set is the 24 newest; the fill that asks
 * the API (`--fill inat`, alongside the cultivated set, under the day's budget) now asks it for the 24 it puts first by
 * votes, once, only for those taxa, and never for a set that is the most voted already. Built on agent P's fixtures
 * (`fixtures/r79p-inat-open/`, real rows of the open data, and `r79p-inat-api.json`, the API's answers for the same
 * observations). Every case FAILED on r80base unless it says "guard": there `store.count`, `mostVotedToAsk`,
 * `MOST_VOTED_RULE` and `sameSteps` do not exist, the fill asks nothing for such a page, a wild photograph's page from the
 * API is its observation's number, and a change to a plan's comments starts the plan again.
 */
import { describe, it, expect } from 'vitest';
import { createReadStream, readFileSync, writeFileSync, mkdtempSync, mkdirSync, existsSync, rmSync, cpSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as open from '$dossier/inat-open';
import * as inat from '$dossier/sources/inat';
import { inatKewFill } from '$dossier/inat-kew-fill';
import { lightUrl } from '$dossier/inat-batch';
/** The page's own wild search as the fill now sends it (round eighty, agent I): of iNaturalist's API v2, with only the fields read. */
const asSent = (t: number) => lightUrl('wild', [t], 24);
/** A wild search of several taxa as the fill sends it (round eighty, agent I). */
const batchOf = (...t: number[]) => lightUrl('wild', t, 200);
import type { JsonFetcher, FetchResult } from '$dossier/fetch';
import { run, sameSteps, parsePlan, EXIT } from '../../scripts/corpus-step.mjs';

const DIR = 'tests/unit/fixtures/r79p-inat-open';
const lines = (name: string) => open.lineBatches(createReadStream(`${DIR}/${name}.csv`));
const src = () => ({ taxa: lines('taxa'), observations: lines('observations'), photos: lines('photos'), observers: () => lines('observers') });
const api = JSON.parse(readFileSync('tests/unit/fixtures/r79p-inat-api.json', 'utf8')) as { results: Array<{ id: number; uuid: string; quality_grade: string; taxon: { id: number } }> };
const PALMERI = 76888, PACHYLEPIS = 80715, MYOSOTIS = 55826;
const DAY = '2026-09-27';
/** The API's answer for a "most-voted" request in these tests: Ericameria palmeri's research-grade observations, var. pachylepis's among them, in the API's order. */
const mostVoted = { total_results: 30, results: api.results.filter((o) => o.quality_grade === 'research' && (o.taxon.id === PALMERI || o.taxon.id === PACHYLEPIS)) };

/** The reader's file from the fixture's rows, with a taxon's count set to `n` (a taxon of the fixture has few). */
async function storeFile(counts: Record<number, number> = {}, rename: Record<number, number> = {}): Promise<string> {
  const w = await open.readWild(src());
  const dir = mkdtempSync(join(tmpdir(), 'r80v-'));
  const path = join(dir, 'inat-wild.jsonl');
  const out = [...open.wildLines(w, { day: DAY, read: '2026-10-20T00:00:00.000Z', files: {} })].map((l) => {
    let x = l;
    for (const [from, to] of Object.entries(rename)) x = x.replace(`{"t":${from},`, `{"t":${to},`);
    const m = /^\{"t":(\d+),"n":(\d+),/.exec(x);
    return m && counts[Number(m[1])] != null ? x.replace(`"n":${m[2]},`, `"n":${counts[Number(m[1])]},`) : x;
  });
  writeFileSync(path, out.join('\n') + '\n');
  return path;
}
const asked: string[] = [];
const apiFetcher: JsonFetcher = (async <T>(url: string) => { asked.push(url); return { status: 'ok', data: mostVoted as T } as FetchResult<T>; }) as JsonFetcher;

describe("the open data's count, and which sets are the most voted already", () => {
  it("the store gives each taxon's count of qualifying observations, read with its place", async () => {
    const s = open.openWildStore(await storeFile({ [PALMERI]: 30 }));
    expect(s.count(PALMERI)).toBe(30);
    expect(s.count(MYOSOTIS)).toBe(2);
    expect(s.count(999999)).toBeUndefined();
    s.close();
  });

  it('asks the API only for a set the open data gave as its newest, of a taxon of which it holds more than 24', async () => {
    const s = open.openWildStore(await storeFile({ [PALMERI]: 30, [MYOSOTIS]: 24 }));
    const fromOpen = { status: 'ok', detail: `${open.openWildDetail(DAY)}; filled 2026-10-21` };
    expect(open.mostVotedToAsk(s, PALMERI, fromOpen)).toBe(true);
    expect(open.mostVotedToAsk(s, PALMERI, { status: 'none', detail: open.openWildDetail(DAY) })).toBe(true);
    // 24 or fewer: the open data's set is the whole qualifying set, the API's too.
    expect(open.mostVotedToAsk(s, MYOSOTIS, fromOpen)).toBe(false);
    // Answered by the API already: by votes (round seventy-eight's fill, or a taxon newer than the export), or by this round.
    expect(open.mostVotedToAsk(s, PALMERI, { status: 'ok', detail: 'filled 2026-09-20' })).toBe(false);
    expect(open.mostVotedToAsk(s, PALMERI, { status: 'ok', detail: `${open.mostVotedDetail(DAY, 30)}; filled 2026-10-21` })).toBe(false);
    // Not answered, a taxon the file does not hold, no file: nothing is asked by this rule.
    expect(open.mostVotedToAsk(s, PALMERI, { status: 'skipped', detail: open.openWildDetail(DAY) })).toBe(false);
    expect(open.mostVotedToAsk(s, PALMERI, undefined)).toBe(false);
    expect(open.mostVotedToAsk(s, 999999, fromOpen)).toBe(false);
    expect(open.mostVotedToAsk(null, PALMERI, fromOpen)).toBe(false);
    s.close();
  });

  it("the most-voted fetcher: the file answers a whole set; a taxon of more than 24 goes to the API, whose answer says so; without it the file answers (the newest)", async () => {
    const s = open.openWildStore(await storeFile({ [PALMERI]: 30 }));
    const said = { held: 0 } as { held: number; mostVoted?: number };
    asked.length = 0;
    const f = open.heldWild(apiFetcher, s, said, { mostVoted: true });
    const big = await inat.photos(f, PALMERI, true, 24);
    expect(asked).toEqual([inat.wildUrl(PALMERI, 24)]);
    expect((big as { detail?: string }).detail).toBe(`from iNaturalist's API: research-grade observations not marked captive with an open-licence photograph, the observations iNaturalist puts first by votes, 24 of them (the open data of ${DAY} holds 30, and no votes)`);
    const direct = await inat.photos((async <T>() => ({ status: 'ok', data: mostVoted as T }) as FetchResult<T>) as JsonFetcher, PALMERI, true, 24);
    expect(big.status === 'ok' && direct.status === 'ok' && big.data).toEqual(direct.status === 'ok' && direct.data);
    expect(big.status === 'ok' && big.data.length).toBeGreaterThan(0);
    const small = await inat.photos(f, MYOSOTIS, true, 24);
    expect(asked.length).toBe(1);
    expect((small as { detail?: string }).detail).toBe(s.detail);
    expect(said).toEqual({ held: 1, mostVoted: 1 });
    // guard: --wild and --cultivated read every set the file holds from it, as round seventy-nine did.
    const plain = await inat.photos(open.heldWild(apiFetcher, s), PALMERI, true, 24);
    expect(asked.length).toBe(1);
    expect((plain as { detail?: string }).detail).toBe(s.detail);
    s.close();
  });

  it("the record's words carry no \"; \", which joins a record's words", () => {
    expect(open.mostVotedDetail(DAY, 30)).not.toContain('; ');
    expect(open.mostVotedDetail(DAY, 30)).toContain(open.MOST_VOTED_RULE);
    expect(open.mostVotedDetail(DAY, 30).startsWith(open.OPEN_WILD_RULE)).toBe(false);
  });
});

describe("a wild photograph's page, by either route", () => {
  it("is its observation's uuid when the API answers, as the open data's is; a cultivated photograph's stays its number", async () => {
    const wild = await inat.photos(apiFetcher, PALMERI, true, 24);
    if (wild.status !== 'ok') throw new Error('no photographs');
    for (const p of wild.data) expect(p.page).toMatch(/^https:\/\/www\.inaturalist\.org\/observations\/[0-9a-f-]{36}$/);
    const captive = { results: [{ ...api.results.find((o) => o.uuid.startsWith('d27fd2f3'))!, captive: true, community_taxon_id: MYOSOTIS, num_identification_disagreements: 0, taxon: { id: MYOSOTIS, ancestor_ids: [MYOSOTIS] }, identifications: [{ current: true, taxon: { id: MYOSOTIS } }, { current: true, taxon: { id: MYOSOTIS } }] }] };
    const cult = await inat.photos((async <T>() => ({ status: 'ok', data: captive as T }) as FetchResult<T>) as JsonFetcher, MYOSOTIS, false, 12);
    expect(cult.status === 'ok' && cult.data[0].page).toBe('https://www.inaturalist.org/observations/411156');
  });
});

describe("Kew's descendants, asked again", () => {
  it("keep the answer's own words on the record (the open data's or the API's most voted), with the day and Kew's mark", async () => {
    const d = { key: 'k1', name: { scientific: 'Ericameria palmeri' }, ids: { inat: PALMERI }, photos: [{ src: 'inat', captive: false }], upstream: { 'inat.photos.wild': { status: 'ok', detail: open.openWildDetail(DAY) } } } as never;
    const kew = { hasElsewhereUnder: () => true, widened: () => false, placedElsewhere: (n: string) => (n === 'Ericameria palmeri pachylepis' ? 'Ericameria pachylepis' : null) } as never;
    const s = open.openWildStore(await storeFile({ [PALMERI]: 30 }));
    const f = open.heldWild((async <T>(url: string) => (url.includes('/taxa?parent_id=') ? { status: 'ok', data: { results: [{ id: PACHYLEPIS, name: 'Ericameria palmeri pachylepis' }] } as T } : { status: 'ok', data: mostVoted as T })) as JsonFetcher, s, undefined, { mostVoted: true });
    const r = await inatKewFill(d, f, kew, '2026-08-01', () => '2026-10-21T00:00:00.000Z');
    expect(r.done).toBe('asked again');
    expect((d as { upstream: Record<string, { detail: string }> }).upstream['inat.photos.wild'].detail).toBe(`${open.mostVotedDetail(DAY, 30)}; filled 2026-10-21; descendants read against Kew's file of 2026-08-01`);
    s.close();
  });
});

describe('the fill, run', () => {
  const root = resolve('.');
  /** A folder of three pages and the reader's file; the API answered from `answers` by the request's address, every request written down. */
  async function folder() {
    const dir = mkdtempSync(join(tmpdir(), 'r80v-fill-'));
    const v3 = join(dir, 'static/s/v3');
    mkdirSync(v3, { recursive: true });
    const read = (k: string) => JSON.parse(readFileSync(`fixtures/dossiers/s/v3/${k}.json`, 'utf8'));
    const cultivated = { status: 'ok', at: '2026-10-20T00:00:00.000Z', detail: `${inat.CULTIVATED_RULE}; filled 2026-10-20` };
    const openRow = { status: 'ok', at: '2026-10-20T00:00:00.000Z', detail: `${open.openWildDetail(DAY)}; filled 2026-10-20` };
    // Copiapoa cinerea (iNaturalist 135254): the open data's newest, of a taxon it holds 30 of: asked.
    const cop = read('k2735933');
    cop.upstream['inat.photos.wild'] = openRow;
    cop.upstream['inat.photos.cultivated'] = cultivated;
    writeFileSync(join(v3, 'k2735933.json'), JSON.stringify(cop));
    // Welwitschia mirabilis (75434): the open data's, of a taxon it holds one of: the whole set, not asked.
    const wel = read('k339841');
    wel.upstream['inat.photos.wild'] = openRow;
    wel.upstream['inat.photos.cultivated'] = cultivated;
    writeFileSync(join(v3, 'k339841.json'), JSON.stringify(wel));
    // Copiapoa humilis as of Myosotis's taxon (55826, held 40 times here): answered by the API before, by votes: not asked.
    const hum = read('k2735990');
    hum.ids.inat = MYOSOTIS;
    hum.upstream['inat.photos.wild'] = { status: 'ok', at: '2026-09-20T00:00:00.000Z', detail: 'filled 2026-09-20' };
    hum.upstream['inat.photos.cultivated'] = cultivated;
    writeFileSync(join(v3, 'k2735990.json'), JSON.stringify(hum));
    // Round eighty (agent I): `--fill inat` checks an id no build or fill has checked before it asks a set of it; these
    // three are checked already, so the fill asks only what this test is about.
    for (const [k, d] of [['k2735933', cop], ['k339841', wel], ['k2735990', hum]] as const) { d.upstream['inat.taxon'] = { status: 'ok', at: '2026-10-20T00:00:00.000Z', detail: `iNaturalist's taxon ${d.ids.inat} is active` }; writeFileSync(join(v3, `${k}.json`), JSON.stringify(d)); }
    const store = await storeFile({ 135254: 30, [MYOSOTIS]: 40 }, { [PALMERI]: 135254, [PACHYLEPIS]: 75434 });
    cpSync(store, join(dir, 'inat-wild.jsonl'));
    // Round eighty (agent I): Copiapoa humilis's set, the API's before the open data (round seventy-eight's), of a taxon the
    // open data holds more than 24 of, is read again as the most voted, in one search with Copiapoa cinerea's
    // (`inat-batch.ts`): its answer here holds every observation of both (so each page takes its own), the most-voted
    // answer's observations under 135254 and Myosotis's two research-grade ones.
    const myosotis = api.results.filter((o) => o.quality_grade === 'research' && o.taxon.id === MYOSOTIS);
    const both = { total_results: mostVoted.results.length + myosotis.length, results: [...mostVoted.results.map((o) => ({ ...o, taxon: { ...o.taxon, ancestor_ids: [135254, o.taxon.id] } })), ...myosotis] };
    const answers = { [asSent(135254)]: mostVoted, [batchOf(135254, MYOSOTIS)]: both };
    writeFileSync(join(dir, 'answers.json'), JSON.stringify(answers));
    writeFileSync(join(dir, 'fake.mjs'), `import { appendFileSync, readFileSync } from 'node:fs';\nconst answers = JSON.parse(readFileSync(${JSON.stringify(join(dir, 'answers.json'))}, 'utf8'));\nglobalThis.fetch = async (u) => { const url = String(u); appendFileSync(${JSON.stringify(join(dir, 'asked.txt'))}, url + '\\n'); const a = answers[url]; if (a && a.__status) return new Response('{}', { status: a.__status }); if (a) return new Response(JSON.stringify(a), { status: 200, headers: { 'content-type': 'application/json' } }); throw new TypeError('fetch failed'); };\n`);
    return { dir, v3, cop, wel, hum };
  }
  const fill = (dir: string, ...more: string[]) => spawnSync(process.execPath, ['--import', pathToFileURL(join(dir, 'fake.mjs')).href, '--import', pathToFileURL(join(root, 'node_modules/tsx/dist/loader.mjs')).href, join(root, 'scripts/build-dossiers.ts'), '--fill', 'inat', '--inat-open', join(dir, 'inat-wild.jsonl'), '--no-cache', ...more], { cwd: dir, encoding: 'utf8', env: { ...process.env, TSX_TSCONFIG_PATH: join(root, 'tsconfig.json') } });
  const askedIn = (dir: string) => (existsSync(join(dir, 'asked.txt')) ? readFileSync(join(dir, 'asked.txt'), 'utf8').trim().split('\n') : []);
  const page = (v3: string, k: string) => JSON.parse(readFileSync(join(v3, `${k}.json`), 'utf8'));

  it('--fill inat asks the API once for the one set that is the newest of more than 24, writes it as the most voted, and asks nothing again; it stops at the day\'s allowance and goes on', async () => {
    const { dir, v3, wel, hum } = await folder();
    // The day's allowance spent: nothing asked, the page as it was, the fill stops to be run again (exit 3).
    const spent = fill(dir, '--inat-budget', '0');
    // Round eighty (agent I): with Copiapoa humilis's set of the API's before the open data, read again.
    expect(spent.stdout).toMatch(/2 without iNaturalist's photographs \(1 of them for their 24 most-voted wild observations: the open data of 2026-09-27 holds more than 24 of their taxon\) \(1 whose wild set the API gave before the open data, read again\)/);
    expect(spent.stdout).toMatch(/allowance of 0 requests is spent/);
    expect(spent.status).toBe(3);
    expect(askedIn(dir)).toEqual([]);
    expect(page(v3, 'k2735933').upstream['inat.photos.wild'].detail).toMatch(/^from iNaturalist's open data of 2026-09-27/);
    // The next day's run.
    const r = fill(dir);
    expect(r.stderr).not.toMatch(/Error/);
    expect(r.status).toBe(0);
    // Round eighty (agent I): one search for both sets, never one each.
    expect(askedIn(dir)).toEqual([batchOf(135254, MYOSOTIS)]);
    expect(r.stdout).toMatch(/2 asked of its API for the 24 most voted \(the open data holds more than 24\)/);
    const cop = page(v3, 'k2735933');
    expect(cop.upstream['inat.photos.wild'].status).toBe('ok');
    expect(cop.upstream['inat.photos.wild'].detail).toMatch(/^from iNaturalist's API: research-grade observations not marked captive with an open-licence photograph, the observations iNaturalist puts first by votes, 24 of them \(the open data of 2026-09-27 holds 30, and no votes\); filled \d{4}-\d{2}-\d{2}$/);
    const wild = cop.photos.filter((p: { src: string; captive?: boolean }) => p.src === 'inat' && !p.captive);
    const want = await inat.photos(apiFetcher, 135254, true, 24, { key: 'k2735933' as never });
    expect(want.status === 'ok' && wild.map((p: { id: string }) => p.id)).toEqual(want.status === 'ok' && want.data.map((p) => p.id));
    for (const p of wild) expect(p.page).toMatch(/observations\/[0-9a-f-]{36}$/);
    // The cultivated photographs it had are kept.
    expect(cop.photos.filter((p: { captive?: boolean }) => p.captive).length).toBeGreaterThan(0);
    // The whole set: untouched. The API's set from before the open data (round seventy-eight's): read again as the most
    // voted (round eighty, agent I; it was left as it was), its two observations by uuid.
    expect(page(v3, 'k339841').upstream['inat.photos.wild']).toEqual(wel.upstream['inat.photos.wild']);
    void hum;
    expect(page(v3, 'k2735990').upstream['inat.photos.wild'].detail).toMatch(/^from iNaturalist's API: .*the observations iNaturalist puts first by votes, 24 of them \(the open data of 2026-09-27 holds 40, and no votes\); filled \d{4}-\d{2}-\d{2}$/);
    // Run again: every set is the most voted or the whole set; nothing is asked.
    const again = fill(dir);
    expect(again.stdout).toMatch(/3 dossiers on disk; 0 without iNaturalist's photographs/);
    expect(askedIn(dir)).toEqual([batchOf(135254, MYOSOTIS)]);
    rmSync(dir, { recursive: true, force: true });
  }, 180_000);

  it("a most-voted set the API does not answer (an error) leaves the open data's set and its record, and the fill says to run it again", async () => {
    const { dir, v3, cop } = await folder();
    // Round eighty (agent I): the search of both sets first, then each page's own; none answers.
    writeFileSync(join(dir, 'answers.json'), JSON.stringify({ [batchOf(135254, MYOSOTIS)]: { __status: 500 }, [asSent(135254)]: { __status: 500 }, [asSent(MYOSOTIS)]: { __status: 500 } }));
    const r = fill(dir);
    expect(askedIn(dir)).toEqual([batchOf(135254, MYOSOTIS), asSent(135254), asSent(MYOSOTIS)]);
    expect(r.status).toBe(3);
    expect(r.stdout).toMatch(/most-voted wild sets: 1 not answered \(asked again by the next fill\)/);
    const after = page(v3, 'k2735933');
    expect(after.upstream['inat.photos.wild']).toEqual(cop.upstream['inat.photos.wild']);
    expect(after.photos).toEqual(cop.photos);
    rmSync(dir, { recursive: true, force: true });
  }, 180_000);

  it('--fill inat --cultivated and --fill inat --wild ask nothing of it (guard: neither asked it before either)', async () => {
    const { dir, v3 } = await folder();
    const c = fill(dir, '--cultivated');
    expect(c.status).toBe(0);
    const w = fill(dir, '--wild');
    expect(w.status).toBe(0);
    expect(askedIn(dir)).toEqual([]);
    expect(page(v3, 'k2735933').upstream['inat.photos.wild'].detail).toMatch(/^from iNaturalist's open data of 2026-09-27/);
    rmSync(dir, { recursive: true, force: true });
  }, 180_000);
});

describe("the plan's place", () => {
  it('a change to a plan\'s comments alone keeps where the run is; a change to a step starts it again (guard: as before)', async () => {
    const root = mkdtempSync(join(tmpdir(), 'r80v-plan-'));
    mkdirSync(join(root, 'static/s/v3'), { recursive: true });
    mkdirSync(join(root, 'scripts'));
    writeFileSync(join(root, 'static/s/v3/manifest.json'), JSON.stringify({ v: 3, id: 'aaaa1111', built: 'x', species: 3, buckets: 32, postings: 64, files: {} }));
    writeFileSync(join(root, 'static/s/v3/index.json'), JSON.stringify([{ key: 'g1' }, { key: 'g2' }, { key: 'g3' }]));
    const planPath = join(root, 'scripts/corpus-plan.txt');
    const calls: string[] = [];
    const exec = async (_cmd: string, args: string[], onOutput: (s: string) => void) => {
      if (args.includes('scripts/build-dossiers.ts')) calls.push(args.slice(args.indexOf('scripts/build-dossiers.ts') + 1).join(' '));
      onOutput('  index: 3 species\n');
      return 0;
    };
    const go = (argv: string[] = []) => run({ root, argv, exec, fetchCorpus: async () => 'aaaa1111', log: () => {}, waitMs: 0 });
    writeFileSync(planPath, '# the cultivated fill, about six days\ndossier --fill inat --bulk bulk\nreview Read the fill.\ndossier --index\n');
    expect(await go()).toBe(EXIT.review);
    expect(calls).toEqual(['--fill inat --bulk bulk']);
    // A round's code changes the comment while the run waits at its review.
    writeFileSync(planPath, '# the cultivated fill and the most-voted wild sets, about eight days\ndossier --fill inat --bulk bulk\nreview Read the fill.\ndossier --index\n');
    expect(await go()).toBe(EXIT.review);
    expect(calls).toEqual(['--fill inat --bulk bulk']); // r80base: the plan starts again and the fill runs a second time
    expect(await go(['--go-on'])).toBe(EXIT.done);
    expect(calls).toEqual(['--fill inat --bulk bulk', '--index']);
    // A step changed: the plan starts again.
    writeFileSync(planPath, '# the same\ndossier --fill inat --cultivated --bulk bulk\nreview Read the fill.\ndossier --index\n');
    expect(await go()).toBe(EXIT.review);
    expect(calls).toEqual(['--fill inat --bulk bulk', '--index', '--fill inat --cultivated --bulk bulk']);
    rmSync(root, { recursive: true, force: true });
  });

  it('sameSteps compares the steps line for line, in order', () => {
    const p = parsePlan('backup\n# c\ndossier --index\n');
    expect(sameSteps({ steps: [{ line: 'backup' }, { line: 'dossier --index' }] }, p)).toBe(true);
    expect(sameSteps({ steps: [{ line: 'dossier --index' }, { line: 'backup' }] }, p)).toBe(false);
    expect(sameSteps({ steps: [{ line: 'backup' }] }, p)).toBe(false);
    expect(sameSteps(null, p)).toBe(false);
  });

  it("the full build's plan keeps its steps: round eighty's pass is in its cultivated fill's step, and DEPLOY says so", () => {
    // The plan file itself is left as the owner's PC runs it mid-fill (round eighty's merge): a change to it, even a
    // comment, restarted the plan on round seventy-nine's corpus-step, so the pass is said in DEPLOY.md instead.
    const text = readFileSync('scripts/corpus-plan-full.txt', 'utf8');
    const steps = parsePlan(text).map((s: { line: string }) => s.line);
    expect(steps.filter((l: string) => l === 'dossier --fill inat --bulk bulk').length).toBe(1);
    expect(readFileSync('docs/DEPLOY.md', 'utf8')).toMatch(/most-voted/);
  });
});

describe('/about/how', () => {
  it('says which 24 a taxon of more than 24 shows, and when', () => {
    const page = readFileSync('src/routes/about/how/+page.svelte', 'utf8');
    expect(page).not.toContain('of a taxon with more than 24 such observations, the 24 whose photographs iNaturalist received last, since the export holds no votes;');
    expect(page).toContain('of a taxon with more than 24 such observations, the 24 iNaturalist puts first by votes, asked of iNaturalist directly');
  });
});
