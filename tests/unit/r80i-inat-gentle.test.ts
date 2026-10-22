/**
 * Round eighty, agent I: iNaturalist's fill made gentler and smarter after iNaturalist throttled the owner's first fill
 * (5,273 requests at 1.1 s apart, then 429 on every call; later that day, at 1.5 s, again after about 350 pages):
 *   - the observation searches several taxa a request, of the API's v2 with only the fields read (`inat-batch.ts`), each
 *     page's set its first 12 (or 24) observations of the answer, asked again where the answer cannot say;
 *   - one request every 2 s, at most 4,000 a day;
 *   - a 429 retried once, slowly, then a refusal that says it is a throttle, which the fill waits out at length and goes
 *     on, and says as a throttle, never as the day's allowance.
 * Each case FAILED on r80f unless it says "guard": there `inat-batch.ts`, `THROTTLED`, `isThrottle` and `setSlowRetryMs`
 * do not exist, the pace is 1.5 s and the day 9,000, a 429 is retried five times at 4 to 20 s, and the fill asks one
 * search a page and stops at the first refusal saying "iNaturalist allows about 10,000 calls a day".
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { JsonFetcher, FetchResult } from '$dossier/fetch';
import * as fetchMod from '$dossier/fetch';
import * as inat from '$dossier/sources/inat';
import { INAT_DAY_BUDGET } from '$dossier/day-budget';

const batchMod = await import('$dossier/inat-batch').catch(() => null);
const B = () => { if (!batchMod) throw new Error('src/lib/dossier/inat-batch.ts is missing'); return batchMod; };

/** An observation marked captive whose identifications agree (`agreedCaptive`), with one CC0 photograph. */
const cap = (id: number, taxon: number, votes = 0) => ({
  id, uuid: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`, captive: true, quality_grade: 'casual', observed_on: '2025-05-01', cached_votes_total: votes,
  taxon: { id: taxon, name: `Taxon ${taxon}`, rank: 'species', ancestor_ids: [47126, taxon] }, community_taxon_id: taxon, num_identification_disagreements: 0,
  identifications: [{ current: true, taxon: { id: taxon, ancestor_ids: [47126] } }, { current: true, taxon: { id: taxon, ancestor_ids: [47126] } }],
  photos: [{ id: id * 10, license_code: 'cc0', url: `https://inaturalist-open-data.s3.amazonaws.com/photos/${id * 10}/square.jpg`, attribution: 'no rights reserved', original_dimensions: { width: 2048, height: 1536 } }],
  user: { login: `grower${id}`, name: id % 2 ? `Grower ${id}` : '' }
});

describe('the observation searches, several taxa a request', () => {
  it("a page's own search is read back, and the same search of several taxa is of v2 with only the fields read", () => {
    const { obsAsk, lightUrl, OBS_FIELDS, INAT2 } = B();
    expect(obsAsk(inat.wildUrl(135254, 24))).toEqual({ kind: 'wild', taxon: 135254, perPage: 24 });
    expect(obsAsk(inat.cultivatedUrl(75434, 12))).toEqual({ kind: 'cultivated', taxon: 75434, perPage: 12 });
    expect(obsAsk(`${inat.INAT}/taxa/135254`)).toBeNull(); // guard: anything else passes
    expect(obsAsk(`${inat.INAT}/observations?taxon_id=1&per_page=12`)).toBeNull();
    const u = lightUrl('cultivated', [135254, 75434], 200);
    expect(u.startsWith(`${INAT2}/observations?taxon_id=135254,75434&photo_license=cc0,cc-by,cc-by-sa&photos=true&captive=true&identifications=most_agree&order_by=votes&per_page=200&fields=`)).toBe(true);
    expect(decodeURIComponent(u.split('&fields=')[1])).toBe(OBS_FIELDS);
    // Every field `inat.photos` and `agreedCaptive` read, and the observer.
    for (const k of ['uuid:!t', 'captive:!t', 'community_taxon_id:!t', 'num_identification_disagreements:!t', 'ancestor_ids:!t', 'current:!t', 'license_code:!t', 'attribution:!t', 'original_dimensions:(width:!t,height:!t)', 'user:(login:!t,name:!t)']) expect(OBS_FIELDS).toContain(k);
  });

  it("each taxon's set is its first observations of the answer, asked again where the answer cannot say, halved when no taxon is settled", async () => {
    const { askBatch } = B();
    // Three taxa: A with 300 observations, B with 5, C with 30; the API's order: A's first, then B's, then C's.
    const all = [...Array.from({ length: 300 }, (_, i) => cap(1000 + i, 1)), ...Array.from({ length: 5 }, (_, i) => cap(2000 + i, 2)), ...Array.from({ length: 30 }, (_, i) => cap(3000 + i, 3))];
    const asked: string[] = [];
    const f = (async <T,>(url: string): Promise<FetchResult<T>> => {
      asked.push(url);
      const taxa = /taxon_id=([\d,]+)/.exec(url)![1].split(',').map(Number);
      const of = all.filter((o) => taxa.includes(o.taxon.id));
      return { status: 'ok', data: { total_results: of.length, results: of.slice(0, 200) } as T };
    }) as JsonFetcher;
    const r = await askBatch(f, 'cultivated', [1, 2, 3], 12);
    // A is settled by the first answer (12 of it there); B and C asked again together, and that answer is whole.
    expect(asked.length).toBe(2);
    expect(r.sets.get(1)!.map((o) => (o as { id: number }).id)).toEqual(all.slice(0, 12).map((o) => o.id));
    expect(r.sets.get(2)!.length).toBe(5);
    expect(r.sets.get(3)!.map((o) => (o as { id: number }).id)).toEqual(all.slice(305, 317).map((o) => o.id));
    // No taxon settled by an answer (200 observations of 40 taxa, 5 each, more of each beyond): halved.
    const many = Array.from({ length: 40 }, (_, t) => Array.from({ length: 10 }, (_, i) => cap(10_000 + t * 100 + i, 100 + t))).flat().sort((a, b) => (a.id % 100) - (b.id % 100));
    const g = (async <T,>(url: string): Promise<FetchResult<T>> => {
      const taxa = /taxon_id=([\d,]+)/.exec(url)![1].split(',').map(Number);
      const of = many.filter((o) => taxa.includes(o.taxon.id));
      return { status: 'ok', data: { total_results: of.length, results: of.slice(0, 200) } as T };
    }) as JsonFetcher;
    const h = await askBatch(g, 'cultivated', Array.from({ length: 40 }, (_, t) => 100 + t), 12);
    expect(h.sets.size).toBe(40);
    for (const [, s] of h.sets) expect(s.length).toBe(10);
    // A refusal stops it and is passed up; a taxon alone is never a batch.
    const refused = await askBatch((async () => ({ status: 'refused', detail: 'api.inaturalist.org 429: throttled by the host' })) as unknown as JsonFetcher, 'wild', [1, 2], 24);
    expect(refused).toMatchObject({ asked: 1, refused: 'api.inaturalist.org 429: throttled by the host' });
    expect((await askBatch(f, 'wild', [7], 24)).asked).toBe(0);
  });

  it("the fill's fetcher answers a page's own search from the batch asked ahead, and asks one not asked ahead of v2, alone", async () => {
    const { inatBatched, lightUrl } = B();
    const asked: string[] = [];
    const inner = (async <T,>(url: string): Promise<FetchResult<T>> => {
      asked.push(url);
      return { status: 'ok', data: { total_results: 3, results: [cap(1, 135254, 2), cap(2, 75434), cap(3, 135254)] } as T };
    }) as JsonFetcher;
    const f = inatBatched(inner);
    expect(await f.prefetch('cultivated', [135254, 75434], 12)).toBeUndefined();
    expect(asked).toEqual([lightUrl('cultivated', [135254, 75434], 200)]);
    const a = await inat.photos(f, 135254, false, 12, { key: 'k2735933' as never });
    const b = await inat.photos(f, 75434, false, 12, { key: 'k339841' as never });
    expect(asked.length).toBe(1); // both answered from the one search
    expect(a.status === 'ok' && a.data.map((p) => p.id)).toEqual(['10', '30']);
    expect(b.status === 'ok' && b.data.map((p) => p.id)).toEqual(['20']);
    // The same page's set as its own search gives it (guard: `inat.photos` reads both alike).
    const own = await inat.photos((async <T,>() => ({ status: 'ok', data: { results: [cap(1, 135254, 2), cap(3, 135254)] } as T })) as JsonFetcher, 135254, false, 12, { key: 'k2735933' as never });
    expect(a).toEqual(own);
    await inat.photos(f, 135254, true, 24);
    expect(asked[1]).toBe(lightUrl('wild', [135254], 24));
    expect(f.stats).toEqual({ batches: 1, served: 2, own: 1 });
  });

  it('groups the wild searches six of like size by the open data\'s counts', () => {
    const { wildGroups, WILD_BATCH } = B();
    expect(WILD_BATCH).toBe(6);
    const counts: Record<number, number> = { 1: 700, 2: 30, 3: 26, 4: 400, 5: 28, 6: 31, 7: 900, 8: 27, 9: 25 };
    expect(wildGroups([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], (t) => counts[t])).toEqual([[9, 3, 8, 5, 2, 6], [4, 1, 7, 10]]);
  });
});

describe("iNaturalist's pace, its day and its throttle", () => {
  it('one request every 2 s', async () => {
    const at: number[] = [];
    const f = fetchMod.makeFetcher((async () => { at.push(Date.now()); return new Response('{}', { status: 200 }); }) as unknown as typeof fetch);
    fetchMod.resetPacing();
    await f('https://api.inaturalist.org/v1/taxa/1');
    await f('https://api.inaturalist.org/v1/taxa/2');
    expect(at[1] - at[0]).toBeGreaterThanOrEqual(1990); // r80f: 1,500
  });

  it("a 429 is retried once, slowly, then refused as a throttle; the day's allowance is not a throttle", async () => {
    const { setSlowRetryMs, THROTTLED, isThrottle } = fetchMod as unknown as { setSlowRetryMs: (n: number) => void; THROTTLED: string; isThrottle: (d?: string) => boolean };
    setSlowRetryMs(10);
    let n = 0;
    const f = fetchMod.makeFetcher((async () => { n++; return new Response('{}', { status: 429 }); }) as unknown as typeof fetch);
    fetchMod.resetPacing();
    const r = await f('https://api.inaturalist.org/v2/observations?taxon_id=1');
    expect(n).toBe(2); // r80f: six (five retries)
    expect(r).toEqual({ status: 'refused', detail: `api.inaturalist.org 429: ${THROTTLED}` });
    expect(isThrottle(r.status === 'refused' ? r.detail : '')).toBe(true);
    expect(isThrottle('api.inaturalist.org rate-limiting; not asked again for a while')).toBe(true);
    expect(isThrottle("api.inaturalist.org: today's allowance of 4000 requests is spent (UTC 2026-10-22); asked again tomorrow")).toBe(false);
    expect(isThrottle('api.inaturalist.org 500')).toBe(false);
    // GBIF's 429 is retried as before (guard).
    let m = 0;
    const g = fetchMod.makeFetcher((async () => { m++; return m < 2 ? new Response('{}', { status: 429, headers: { 'retry-after': '0' } }) : new Response('{}', { status: 200 }); }) as unknown as typeof fetch);
    expect((await g('https://api.gbif.org/v1/species/1')).status).toBe('ok');
    fetchMod.resetPacing();
    setSlowRetryMs(60_000);
  }, 20_000);

  it('at most 4,000 a day', () => {
    expect(INAT_DAY_BUDGET).toBe(4000); // r80f: 9,000
  });
});

describe('the fill, run', () => {
  const root = resolve('.');
  /** Two pages whose cultivated sets are to fill (their ids checked, their wild sets the API's), and a fake API. */
  function folder(answers: Record<string, unknown>) {
    const dir = mkdtempSync(join(tmpdir(), 'r80i-fill-'));
    const v3 = join(dir, 'static/s/v3');
    mkdirSync(v3, { recursive: true });
    for (const k of ['k2735933', 'k339841']) {
      const d = JSON.parse(readFileSync(`fixtures/dossiers/s/v3/${k}.json`, 'utf8'));
      d.upstream['inat.taxon'] = { status: 'ok', at: '2026-10-20T00:00:00.000Z', detail: `iNaturalist's taxon ${d.ids.inat} is active` };
      d.upstream['inat.photos.cultivated'] = { status: 'skipped', at: '2026-10-20T00:00:00.000Z', detail: 'not asked: this build left iNaturalist to the daily fill (--fill inat)' };
      d.photos = d.photos.filter((p: { captive?: boolean }) => !p.captive);
      writeFileSync(join(v3, `${k}.json`), JSON.stringify(d));
    }
    writeFileSync(join(dir, 'answers.json'), JSON.stringify(answers));
    writeFileSync(join(dir, 'fake.mjs'), `import { appendFileSync, readFileSync } from 'node:fs';\nconst answers = JSON.parse(readFileSync(${JSON.stringify(join(dir, 'answers.json'))}, 'utf8'));\nglobalThis.fetch = async (u) => { const url = String(u); appendFileSync(${JSON.stringify(join(dir, 'asked.txt'))}, url + '\\n'); let a = answers[url]; if (Array.isArray(a)) a = a.length > 1 ? a.shift() : a[0]; if (a && a.__status) return new Response('{}', { status: a.__status }); if (a) return new Response(JSON.stringify(a), { status: 200, headers: { 'content-type': 'application/json' } }); throw new TypeError('fetch failed'); };\n`);
    return { dir, v3 };
  }
  const fill = (dir: string, env: Record<string, string> = {}) => spawnSync(process.execPath, ['--import', pathToFileURL(join(dir, 'fake.mjs')).href, '--import', pathToFileURL(join(root, 'node_modules/tsx/dist/loader.mjs')).href, join(root, 'scripts/build-dossiers.ts'), '--fill', 'inat', '--no-inat-open', '--no-cache'], { cwd: dir, encoding: 'utf8', env: { ...process.env, TSX_TSCONFIG_PATH: join(root, 'tsconfig.json'), CULTIFOLIO_SLOW_RETRY_MS: '5', CULTIFOLIO_INAT_WAITS: '0', ...env } });
  const askedIn = (dir: string) => (existsSync(join(dir, 'asked.txt')) ? readFileSync(join(dir, 'asked.txt'), 'utf8').trim().split('\n') : []);
  const page = (v3: string, k: string) => JSON.parse(readFileSync(join(v3, `${k}.json`), 'utf8'));
  const both = () => B().lightUrl('cultivated', [135254, 75434], 200);
  const answer = { total_results: 3, results: [cap(1, 135254, 3), cap(2, 75434), cap(3, 135254)] };

  it("asks both pages' cultivated sets in one search, and each page takes its own, its CC0 credits naming the observer", () => {
    const { dir, v3 } = folder({ [both()]: answer });
    const r = fill(dir);
    expect(r.stderr).not.toMatch(/Error/);
    expect(r.status).toBe(0);
    expect(askedIn(dir)).toEqual([both()]); // r80f: one v1 search a page
    expect(r.stdout).toMatch(/one every 2 s, the observation searches several taxa a request/);
    expect(r.stdout).toMatch(/1 batched searches answered 2 sets, 0 asked alone/);
    const cop = page(v3, 'k2735933'), wel = page(v3, 'k339841');
    expect(cop.photos.filter((p: { captive?: boolean }) => p.captive).map((p: { id: string; attribution: string }) => [p.id, p.attribution])).toEqual([['10', 'Grower 1, no rights reserved (CC0)'], ['30', 'Grower 3, no rights reserved (CC0)']]);
    // No name: the login.
    expect(wel.photos.filter((p: { captive?: boolean }) => p.captive).map((p: { attribution: string }) => p.attribution)).toEqual(['grower2, no rights reserved (CC0)']);
    expect(cop.upstream['inat.photos.cultivated']).toMatchObject({ status: 'ok' });
    expect(cop.upstream['inat.photos.cultivated'].detail).toMatch(/^observations marked captive or cultivated whose identifications agree; filled \d{4}-\d{2}-\d{2}$/);
    rmSync(dir, { recursive: true, force: true });
  }, 180_000);

  it('waits out a throttle at length and goes on, saying it is a throttle and not the day\'s allowance', () => {
    // 429 twice (the request and its one retry), then the answer.
    const { dir, v3 } = folder({ [both()]: [{ __status: 429 }, { __status: 429 }, answer] });
    const r = fill(dir);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/iNaturalist is throttling this address \(api\.inaturalist\.org 429: throttled by the host\): waiting 0 minutes, then going on\. This is its throttle, not the day's allowance \(\d+ of the day's 4000 requests made/);
    expect(askedIn(dir)).toEqual([both(), both(), both()]);
    expect(page(v3, 'k2735933').upstream['inat.photos.cultivated'].status).toBe('ok');
    rmSync(dir, { recursive: true, force: true });
  }, 180_000);

  it("stops for the day when the throttle outlasts the waits, saying so; the day's allowance is said as the allowance", () => {
    const { dir, v3 } = folder({ [both()]: [{ __status: 429 }], [B().lightUrl('cultivated', [135254], 12)]: [{ __status: 429 }] });
    const r = fill(dir);
    expect(r.status).toBe(3);
    expect(r.stdout).toMatch(/iNaturalist is throttling this address \(api\.inaturalist\.org 429: throttled by the host\), and still was after waiting 0 minutes: this is iNaturalist's throttle, not the day's allowance/);
    expect(r.stdout).not.toMatch(/allowance is spent|allows about 10,000/);
    expect(page(v3, 'k2735933').upstream['inat.photos.cultivated'].status).toBe('skipped'); // the page as it was
    rmSync(dir, { recursive: true, force: true });
    const second = folder({ [both()]: answer });
    const s = spawnSync(process.execPath, ['--import', pathToFileURL(join(second.dir, 'fake.mjs')).href, '--import', pathToFileURL(join(root, 'node_modules/tsx/dist/loader.mjs')).href, join(root, 'scripts/build-dossiers.ts'), '--fill', 'inat', '--no-inat-open', '--no-cache', '--inat-budget', '0'], { cwd: second.dir, encoding: 'utf8', env: { ...process.env, TSX_TSCONFIG_PATH: join(root, 'tsconfig.json') } });
    expect(s.status).toBe(3);
    expect(s.stdout).toMatch(/The day's allowance is spent \(api\.inaturalist\.org: today's allowance of 0 requests is spent \(UTC [\d-]+\); asked again tomorrow\): 0 of the day's 0 requests made \(UTC [\d-]+\); not a throttle\. 0 filled; 2 still to do; run this again tomorrow \(UTC\), and it goes on from here\./);
    expect(askedIn(second.dir)).toEqual([]);
    rmSync(second.dir, { recursive: true, force: true });
  }, 240_000);
});
