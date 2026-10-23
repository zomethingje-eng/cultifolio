/**
 * Round eighty-one, agent B: a cultivated fill that loses its network (review B2), on the real builder.
 *   - A request that reached no server is not charged to iNaturalist's day (`dayBudget` gives it back).
 *   - A page whose request was not answered is left as it was, to be asked again, never written "error" and counted
 *     done; the run says how many and exits unfinished (3), so the corpus step never passes step 11 with pages unasked.
 *   - A run of pages not answered (the network gone) stops the day's run at once, saying the connection may be down.
 *   - An error the host answered (a status) is recorded; met again by a later run, it is taken as the page's answer, so
 *     one page iNaturalist cannot answer never holds the fill for ever.
 *   - The review stop counts the rows left "error".
 * Each case FAILED on r81base: there every page is written "error", the run exits 0 saying "Every dossier has been asked
 * for its photographs", each failed request is charged, and the review says nothing of rows left "error".
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { JsonFetcher } from '$dossier/fetch';
import { makeFetcher } from '$dossier/fetch';
import { dayBudget } from '$dossier/day-budget';
import * as inat from '$dossier/sources/inat';
// @ts-ignore a plain .mjs module
import { classify, stopSentence, facts } from '../../scripts/corpus-step.mjs';

const root = resolve('.');
const today = () => new Date().toISOString().slice(0, 10);

describe("iNaturalist's day is not charged for a request that reached no server", () => {
  const memory = () => { const m = new Map<string, number>(); return { read: (d: string) => m.get(d) ?? 0, write: (d: string, n: number) => void m.set(d, n), m }; };
  const URL1 = 'https://api.inaturalist.org/v2/observations?taxon_id=1';
  it('a connection that failed is given back; a timeout and an answer, even an error, stay counted', async () => {
    const store = memory();
    const unreached = makeFetcher((async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch);
    const r = await dayBudget(unreached, 'api.inaturalist.org', 10, store, () => '2026-10-24')(URL1);
    expect(r).toMatchObject({ status: 'error', detail: 'api.inaturalist.org fetch failed', unreached: true });
    expect(store.m.get('2026-10-24')).toBe(0); // r81base: 1, for two calls that both failed
    const five = makeFetcher((async () => new Response('{}', { status: 500 })) as unknown as typeof fetch);
    const r2 = await dayBudget(five, 'api.inaturalist.org', 10, store, () => '2026-10-24')(URL1);
    expect(r2).toEqual({ status: 'error', detail: 'api.inaturalist.org 500' }); // guard: the host answered
    expect(store.m.get('2026-10-24')).toBe(1);
    const slow = (async () => ({ status: 'error', detail: 'api.inaturalist.org timeout' })) as unknown as JsonFetcher;
    await dayBudget(slow, 'api.inaturalist.org', 10, store, () => '2026-10-24')(URL1);
    expect(store.m.get('2026-10-24')).toBe(2); // guard: a timeout may have reached the host
  }, 30_000);
});

describe('the fill, run with its network gone', () => {
  /** Three pages whose cultivated sets are to ask: two with a checked taxon, one without (asked by name). */
  function folder(answers: Record<string, unknown>, edit: (k: string, d: Record<string, any>) => void = () => {}) {
    const dir = mkdtempSync(join(tmpdir(), 'r81b-net-'));
    const v3 = join(dir, 'static/s/v3');
    mkdirSync(v3, { recursive: true });
    for (const k of ['k2735933', 'k339841', 'k2735990']) {
      const d = JSON.parse(readFileSync(`fixtures/dossiers/s/v3/${k}.json`, 'utf8'));
      if (d.ids.inat) d.upstream['inat.taxon'] = { status: 'ok', at: '2026-10-21T00:00:00.000Z', detail: 'checked' };
      d.upstream['inat.photos.cultivated'] = { status: 'skipped', at: '2026-10-21T00:00:00.000Z', detail: 'not asked: this build left iNaturalist to the daily fill' };
      edit(k, d);
      writeFileSync(join(v3, `${k}.json`), JSON.stringify(d));
    }
    writeFileSync(join(dir, 'answers.json'), JSON.stringify(answers));
    writeFileSync(join(dir, 'fake.mjs'), `import { appendFileSync, readFileSync } from 'node:fs';\nconst answers = JSON.parse(readFileSync(${JSON.stringify(join(dir, 'answers.json'))}, 'utf8'));\nglobalThis.fetch = async (u) => { const url = String(u); appendFileSync(${JSON.stringify(join(dir, 'asked.txt'))}, url + '\\n'); const k = Object.keys(answers).find((x) => x === url || (x.startsWith('re:') && new RegExp(x.slice(3)).test(url))); const a = k && answers[k]; if (a && a.__status) return new Response('{}', { status: a.__status }); if (a) return new Response(JSON.stringify(a), { status: 200, headers: { 'content-type': 'application/json' } }); throw new TypeError('fetch failed'); };\n`);
    return { dir, v3 };
  }
  const fill = (dir: string, env: Record<string, string> = {}) => spawnSync(process.execPath, ['--import', pathToFileURL(join(dir, 'fake.mjs')).href, '--import', pathToFileURL(join(root, 'node_modules/tsx/dist/loader.mjs')).href, join(root, 'scripts/build-dossiers.ts'), '--fill', 'inat', '--no-cache'], { cwd: dir, encoding: 'utf8', env: { ...process.env, TSX_TSCONFIG_PATH: join(root, 'tsconfig.json'), CULTIFOLIO_SLOW_RETRY_MS: '5', CULTIFOLIO_INAT_WAITS: '0', ...env } });
  const page = (v3: string, k: string) => JSON.parse(readFileSync(join(v3, `${k}.json`), 'utf8'));
  const charged = (dir: string) => { const p = join(dir, `cache/day-budget/${today()}-api.inaturalist.org.txt`); return existsSync(p) ? Number(readFileSync(p, 'utf8')) : 0; };

  it('leaves every page unanswered as it was, charges nothing, says how many and exits unfinished', () => {
    const { dir, v3 } = folder({});
    const before = Object.fromEntries(['k2735933', 'k339841', 'k2735990'].map((k) => [k, page(v3, k)]));
    const r = fill(dir);
    expect(r.stderr).not.toMatch(/Error:/);
    expect(r.stdout).toMatch(/\b3 not answered: iNaturalist did not answer for 3 pages \(the last: .*fetch failed.*\); they are left as they were, to be asked again: run --fill inat again\./);
    expect(r.stdout).not.toMatch(/Every dossier has been asked for its photographs/); // r81base says it
    expect(r.status).toBe(3); // r81base: 0
    for (const k of ['k2735933', 'k339841', 'k2735990']) {
      const d = page(v3, k);
      // r81base: "error" ("api.inaturalist.org fetch failed; filled …"), counted done.
      expect(d.upstream['inat.photos.cultivated']).toEqual(before[k].upstream['inat.photos.cultivated']);
      expect(d.upstream['inat.photos.wild']).toEqual(before[k].upstream['inat.photos.wild']);
      expect(d.photos).toEqual(before[k].photos);
    }
    expect(charged(dir)).toBe(0); // r81base: one a call
    // The corpus step reads it as a source that did not answer, and the plan stays at the step.
    const c = classify({ code: r.status ?? 1, output: r.stdout, dropsWritten: false });
    expect(c.status).toBe('unfinished');
    expect(stopSentence({ line: 'dossier --fill inat --bulk bulk' }, c)).toMatch(/a source did not answer \(.*not answered.*\)\. Nothing is lost/);
    rmSync(dir, { recursive: true, force: true });
  }, 180_000);

  it('stops the day at a run of pages not answered, saying the connection may be down', () => {
    const { dir, v3 } = folder({});
    const r = fill(dir, { CULTIFOLIO_NO_ANSWER_RUN: '2' });
    expect(r.stdout).toMatch(/iNaturalist did not answer 2 pages in a row \(.*fetch failed.*\): the connection may be down \(a PC that went to sleep, a cable or Wi-Fi dropped\)\. Those pages are left as they were/);
    expect(r.stdout).toMatch(/0 filled; 3 still to do; run --fill inat again once the connection is back/);
    expect(r.status).toBe(3);
    const c = classify({ code: r.status ?? 1, output: r.stdout, dropsWritten: false });
    expect(c.status).toBe('unfinished');
    expect(c.why).toMatch(/^iNaturalist did not answer 2 pages in a row/);
    expect(stopSentence({ line: 'dossier --fill inat --bulk bulk' }, c)).not.toMatch(/allowance/);
    // The third page was not asked at all.
    expect(page(v3, 'k2735990').upstream['inat.photos.wild']).toEqual(JSON.parse(readFileSync('fixtures/dossiers/s/v3/k2735990.json', 'utf8')).upstream['inat.photos.wild']);
    rmSync(dir, { recursive: true, force: true });
  }, 180_000);

  it('an error the host answered is recorded, left once, and taken as the answer when a later run meets it again', () => {
    const answers = { 're:^https://api\\.inaturalist\\.org/': { __status: 500 } };
    // k2735933 met the same error on an earlier day; the others not.
    const { dir, v3 } = folder(answers, (k, d) => { if (k === 'k2735933') d.upstream['inat.photos.cultivated'] = { status: 'error', at: '2026-10-22T01:00:00.000Z', detail: 'api.inaturalist.org 500; filled 2026-10-22' }; });
    const r = fill(dir);
    expect(r.stdout).toMatch(/\b2 not answered: iNaturalist did not answer for 2 pages/);
    expect(r.status).toBe(3);
    const a = page(v3, 'k2735933').upstream['inat.photos.cultivated'];
    expect(a.status).toBe('error');
    expect(a.at > '2026-10-22T01:00:00.000Z').toBe(true);
    expect(page(v3, 'k339841').upstream['inat.photos.cultivated'].status).toBe('error');
    expect(charged(dir)).toBeGreaterThan(0); // guard: the host answered, so the day counts it
    // The next run meets the same errors: each is the page's answer now, and the fill is done (the review stop counts them).
    const r2 = fill(dir);
    expect(r2.stdout).toMatch(/Every dossier has been asked for its photographs/);
    expect(r2.status).toBe(0);
    rmSync(dir, { recursive: true, force: true });
  }, 240_000);
});

describe('the review stop counts the rows left "error"', () => {
  it('names how many pages, by source, and a few of them', () => {
    const dir = mkdtempSync(join(tmpdir(), 'r81b-facts-'));
    mkdirSync(join(dir, 'static/s/v3'), { recursive: true });
    const d = JSON.parse(readFileSync('fixtures/dossiers/s/v3/k339841.json', 'utf8'));
    d.upstream['inat.photos.cultivated'] = { status: 'error', at: '2026-10-24T01:00:00Z', detail: `api.inaturalist.org 500; filled 2026-10-24` };
    writeFileSync(join(dir, 'static/s/v3/k339841.json'), JSON.stringify(d));
    writeFileSync(join(dir, 'static/s/v3/k2735933.json'), readFileSync('fixtures/dossiers/s/v3/k2735933.json'));
    expect(facts(dir, 'x', undefined)).toMatch(/; 1 page holds a row a source did not answer \("error": inat\.photos\.cultivated 1; k339841\), each said "did not answer" on its page until a fill or a build asks it again;/);
    expect(inat.cultivatedSettled(d.upstream['inat.photos.cultivated'])).toBe(false); // guard: the next fill asks it
    rmSync(dir, { recursive: true, force: true });
  });
});
