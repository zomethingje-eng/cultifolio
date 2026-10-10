/**
 * Round sixty-seven, agent S: the server items of triage-66 (S1 to S10). Several are reviewer D's probes of round
 * sixty-six (`/tmp/rev66/D/tests/unit/r66d-probes.test.ts`), adopted and turned into what the server must do now.
 *
 * Which of these FAIL on the base (commit 8f2d56c) is said in /tmp/r67/S-report.md; each `describe` names its item.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { version } from '$app/environment';
import * as sync from '$lib/server/sync';
import { storeOnce, deleteCounted, readMeta, writeMeta, resetRateLimits, resetMetaFlush, listBatches, MAX_LIST_PAGES, PhotoBusy, storeCounted, DayQuota } from '$lib/server/sync';
import { Counters } from '$lib/server/counters';
import { unnamedGenerations, photoRef } from '$lib/server/photogen';
import { fakeKV, fakeR2, countersNs, type FakeR2 } from './helpers/fake-sync';
import { casR2 } from './helpers/r62s-fake';
import { countersWithStore } from './helpers/r63s-fake';
import { pagedStorage } from './helpers/r61s-fake';
// Imported here, not inside the tests: the first import of a route transforms its module graph, which on a loaded machine
// can take longer than a test's own time.
import * as photoRoute from '../../src/routes/api/sync/photo/[id]/+server';
import * as forecastRoute from '../../src/routes/api/forecast/+server';
import * as namesRoute from '../../src/routes/api/names/+server';
import * as vaultRoute from '../../src/routes/api/sync/vault/+server';
import * as synonyms from '$lib/server/synonyms';
import { forBuild } from '$lib/server/build';
import { tokenHash } from '$lib/sync/crypto';

const ID = 'ABCDEFGHJKMNPQRSTVWXYZ2346';
const OWNER = 'd'.repeat(64);
const STRANGER = 'e'.repeat(64);
const PID = 'p000001';
const NAME = `vault/${ID}/photo/${PID}.bin`;
const REF = `vault/${ID}/photoref/${PID}.json`;
const MIN = 60_000;
const meta = async (r2: FakeR2) => (await readMeta(r2 as never, ID))!;
const q = (counters: unknown, now: number, ip = '1.2.3.4') => ({ kv: fakeKV() as never, ip, counters: counters as never, now });
/** The fake bucket's own clock, so the server's "now" and the uploads agree. */
const clockOf = async (r2: FakeR2) => { await r2.put('probe', 'x'); const t = r2.objs.get('probe')!.uploaded.getTime(); r2.objs.delete('probe'); return t + 1; };
const live = (r2: FakeR2) => sync.photoObjectKey(r2 as never, NAME);
/** A revived photograph: stored, removed, stored again as a generation named by a pointer. */
async function revived(r2: ReturnType<typeof casR2>, ns: unknown) {
  await writeMeta(r2 as never, ID, { tokenHash: 'h', created: 'c', entitlement: 'open', bytes: 0, filled: true });
  const T0 = await clockOf(r2);
  await storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(1000).fill(1), { drop: OWNER }, q(ns, T0));
  expect(await deleteCounted(r2 as never, ID, await meta(r2), NAME, q(ns, T0 + 11 * MIN), OWNER, T0 + 10 * MIN)).toBe(true);
  expect(await storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(900).fill(3), { drop: OWNER }, q(ns, T0 + 12 * MIN))).toBe('stored');
  const gen = await live(r2);
  expect(gen).toMatch(/\.g[0-9a-z]+$/);
  return { T0, gen: gen! };
}
/** One failure reading the pointer's body (R2 answered the get, the stream broke). */
function breakPointerOnce(r2: FakeR2, times = 1) {
  const get = r2.get.bind(r2);
  let left = times;
  r2.get = (async (k: string) => { const o = await get(k); if (o && k === REF && left > 0) { left--; return { ...o, json: async () => { throw new Error('stream reset'); } }; } return o; }) as typeof r2.get;
}
beforeEach(() => { resetRateLimits(); resetMetaFlush(); });

describe('S1: an unreadable pointer is never a removed photograph (S-D1, R45-21)', () => {
  it('a token-only PUT met by a pointer whose body fails to read waits, and the live generation stays named (D7, inverted)', async () => {
    const r2 = casR2(); const ns = countersWithStore(r2);
    const { T0, gen } = await revived(r2, ns);
    const before = [...r2.objs.keys()].sort();
    breakPointerOnce(r2, 2); // the pre-hold look and the look under the hold
    const e = await storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(5).fill(9), { drop: STRANGER }, q(ns, T0 + 13 * MIN)).catch((x) => x);
    expect(e).toBeInstanceOf(PhotoBusy);
    expect(await live(r2)).toBe(gen);
    expect(r2.objs.has(gen)).toBe(true);
    expect([...r2.objs.keys()].sort()).toEqual(before); // nothing stored, nothing moved
  });
  it('GET and HEAD of a photograph whose pointer cannot be read answer 503 with Retry-After, never 404 "no such photo"', async () => {
    const r2 = casR2(); const ns = countersWithStore(r2);
    const token = 'c'.repeat(64);
    await revived(r2, ns);
    const m = await meta(r2);
    await writeMeta(r2 as never, ID, { ...m, tokenHash: await tokenHash(token) });
    const route = photoRoute;
    for (const method of ['GET', 'HEAD'] as const) {
      breakPointerOnce(r2);
      const request = new Request(`https://x/api/sync/photo/${PID}?vault=${ID}`, { method, headers: { authorization: `Bearer ${token}` } });
      const r = await route[method]({ request, url: new URL(request.url), params: { id: PID }, platform: { env: { STORE: r2, QUEUE: fakeKV(), COUNTERS: ns } }, getClientAddress: () => '1.2.3.4' } as never);
      expect(r.status).toBe(503);
      expect(Number(r.headers.get('retry-after'))).toBeGreaterThan(0);
      if (method === 'GET') expect(((await r.json()) as { error: string }).error).toMatch(/could not be read/);
    }
  });
});

describe('S2: Workers Logs is off (S-F1), and faults are counts in the counter object', () => {
  it('wrangler.jsonc does not turn on observability or invocation logs: they keep every URL, and /about/how says the server does not log paths', () => {
    const text = readFileSync(new URL('../../wrangler.jsonc', import.meta.url), 'utf8');
    // JSONC: comments out (a `//` inside a string, as in a URL, is kept), then trailing commas.
    const plain = text.replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, s) => s ?? '').replace(/,(\s*[}\]])/g, '$1');
    const cfg = JSON.parse(plain) as { observability?: { enabled?: boolean; logs?: { enabled?: boolean; invocation_logs?: boolean } } };
    const o = cfg.observability;
    expect(o?.enabled === true).toBe(false);
    expect(o?.logs?.enabled === true).toBe(false);
    expect(o?.logs?.invocation_logs === true).toBe(false);
  });
  it('a fault is counted by kind for the day in the "vaults" object, with no address or id, and kept a week', async () => {
    const s = pagedStorage();
    const c = new Counters({ storage: s } as never, {} as never);
    const now = Date.UTC(2026, 9, 10, 12);
    await c.fault('release', now);
    await c.fault('release', now);
    await c.fault('mark', now);
    await c.fault('1.2.3.4', now); // not a kind: nothing kept
    expect(s.m.get('e:2026-10-10')).toEqual({ release: 2, mark: 1 });
    await c.tick(now + 6 * 86_400_000);
    expect(s.m.has('e:2026-10-10')).toBe(true);
    await c.tick(now + 7 * 86_400_000);
    expect(s.m.has('e:2026-10-10')).toBe(false);
  });
  it('the Worker counts a counter object that did not answer as a fault there', async () => {
    const ns = countersNs();
    const now = Date.UTC(2026, 9, 10, 12);
    await sync.noteFault(ns as never, 'upstream', now);
    expect(ns.objects.get('vaults')!.m.get('e:2026-10-10')).toEqual({ upstream: 1 });
  });
});

describe('S3: a revival whose pointer write stalls past its hold and past ten minutes (S-D2, R45-21; D1)', () => {
  it('the sweep writes the pointer back first, so the stalled write fails: the device is asked to wait, never told "stored" for bytes that are gone', async () => {
    const r2 = casR2(); const ns = countersWithStore(r2);
    await writeMeta(r2 as never, ID, { tokenHash: 'h', created: 'c', entitlement: 'open', bytes: 0, filled: true });
    const T0 = await clockOf(r2);
    await storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(1000).fill(1), { drop: OWNER }, q(ns, T0));
    const A = T0 + 11 * MIN;
    expect(await deleteCounted(r2 as never, ID, await meta(r2), NAME, q(ns, A), OWNER, A - MIN)).toBe(true);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let stall = true;
    r2.cas.before = async (k) => { if (k === REF && stall && [...r2.objs.keys()].some((x) => /\.g[0-9a-z]+$/.test(x))) { stall = false; await gate; } };
    const up = storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(700).fill(2), { drop: OWNER }, q(ns, A + MIN)).catch((x) => x);
    for (let i = 0; i < 200 && ![...r2.objs.keys()].some((x) => /\.g[0-9a-z]+$/.test(x)); i++) await new Promise((r) => setTimeout(r, 1));
    expect([...r2.objs.keys()].some((x) => /\.g[0-9a-z]+$/.test(x))).toBe(true);
    await new Promise((r) => setTimeout(r, 20));
    // The vault's midnight alarm runs while the pointer write hangs: the upload's hold lapsed long ago.
    await ns.raw(`bytes:${ID}`).c.tick(A + 12 * MIN);
    release();
    const got = await up;
    const named = await live(r2);
    // Whatever the upload was told, the pointer never names bytes that are not there.
    if (named) expect(r2.objs.has(named)).toBe(true);
    expect(got).toBeInstanceOf(PhotoBusy);
  });
  it('an upload whose hold lapsed and was taken while its generation was written does not move the pointer (the fence)', async () => {
    const r2 = casR2(); const ns = countersWithStore(r2);
    await writeMeta(r2 as never, ID, { tokenHash: 'h', created: 'c', entitlement: 'open', bytes: 0, filled: true });
    const T0 = await clockOf(r2);
    await storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(100).fill(1), { drop: OWNER }, q(ns, T0));
    expect(await deleteCounted(r2 as never, ID, await meta(r2), NAME, q(ns, T0 + 11 * MIN), OWNER, T0 + 10 * MIN)).toBe(true);
    const receipt = (await photoRef(r2 as never, NAME)).etag;
    // While the new generation is written, another request takes the name (this upload's hold has lapsed by then).
    r2.hooks.beforePut = async (k) => { if (/\.g[0-9a-z]+$/.test(k)) { r2.hooks.beforePut = undefined; await ns.get(`bytes:${ID}`).hold!(NAME, T0 + 20 * MIN); } };
    const e = await storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(100).fill(2), { drop: OWNER }, q(ns, T0 + 12 * MIN)).catch((x) => x);
    expect(e).toBeInstanceOf(PhotoBusy);
    expect((await photoRef(r2 as never, NAME)).etag).toBe(receipt); // the pointer was not moved
    expect([...r2.objs.keys()].some((x) => /\.g[0-9a-z]+$/.test(x))).toBe(false); // its own generation was taken off
  });
});

describe('S4: the generation listing is paged, and the mark stays until a complete listing is clean (IND-8, R45-21)', () => {
  it('the shared R2 stand-in reports truncated and a cursor, as R2 does', async () => {
    const r2 = fakeR2();
    for (let i = 0; i < 5; i++) await r2.put(`a/${i}`, 'x');
    const one = await r2.list({ prefix: 'a/', limit: 2 });
    expect(one.objects.map((o) => o.key)).toEqual(['a/0', 'a/1']);
    expect(one.truncated).toBe(true);
    const two = await r2.list({ prefix: 'a/', limit: 10, cursor: (one as { cursor?: string }).cursor });
    expect(two.objects.map((o) => o.key)).toEqual(['a/2', 'a/3', 'a/4']);
    expect(two.truncated).toBe(false);
  });
  it('102 old generations with the pointer at the 101st: the sweep leaves none unnamed, or keeps the mark (IND-8)', async () => {
    const r2 = casR2(); const ns = countersWithStore(r2);
    await writeMeta(r2 as never, ID, { tokenHash: 'h', created: 'c', entitlement: 'open', bytes: 0, filled: true });
    const T0 = await clockOf(r2);
    for (let i = 0; i < 102; i++) await r2.put(`${NAME.replace(/\.bin$/, '')}.g${String(i).padStart(6, '0')}`, new Uint8Array(10));
    await r2.put(REF, JSON.stringify({ g: 'g000100', n: 'x' }));
    const A = T0 + 60 * MIN;
    await ns.get(`bytes:${ID}`).markUnnamed!(NAME, A - 20 * MIN);
    await ns.raw(`bytes:${ID}`).c.tick(A);
    const left = [...r2.objs.keys()].filter((k) => /\.g\d+$/.test(k) && !k.endsWith('g000100'));
    const marked = ns.raw(`bytes:${ID}`).s.m.has(`u:${NAME}`);
    expect(left.length === 0 || marked).toBe(true);
    expect(left).toEqual([]);
  });
  it('a listing that cannot be followed to its end is not complete, and the sweep keeps the mark', async () => {
    const r2 = casR2();
    await r2.put(REF, JSON.stringify({ g: 'g000001', n: 'x' }));
    r2.list = (async () => ({ objects: [], truncated: true })) as never;
    const found = await unnamedGenerations(r2 as never, NAME, Date.now());
    expect(found?.complete).toBe(false);
    const ns = countersWithStore(r2);
    const A = Date.now() + 60 * MIN;
    await ns.get(`bytes:${ID}`).markUnnamed!(NAME, A - 20 * MIN);
    await ns.raw(`bytes:${ID}`).c.tick(A);
    expect(ns.raw(`bytes:${ID}`).s.m.has(`u:${NAME}`)).toBe(true);
  });
});

describe('S5: new vault places per network, and the half-ceiling record (S-D3; D5)', () => {
  it('ten /48s no longer take the day: each network takes at most its part, an honest grower still gets a place, and half the day is recorded', async () => {
    const s = pagedStorage();
    const c = new Counters({ storage: s } as never, {} as never);
    const D0 = Date.UTC(2026, 9, 10, 12);
    const day = '2026-10-10';
    let vaults = 0;
    for (let net = 0; net < 10; net++) for (let host = 0; host < 4; host++) for (let v = 0; v < 5; v++) {
      if ((await c.create(`2001:db8:${net}:${host}::/64`, day, 5, 200, 2000, 0, D0, `2001:db8:${net}::/48`)) !== 'ok') continue;
      if ((await c.fill(`ATTACK-${net}-${host}-${v}`, 2000, 0, day, 200, D0, `2001:db8:${net}::/48`, sync.MAX_NEW_VAULTS_PER_NETWORK_PER_DAY)) === 'counted') vaults++;
    }
    expect(vaults).toBe(10 * sync.MAX_NEW_VAULTS_PER_NETWORK_PER_DAY);
    expect(await c.fill('HONEST0', 2000, 0, day, 200, D0, '198.51.100.0/24', sync.MAX_NEW_VAULTS_PER_NETWORK_PER_DAY)).toBe('counted');
    // A network past its part is told so, until midnight.
    expect(await c.fill('ATTACK-more', 2000, 0, day, 200, D0, '2001:db8:0::/48', sync.MAX_NEW_VAULTS_PER_NETWORK_PER_DAY)).toBe('network');
    const half = s.m.get(`o:${day}`) as { count: number; perDay: number; networks: Record<string, number> };
    expect(half.count).toBe(100);
    expect(half.networks['2001:db8:0::/48']).toBe(10);
    // Kept as the address keys are: gone at the midnight that starts the day after next.
    await c.tick(Date.UTC(2026, 9, 12, 0, 0, 1));
    expect(s.m.has(`o:${day}`)).toBe(false);
    expect([...s.m.keys()].some((k) => k.startsWith('pn:'))).toBe(false);
  });
  it('a first upload past its network\'s part is refused 503 with the network\'s sentence and Retry-After to midnight', async () => {
    const r2 = casR2(); const ns = countersNs();
    const now = Date.UTC(2026, 9, 10, 18);
    const v = ns.raw('vaults').c;
    for (let i = 0; i < sync.MAX_NEW_VAULTS_PER_NETWORK_PER_DAY; i++) await v.fill(`X${i}`, 2000, 0, '2026-10-10', 200, now, '203.0.113.0/24', sync.MAX_NEW_VAULTS_PER_NETWORK_PER_DAY);
    await writeMeta(r2 as never, ID, { tokenHash: 'h', created: 'c', entitlement: 'open', bytes: 0, filled: false });
    const e = await sync.admitVault(r2 as never, ID, await meta(r2), q(ns, now, '203.0.113.9')).catch((x) => x);
    const res = sync.refusal(e)!;
    expect(res.status).toBe(503);
    expect(Number(res.headers.get('retry-after'))).toBe(6 * 3600);
    expect(((await res.json()) as { error: string }).error).toMatch(/from this network today/);
  });
});

describe('S6: a per-vault budget on whole-log listings (S-D4; D2)', () => {
  it('a vault of 49,000 batches is listed until its hour\'s pages are spent, then refused 503 with Retry-After to the hour', async () => {
    const r2 = fakeR2();
    const keys: string[] = [];
    for (let i = 0; i < 49_000; i++) keys.push(`vault/${ID}/log/${String(1_700_000_000_000 + i * 3600_000).padStart(13, '0')}-0000-dev-${i.toString(16).padStart(12, '0')}.bin`);
    keys.sort();
    let lists = 0;
    r2.list = (async (o: { prefix: string; limit?: number; cursor?: string }) => {
      lists++;
      const from = o.cursor ? Number(o.cursor) : 0;
      const page = keys.slice(from, from + (o.limit ?? 1000));
      return { objects: page.map((k) => ({ key: k, size: 1, uploaded: new Date(1_700_000_000_000) })), truncated: from + page.length < keys.length, cursor: String(from + page.length) };
    }) as never;
    const ns = countersNs();
    const now = Date.UTC(2026, 9, 10, 12, 15);
    let refused: unknown = null, pulls = 0;
    for (; pulls < 200 && !refused; pulls++) refused = await listBatches(r2 as never, ID, Date.now(), 500, null, q(ns, now)).then(() => null, (e) => e);
    expect(refused).toBeInstanceOf(sync.ListingsSpent);
    const res = sync.refusal(refused)!;
    expect(res.status).toBe(503);
    expect(Number(res.headers.get('retry-after'))).toBe(45 * 60);
    expect(lists).toBeLessThanOrEqual(sync.LIST_PAGES_PER_HOUR + MAX_LIST_PAGES);
    // A refused pull costs no list call; the next hour lists again.
    const before = lists;
    await listBatches(r2 as never, ID, Date.now(), 500, null, q(ns, now + 1000)).catch(() => null);
    expect(lists).toBe(before);
    await listBatches(r2 as never, ID, Date.now(), 500, null, q(ns, now + 3600_000));
    expect(lists).toBe(before + 49);
  });
  it('a counter object that cannot be asked lets the listing go (receiving is never refused for the counter\'s fault)', async () => {
    const r2 = fakeR2();
    const ns = countersNs();
    ns.raw(`bytes:${ID}`).c.listAsk = async () => { throw new Error('object down'); };
    expect((await listBatches(r2 as never, ID, null, 500, null, q(ns, Date.now()))).batches).toEqual([]);
  });
});

describe('S8: refusals said as refusals (S-D6, IND-7, R45-11)', () => {
  const met = () => new Response(JSON.stringify({ properties: { timeseries: [{ time: '2026-01-10T00:00:00Z', data: { instant: { details: { air_temperature: -2 } }, next_6_hours: { details: { air_temperature_min: -2, air_temperature_max: 4 } } } }] } }), { status: 200 });
  const forecast = async (upstream: (u: string) => Promise<Response>, query = 'lat=40.38&lon=-80.05') => {
    return forecastRoute.GET({ url: new URL(`http://x/api/forecast?${query}`), platform: undefined, fetch: upstream as typeof fetch, getClientAddress: () => '1.2.3.4' } as never);
  };
  it("MET Norway's 429 and 403 are \"refused this site's request\", with its Retry-After; a 500 still \"did not answer\"", async () => {
    for (const status of [429, 403]) {
      const r = await forecast(async () => new Response('', { status, headers: { 'retry-after': '120' } }), 'lat=60&lon=10');
      expect(r.status).toBe(502);
      expect(await r.json()).toMatchObject({ error: "MET Norway refused this site's request", refused: true, status });
      expect(r.headers.get('retry-after')).toBe('120');
    }
    expect(await (await forecast(async () => new Response('', { status: 500 }), 'lat=60&lon=10')).json()).toEqual({ error: 'forecast source did not answer' });
  });
  it("the NWS: a 429 or 403 is recorded as refused; a failure or an unreachable service is not (it is 'unanswered')", async () => {
    const nws = (r: () => Promise<Response>) => async (u: string) => (u.includes('weather.gov') ? r() : met());
    const status = async (r: () => Promise<Response>) => ((await (await forecast(nws(r))).json()) as { alertsStatus: string }).alertsStatus;
    expect(await status(async () => new Response('', { status: 429 }))).toBe('refused');
    expect(await status(async () => new Response('', { status: 403 }))).toBe('refused');
    expect(await status(async () => new Response('', { status: 503 }))).toBe('unanswered');
    expect(await status(async () => { throw new DOMException('timed out', 'TimeoutError'); })).toBe('unanswered');
  });
  it("GBIF's 429 and 403 are refusals of this site's request, at the name picker and at a species address", async () => {
    const r = await namesRoute.GET({ url: new URL('http://x/api/names?q=copiapoa'), platform: undefined, fetch: (async () => new Response('', { status: 429, headers: { 'retry-after': '30' } })) as never, getClientAddress: () => '1.2.3.4' } as never);
    expect(r.status).toBe(502);
    expect(await r.json()).toMatchObject({ error: "GBIF refused this site's request", refused: true, retryAfter: 30 });
    const { synonymAsk, synonymOf } = synonyms;
    const refusing = (async () => new Response('', { status: 403 })) as never;
    expect(await synonymAsk(undefined, refusing, 'haworthia-attenuata', { idx: [] } as never, null)).toBe('refused');
    expect(await synonymOf(undefined, refusing, 'haworthia-attenuata', { idx: [] } as never, null)).toBe('unchecked'); // the old answer for a caller that does not word them apart
  });
});

describe('S9: limits and their words (S-D7, R45-24)', () => {
  it('a /64 that made no vault, in a /48 that made twenty, is refused as the network (D3, inverted)', async () => {
    const s = pagedStorage();
    const c = new Counters({ storage: s } as never, {} as never);
    const day = '2026-10-10';
    for (let i = 0; i < 20; i++) expect(await c.create(`2001:db8:1:${i}::/64`, day, 5, 200, 2000, 0, Date.now(), '2001:db8:1::/48')).toBe('ok');
    expect(await c.create('2001:db8:1:99::/64', day, 5, 200, 2000, 0, Date.now(), '2001:db8:1::/48')).toBe('network');
  });
  it('the creation route says "this network", and every refusal counted by the day waits until midnight UTC', async () => {
    const { POST } = vaultRoute;
    const ns = countersNs();
    const vaults = ns.raw('vaults').c;
    const token = (i: number) => i.toString(16).padStart(64, 'a');
    const create = async (ip: string, i: number) => {
      const id = await sync.vaultIdFor(token(i));
      const request = new Request('https://x/api/sync/vault', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, token: token(i), create: true }) });
      return POST({ request, url: new URL(request.url), platform: { env: { STORE: fakeR2(), QUEUE: fakeKV(), COUNTERS: ns, SYNC_OPEN: '1' } }, getClientAddress: () => ip } as never);
    };
    vi.useFakeTimers({ now: Date.UTC(2026, 9, 10, 20), toFake: ['Date'] });
    try {
      for (let i = 0; i < 20; i++) await vaults.create(`2001:db8:7:${i}::/64`, '2026-10-10', 5, 200, 2000, 0, Date.now(), '2001:db8:7::/48');
      const r = await create('2001:db8:7:99::1', 1);
      expect(r.status).toBe(429);
      expect(((await r.json()) as { error: string }).error).toBe('too many new vaults from this network today');
      expect(r.headers.get('retry-after')).toBe(String(4 * 3600));
      for (let i = 0; i < 5; i++) await vaults.create('192.0.2.1', '2026-10-10', 5, 200, 2000, 0, Date.now(), null);
      const a = await create('192.0.2.1', 2);
      expect(a.status).toBe(429);
      expect(a.headers.get('retry-after')).toBe(String(4 * 3600));
    } finally {
      vi.useRealTimers();
    }
  });
  it('a small log batch is not counted against the day totals of its address and network; a large one still is', async () => {
    const r2 = fakeR2(); const ns = countersNs();
    await writeMeta(r2 as never, ID, { tokenHash: 'h', created: 'c', entitlement: 'open', bytes: 0, filled: true });
    const now = Date.UTC(2026, 9, 10, 12);
    const ip = '2001:db8:5:1::1';
    // The address's day is spent by a neighbour on the same address.
    await ns.get('ipbytes:2001:db8:5:1::/64').take!('address', sync.MAX_IP_BYTES_PER_DAY, sync.MAX_IP_BYTES_PER_DAY, '2026-10-10', null, now);
    const batch = (n: number, i: number) => `vault/${ID}/log/1760097600000-0000-dev-${i.toString(16).padStart(12, '0')}.bin`;
    expect(await storeCounted(r2 as never, ID, await meta(r2), batch(0, 1), new Uint8Array(2000), undefined, {}, q(ns, now, ip), true)).toBe(true);
    const big = await storeCounted(r2 as never, ID, await meta(r2), batch(0, 2), new Uint8Array(sync.SMALL_BATCH_BYTES + 1), undefined, {}, q(ns, now, ip), true).catch((e) => e);
    expect(big).toBeInstanceOf(DayQuota);
    const photo = await storeCounted(r2 as never, ID, await meta(r2), `vault/${ID}/photo/p00000009.bin`, new Uint8Array(100), undefined, {}, q(ns, now, ip), true).catch((e) => e);
    expect(photo).toBeInstanceOf(DayQuota); // a photograph is counted, whatever its size
  });
});

describe('S7: the build in the URL of the adapter-cached answers (S-D5)', () => {
  it('an answer is kept only under the build the request names; no build named is as before; a v= never fails validation', async () => {
    const u = (s: string) => new URL(`http://x/api/search?q=aloe${s}`);
    expect(forBuild(u(`&v=${encodeURIComponent(version)}`), 'public, max-age=86400')).toBe('public, max-age=86400');
    expect(forBuild(u('&v=an-older-build'), 'public, max-age=86400')).toBe('no-store');
    expect(forBuild(u(''), 'public, max-age=86400')).toBe('public, max-age=86400');
    const { GET } = forecastRoute;
    const met = () => new Response(JSON.stringify({ properties: { timeseries: [{ time: '2026-01-10T00:00:00Z', data: { instant: { details: { air_temperature: -2 } }, next_6_hours: { details: { air_temperature_min: -2, air_temperature_max: 4 } } } }] } }), { status: 200 });
    const call = (v: string) => GET({ url: new URL(`http://x/api/forecast?lat=60&lon=10&v=${v}`), platform: undefined, fetch: (async () => met()) as never, getClientAddress: () => '1.2.3.4' } as never);
    const now = await call(encodeURIComponent(version));
    expect(now.status).toBe(200);
    expect(now.headers.get('cache-control')).toBe('public, max-age=3600');
    expect((await call('an-older-build')).headers.get('cache-control')).toBe('no-store');
    const { GET: names } = namesRoute;
    const n = await names({ url: new URL('http://x/api/names?q=ab&v=an-older-build'), platform: undefined, fetch: (async () => new Response('[]')) as never, getClientAddress: () => '1.2.3.4' } as never);
    expect(n.status).toBe(200);
    expect(n.headers.get('cache-control')).toBe('no-store');
  });
});

describe('S10: a PUT of other bytes without the proof does not hold the name (S-D10)', () => {
  it('it is answered 409 at once, even while the name is held, so a stream of them cannot keep a removal waiting', async () => {
    const r2 = casR2(); const ns = countersNs();
    await writeMeta(r2 as never, ID, { tokenHash: 'h', created: 'c', entitlement: 'open', bytes: 0, filled: true });
    const T0 = await clockOf(r2);
    await storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(10).fill(1), { drop: OWNER }, q(ns, T0));
    const h = await ns.get(`bytes:${ID}`).hold!(NAME, T0 + MIN);
    expect(h.ok).toBe(true);
    expect(await storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(10).fill(2), { drop: STRANGER }, q(ns, T0 + MIN))).toBe('different');
    // and it took no hold of its own: the holder's token still frees the name
    if (h.ok) await ns.get(`bytes:${ID}`).unhold!(NAME, h.token);
    expect(ns.raw(`bytes:${ID}`).m.has(`h:${NAME}`)).toBe(false);
  });
  it('the server keeps accepting the old ids, and takes the new shape (the time, then 16 random base-36 characters)', () => {
    expect(() => sync.photoKey(ID, 'p' + 'mg1x2k3a00dev4ab')).not.toThrow();
    expect(() => sync.photoKey(ID, 'p' + Date.now().toString(36) + 'a1b2c3d4e5f6g7h8')).not.toThrow();
  });
});
