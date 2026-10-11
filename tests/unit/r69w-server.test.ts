/**
 * Round sixty-nine, agent W: the server items of triage-68 (W1 to W6) and the green reverts R46-31 found in the server's
 * area. Each `describe` names its item; which of these fail on the base (1609c19) is said in docs/review-69/W.md.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { version } from '$app/environment';
import * as sync from '$lib/server/sync';
import { storeOnce, storeCounted, deleteCounted, readMeta, writeMeta, listBatches, resetRateLimits, resetMetaFlush, PhotoBusy, PhotoRemoved, DayQuota } from '$lib/server/sync';
import { Counters } from '$lib/server/counters';
import { photoRef } from '$lib/server/photogen';
import { fakeKV, fakeR2, countersNs, type FakeR2 } from './helpers/fake-sync';
import { casR2 } from './helpers/r62s-fake';
import { countersWithStore } from './helpers/r63s-fake';
import { pagedStorage } from './helpers/r61s-fake';
import * as searchRoute from '../../src/routes/api/search/+server';
import * as sheetsRoute from '../../src/routes/api/sheets/+server';
import * as namesRoute from '../../src/routes/api/names/+server';
import * as forecastRoute from '../../src/routes/api/forecast/+server';
import * as vaultRoute from '../../src/routes/api/sync/vault/+server';
import { synonymAsk } from '$lib/server/synonyms';
import { bucketOf } from '$core/bucket';

const ID = 'ABCDEFGHJKMNPQRSTVWXYZ2346';
const OWNER = 'd'.repeat(64);
const STRANGER = 'e'.repeat(64);
const PID = 'p000001';
const NAME = `vault/${ID}/photo/${PID}.bin`;
const REF = `vault/${ID}/photoref/${PID}.json`;
const MIN = 60_000;
const meta = async (r2: FakeR2, id = ID) => (await readMeta(r2 as never, id))!;
const q = (counters: unknown, now: number, ip = '1.2.3.4', extra: Record<string, unknown> = {}) => ({ kv: fakeKV() as never, ip, counters: counters as never, now, ...extra });
const clockOf = async (r2: FakeR2) => { await r2.put('probe', 'x'); const t = r2.objs.get('probe')!.uploaded.getTime(); r2.objs.delete('probe'); return t + 1; };
beforeEach(() => { resetRateLimits(); resetMetaFlush(); });

/** Every key and value of every counter object, as text, for a look for addresses. */
const everything = (ns: ReturnType<typeof countersNs>) => [...ns.objects.entries()].flatMap(([, o]) => [...o.m.entries()].map(([k, v]) => `${k} = ${JSON.stringify(v)}`));
/** An IPv4 address or network, or an IPv6 one (two or more hex groups joined by colons). */
const ADDRESS = /\b\d{1,3}(\.\d{1,3}){3}\b|\b[0-9a-f]{1,4}(:[0-9a-f]{0,4}){2,}/i;

describe('W1: no vault keeps its owner\'s network past two days (S-E1)', () => {
  it('after the sweeps, no record in any counter object holds an address-shaped string; the creation, place, bytes, fault and half-day records all ran', async () => {
    const r2 = fakeR2(); const ns = countersNs();
    const day = '2026-10-10';
    const now = Date.UTC(2026, 9, 10, 12);
    const v6 = '2001:db8:1234:5678::9', v4 = '203.0.113.7';
    // A creation from each, counted by address and /48.
    expect(await sync.allowCreation(fakeKV() as never, v6, now, {}, ns)).toBe('ok');
    expect(await sync.allowCreation(fakeKV() as never, v4, now, {}, ns)).toBe('ok');
    // Three vaults take their places, by network; the day's ceiling of 4 is half spent, so the operator's record is written.
    const ids = ['V6AAAAAAAAAAAAAAAAAAAAAAAA', 'V4AAAAAAAAAAAAAAAAAAAAAAAA', 'V4BBBBBBBBBBBBBBBBBBBBBBBB'];
    for (const [i, id] of ids.entries()) {
      await writeMeta(r2 as never, id, { tokenHash: 'h', created: 'c', entitlement: 'open', bytes: 0, filled: false });
      expect(await sync.admitVault(r2 as never, id, await meta(r2, id), q(ns, now, i ? v4 : v6, { perDay: 4 }))).toBe(true);
    }
    expect(ns.raw('vaults').m.get(`o:${day}`)).toBeTruthy();
    // A photograph stored from the IPv4 address (its day's bytes), and a fault counted.
    await writeMeta(r2 as never, ID, { tokenHash: 'h', created: 'c', entitlement: 'open', bytes: 0, filled: true });
    expect(await storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(50).fill(1), { drop: OWNER }, q(ns, now, v4))).toBe('stored');
    await sync.noteFault(ns, 'place', now);
    // A place written by rounds sixty-seven and sixty-eight, with its network on it.
    ns.raw('vaults').m.set('f:OLDPLACEAAAAAAAAAAAAAAAAAA', { d: day, w: day, n: '198.51.100.0/24' });
    // The midnight that starts the day after next: every day key of the 10th goes.
    for (const [, o] of ns.objects) await o.c.tick(Date.UTC(2026, 9, 12, 0, 0, 1));
    const left = everything(ns);
    expect(left.filter((l) => ADDRESS.test(l))).toEqual([]);
    for (const net of ['2001:db8', '203.0.113', '198.51.100']) expect(left.filter((l) => l.includes(net))).toEqual([]);
    // The places themselves are kept: the sweep took the network off, nothing else.
    expect(ns.raw('vaults').m.get('f:OLDPLACEAAAAAAAAAAAAAAAAAA')).toEqual({ d: day, w: day });
    for (const id of ids) expect(ns.raw('vaults').m.get(`f:${id}`)).toEqual({ d: day, w: day });
  });
  it('a place given back on its day is given back to its network too, read from the day-dated key (and from a place written before)', async () => {
    const s = pagedStorage();
    const c = new Counters({ storage: s } as never, {} as never);
    const day = '2026-10-10', now = Date.UTC(2026, 9, 10, 12);
    for (let i = 0; i < 10; i++) expect(await c.fill(`N${i}`, 2000, 0, day, 200, now, '203.0.113.0/24', 10)).toBe('counted');
    expect(await c.fill('N10', 2000, 0, day, 200, now, '203.0.113.0/24', 10)).toBe('network');
    expect(s.m.get('f:N3')).toEqual({ d: day, w: day }); // no network on the place
    expect(s.m.get(`fn:N3:${day}`)).toBe('203.0.113.0/24');
    expect(await c.unfill('N3')).toBe(true);
    expect(s.m.has(`fn:N3:${day}`)).toBe(false);
    expect(await c.fill('N10', 2000, 0, day, 200, now, '203.0.113.0/24', 10)).toBe('counted');
    // A place from before this round names its network on itself: still given back.
    s.m.set('f:OLD', { d: day, w: day, n: '198.51.100.0/24' });
    s.m.set(`pn:198.51.100.0/24:${day}`, 10);
    expect(await c.unfill('OLD')).toBe(true);
    expect(s.m.get(`pn:198.51.100.0/24:${day}`)).toBe(9);
  });
  it('a place written before this round keeps its network while its day is kept (unfill may need it), and loses it after', async () => {
    const s = pagedStorage();
    const c = new Counters({ storage: s } as never, {} as never);
    s.m.set('f:OLD', { d: '2026-10-10', w: '2026-10-10', n: '198.51.100.0/24' });
    await c.tick(Date.UTC(2026, 9, 11, 0, 0, 1));
    expect(s.m.get('f:OLD')).toMatchObject({ n: '198.51.100.0/24' });
    await c.tick(Date.UTC(2026, 9, 12, 0, 0, 1));
    expect(s.m.get('f:OLD')).toEqual({ d: '2026-10-10', w: '2026-10-10' });
  });
});

/** A vault of 49,000 log batches whose list calls each take a millisecond, and a count of them. */
function bigVault() {
  const r2 = fakeR2();
  const keys: string[] = [];
  for (let i = 0; i < 49_000; i++) keys.push(`vault/${ID}/log/${String(1_700_000_000_000 + i * 3600_000).padStart(13, '0')}-0000-dev-${i.toString(16).padStart(12, '0')}.bin`);
  keys.sort();
  const calls = { n: 0 };
  r2.list = (async (o: { prefix: string; limit?: number; cursor?: string }) => {
    calls.n++;
    await new Promise((r) => setTimeout(r, 1));
    const from = o.cursor ? Number(o.cursor) : 0;
    const page = keys.slice(from, from + (o.limit ?? 1000));
    return { objects: page.map((k) => ({ key: k, size: 1, uploaded: new Date(1_700_000_000_000) })), truncated: from + page.length < keys.length, cursor: String(from + page.length) };
  }) as never;
  return { r2, calls };
}

describe('W2: the listing budget holds for walks in flight (S-E2, IND-10, R46-22)', () => {
  // The hour's budget, written out: a test that read the constant stayed green when it was raised (R46-31).
  const BUDGET = 1200, WALK = 50;
  it('the reviewers\' shape: 1,199 pages counted and 30 asks before any walk ends: one passes, and the hour ends under 1,200 plus one walk', async () => {
    expect(sync.LIST_PAGES_PER_HOUR).toBe(BUDGET);
    expect(sync.MAX_LIST_PAGES).toBe(WALK);
    const s = pagedStorage();
    const c = new Counters({ storage: s } as never, {} as never);
    const now = Date.UTC(2026, 9, 10, 12, 15);
    s.m.set('l', { h: Math.floor(now / 3_600_000), n: 1199 });
    const asks = [];
    for (let i = 0; i < 30; i++) asks.push(await c.listAsk(BUDGET, now, WALK));
    expect(asks.filter((a) => a.ok)).toHaveLength(1);
    // Every walk that passed uses its whole reservation.
    for (const a of asks) if (a.ok) await c.listed(WALK, now, a.reserved, a.hour);
    expect((s.m.get('l') as { n: number }).n).toBeLessThan(BUDGET + WALK);
  });
  it('100 pulls at once on a vault of 49,000 batches make at most the hour\'s pages and one walk more, and the rest are refused', async () => {
    const { r2, calls } = bigVault();
    const ns = countersNs();
    const now = Date.UTC(2026, 9, 10, 12, 15);
    const got = await Promise.all(Array.from({ length: 100 }, () => listBatches(r2 as never, ID, Date.now(), 500, null, q(ns, now)).then(() => 'listed', (e) => e)));
    expect(calls.n).toBeLessThan(BUDGET + WALK);
    expect(got.filter((g) => g instanceof sync.ListingsSpent).length).toBeGreaterThan(70);
  });
  it('what a walk did not use is given back: a small vault is pulled a thousand times in an hour, one after another', async () => {
    const r2 = fakeR2();
    const ns = countersNs();
    const now = Date.UTC(2026, 9, 10, 12, 15);
    for (let i = 0; i < 1000; i++) await listBatches(r2 as never, ID, null, 500, null, q(ns, now));
    expect((ns.raw(`bytes:${ID}`).m.get('l') as { n: number }).n).toBe(1000);
  });
  it('a walk that ends in the next hour settles nothing there, and its reservation is not taken off the new hour', async () => {
    const s = pagedStorage();
    const c = new Counters({ storage: s } as never, {} as never);
    const now = Date.UTC(2026, 9, 10, 12, 59, 59);
    const a = await c.listAsk(BUDGET, now, WALK);
    if (!a.ok) throw new Error('refused');
    await c.listAsk(BUDGET, now + 2000, WALK); // the next hour's first ask
    await c.listed(3, now + 2000, a.reserved, a.hour);
    expect(s.m.get('l')).toEqual({ h: Math.floor((now + 2000) / 3_600_000), n: WALK });
  });
});

/** A memory cache that records the keys put and matched. */
function memCache() {
  const store = new Map<string, Response>();
  const keys: string[] = [];
  return { store, keys, match: async (r: Request) => { keys.push(r.url); return store.get(r.url)?.clone(); }, put: async (r: Request, res: Response) => { keys.push(r.url); store.set(r.url, res); } };
}
const noStatic = (async () => new Response('', { status: 404 })) as typeof fetch;
const platformOf = (cache: ReturnType<typeof memCache>) => ({ env: { QUEUE: fakeKV() }, caches: { default: cache }, context: { waitUntil: (p: Promise<unknown>) => void p } }) as unknown as App.Platform;
const met = () => new Response(JSON.stringify({ properties: { timeseries: [{ time: '2026-01-10T00:00:00Z', data: { instant: { details: { air_temperature: -2 } }, next_6_hours: { details: { air_temperature_min: -2, air_temperature_max: 4 } } } }] } }), { status: 200 });

describe('W3: the Worker\'s own caches are keyed by the build (S-E3, R46-8, S-F6)', () => {
  const build = `v=${encodeURIComponent(version)}`;
  it('search, sheets, names, the forecast and the old-name check each read and write only keys that name this build', async () => {
    const seen: string[] = [];
    const run = async (f: (p: App.Platform) => unknown) => { const cache = memCache(); await f(platformOf(cache)); await new Promise((r) => setTimeout(r, 0)); seen.push(...cache.keys); expect(cache.keys.length).toBeGreaterThan(0); };
    const ev = (u: string, p: App.Platform, f: unknown = noStatic) => ({ url: new URL(u), platform: p, fetch: f, getClientAddress: () => '1.2.3.4' }) as never;
    await run((p) => searchRoute.GET(ev('http://x/api/search?q=copiapoa&c=fixture', p)));
    await run((p) => sheetsRoute.GET(ev(`http://x/api/sheets?b=${bucketOf('copiapoa-cinerea')}&n=32&c=fixture`, p)));
    await run((p) => namesRoute.GET(ev('http://x/api/names?q=copiapoa', p, async () => new Response('[]'))));
    await run((p) => forecastRoute.GET(ev('http://x/api/forecast?lat=60&lon=10', p, async () => met())));
    await run((p) => synonymAsk(p, (async () => new Response(JSON.stringify({ synonym: true, acceptedUsageKey: 1, matchType: 'EXACT', species: 'Aloe vera' }))) as never, 'aloe-barbadensis', { idx: [] } as never, null));
    expect(seen.length).toBeGreaterThanOrEqual(5);
    for (const k of seen) {
      expect(k.startsWith('https://cache.cultifolio/')).toBe(true);
      expect(new URL(k).searchParams.get('v')).toBe(version);
      expect(k).toContain(build);
    }
  });
  it("an answer an older build left in the Worker's cache is not served under this build", async () => {
    const cache = memCache();
    const p = platformOf(cache);
    const fresh = await searchRoute.GET({ url: new URL('http://x/api/search?q=copiapoa&c=fixture'), platform: p, fetch: noStatic, getClientAddress: () => '1.2.3.4' } as never);
    const hits = await fresh.json();
    // The entry the older build would read and write: the same key under another build.
    const [ours] = [...cache.store.keys()];
    cache.store.clear();
    cache.store.set(ours.replace(build, 'v=an-older-build'), new Response(JSON.stringify({ hits: [{ slug: 'an-older-answer' }] })));
    const again = await searchRoute.GET({ url: new URL('http://x/api/search?q=copiapoa&c=fixture'), platform: p, fetch: noStatic, getClientAddress: () => '1.2.3.4' } as never);
    expect(await again.json()).toEqual(hits);
  });
});

describe('W4: a PUT whose proof does not match takes no hold (S-E4, R46-23)', () => {
  it('the same bytes PUT back with another proof are answered "same" at once, while the name is held, and hold nothing', async () => {
    const r2 = casR2(); const ns = countersNs();
    await writeMeta(r2 as never, ID, { tokenHash: 'h', created: 'c', entitlement: 'open', bytes: 0, filled: true });
    const T0 = await clockOf(r2);
    const bytes = new Uint8Array(10).fill(1);
    await storeOnce(r2 as never, ID, await meta(r2), NAME, bytes, { drop: OWNER }, q(ns, T0));
    // The grower's removal holds the name; a stranger's replay of the bytes is answered without waiting for it.
    const h = await ns.get(`bytes:${ID}`).hold!(NAME, T0 + MIN);
    if (!h.ok) throw new Error('not held');
    expect(await storeOnce(r2 as never, ID, await meta(r2), NAME, bytes, { drop: STRANGER }, q(ns, T0 + MIN))).toBe('same');
    await ns.get(`bytes:${ID}`).unhold!(NAME, h.token);
    expect(ns.raw(`bytes:${ID}`).m.has(`h:${NAME}`)).toBe(false);
    // Nor did it claim the name: a removal asked for before now still removes it.
    expect(ns.raw(`bytes:${ID}`).m.get(`c:${NAME}`)).toMatchObject({ at: T0 });
    expect(await deleteCounted(r2 as never, ID, await meta(r2), NAME, q(ns, T0 + 2 * MIN), OWNER, T0 + MIN)).toBe(true);
  });
  it('a first store of a removed name without its removal\'s proof is refused 403 before the hold', async () => {
    const r2 = casR2(); const ns = countersNs();
    await writeMeta(r2 as never, ID, { tokenHash: 'h', created: 'c', entitlement: 'open', bytes: 0, filled: true });
    const T0 = await clockOf(r2);
    await storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(10).fill(1), { drop: OWNER }, q(ns, T0));
    expect(await deleteCounted(r2 as never, ID, await meta(r2), NAME, q(ns, T0 + 11 * MIN), OWNER, T0 + 10 * MIN)).toBe(true);
    const h = await ns.get(`bytes:${ID}`).hold!(NAME, T0 + 12 * MIN);
    expect(h.ok).toBe(true);
    const e = await storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(10).fill(1), { drop: STRANGER }, q(ns, T0 + 12 * MIN)).catch((x) => x);
    expect(e).toBeInstanceOf(PhotoRemoved);
  });
});

describe('W5: a vault\'s writes an hour (R46-24)', () => {
  const batch = (i: number) => `vault/${ID}/log/1760097600000-0000-dev-${i.toString(16).padStart(12, '0')}.bin`;
  it('each stored object is counted in the vault\'s take; past 3,600 in the hour, 503 with Retry-After to the hour and a refusal\'s words; the next hour stores again', async () => {
    const r2 = fakeR2(); const ns = countersNs();
    await writeMeta(r2 as never, ID, { tokenHash: 'h', created: 'c', entitlement: 'open', bytes: 0, filled: true });
    const now = Date.UTC(2026, 9, 10, 12, 20);
    const hour = Math.floor(now / 3_600_000);
    for (let i = 0; i < 3; i++) expect(await storeCounted(r2 as never, ID, await meta(r2), batch(i), new Uint8Array(10), undefined, {}, q(ns, now), true)).toBe(true);
    expect(ns.raw(`bytes:${ID}`).m.get('w')).toEqual({ h: hour, n: 3 });
    ns.raw(`bytes:${ID}`).m.set('w', { h: hour, n: 3599 });
    const ip = '198.51.100.20';
    expect(await storeCounted(r2 as never, ID, await meta(r2), batch(10), new Uint8Array(20_000), undefined, {}, q(ns, now, ip), true)).toBe(true);
    const e = await storeCounted(r2 as never, ID, await meta(r2), batch(11), new Uint8Array(20_000), undefined, {}, q(ns, now, ip), true).catch((x) => x);
    expect(e).toBeInstanceOf(sync.WritesSpent);
    const res = sync.refusal(e)!;
    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe(String(40 * 60));
    expect(((await res.json()) as { error: string }).error).toMatch(/^Uploading is refused for now: .*3,600.*within the hour\.$/);
    expect(r2.objs.has(batch(11))).toBe(false);
    // The address's bytes taken for the refused upload went back.
    expect(ns.raw(`ipbytes:${ip}`).m.get('d:2026-10-10')).toBe(20_000);
    expect(await storeCounted(r2 as never, ID, await meta(r2), batch(11), new Uint8Array(20_000), undefined, {}, q(ns, now + 3_600_000, ip), true)).toBe(true);
  });
});

describe('W6: words (S-E6, R46-25)', () => {
  const words = async (which: 'day' | 'network') => ((await new sync.VaultsClosed(which, Date.UTC(2026, 9, 10, 20)).response().json()) as { error: string }).error;
  it('a vault refused its place says the device tries again within the hour, never "tomorrow"; a network\'s refusal says another network may be let in now', async () => {
    for (const w of ['day', 'network'] as const) {
      const t = await words(w);
      expect(t).not.toMatch(/tomorrow/);
      expect(t).toMatch(/tries again within the hour/);
      expect(t).toMatch(/after midnight UTC/);
    }
    expect(await words('network')).toMatch(/^Sync has taken all the new vaults it takes from this network today.*Another network, such as home Wi-Fi, may be let in now\./);
  });
  it('the creation route\'s day ceiling says midnight UTC, not "tomorrow"', async () => {
    const ns = countersNs();
    const vaults = ns.raw('vaults').c;
    vaults.create = async () => 'day';
    const token = 'a'.repeat(64);
    const id = await sync.vaultIdFor(token);
    const request = new Request('https://x/api/sync/vault', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, token, create: true }) });
    const r = await vaultRoute.POST({ request, url: new URL(request.url), platform: { env: { STORE: fakeR2(), QUEUE: fakeKV(), COUNTERS: ns, SYNC_OPEN: '1' } }, getClientAddress: () => '192.0.2.1' } as never);
    expect(r.status).toBe(503);
    const t = ((await r.json()) as { error: string }).error;
    expect(t).not.toMatch(/tomorrow/);
    expect(t).toMatch(/after midnight UTC/);
  });
});

describe('R46-31: the server\'s green reverts, made to fail', () => {
  it('the 16 KB boundary: a log batch of exactly 16,384 bytes is free of the address\'s day, one of 16,385 is counted', async () => {
    expect(sync.SMALL_BATCH_BYTES).toBe(16 * 1024);
    const r2 = fakeR2(); const ns = countersNs();
    await writeMeta(r2 as never, ID, { tokenHash: 'h', created: 'c', entitlement: 'open', bytes: 0, filled: true });
    const now = Date.UTC(2026, 9, 10, 12);
    const ip = '192.0.2.44';
    const batch = (i: number) => `vault/${ID}/log/1760097600000-0000-dev-${i.toString(16).padStart(12, '0')}.bin`;
    expect(await storeCounted(r2 as never, ID, await meta(r2), batch(1), new Uint8Array(16_384), undefined, {}, q(ns, now, ip), true)).toBe(true);
    expect(ns.raw(`ipbytes:${ip}`).m.get('d:2026-10-10')).toBeUndefined();
    expect(await storeCounted(r2 as never, ID, await meta(r2), batch(2), new Uint8Array(16_385), undefined, {}, q(ns, now, ip), true)).toBe(true);
    expect(ns.raw(`ipbytes:${ip}`).m.get('d:2026-10-10')).toBe(16_385);
    // And a spent day refuses the one of 16,385 but not the one of 16,384.
    await ns.get(`ipbytes:${ip}`).take!('address', sync.MAX_IP_BYTES_PER_DAY, sync.MAX_IP_BYTES_PER_DAY * 2, '2026-10-10', null, now);
    expect(await storeCounted(r2 as never, ID, await meta(r2), batch(3), new Uint8Array(16_384), undefined, {}, q(ns, now, ip), true)).toBe(true);
    expect(await storeCounted(r2 as never, ID, await meta(r2), batch(4), new Uint8Array(16_385), undefined, {}, q(ns, now, ip), true).catch((e) => e)).toBeInstanceOf(DayQuota);
  });
  it('the pointer written back before a photograph\'s unnamed generations go (dropStrays): a revival whose pointer write stalls is never told "stored" for bytes that are gone', async () => {
    const r2 = casR2(); const ns = countersWithStore(r2);
    await writeMeta(r2 as never, ID, { tokenHash: 'h', created: 'c', entitlement: 'open', bytes: 0, filled: true });
    const T0 = await clockOf(r2);
    await storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(1000).fill(1), { drop: OWNER }, q(ns, T0));
    const A = T0 + 11 * MIN;
    expect(await deleteCounted(r2 as never, ID, await meta(r2), NAME, q(ns, A), OWNER, A - MIN)).toBe(true);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let stall = true;
    const gen = () => [...r2.objs.keys()].some((x) => /\.g[0-9a-z]+$/.test(x));
    r2.cas.before = async (k) => { if (k === REF && stall && gen()) { stall = false; await gate; } };
    const up = storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(700).fill(2), { drop: OWNER }, q(ns, A + MIN)).catch((x) => x);
    for (let i = 0; i < 200 && !gen(); i++) await new Promise((r) => setTimeout(r, 1));
    expect(gen()).toBe(true);
    await new Promise((r) => setTimeout(r, 20));
    // Another device asks again for the removal, past the upload's hold and ten minutes on: its touch removes the
    // generation nothing names yet.
    expect(await deleteCounted(r2 as never, ID, await meta(r2), NAME, q(ns, A + 12 * MIN), OWNER, A - MIN)).toBe(false);
    release();
    const got = await up;
    const named = (await photoRef(r2 as never, NAME)).key;
    if (named) expect(r2.objs.has(named)).toBe(true);
    expect(got).toBeInstanceOf(PhotoBusy);
  });
  it('the network\'s part of the day\'s places is 10, and the 11th is refused at once (it hung for 900 s when the limit was lifted)', { timeout: 10_000 }, async () => {
    expect(sync.MAX_NEW_VAULTS_PER_NETWORK_PER_DAY).toBe(10);
    const ns = countersNs();
    const now = Date.UTC(2026, 9, 10, 18);
    const v = ns.raw('vaults').c;
    for (let i = 0; i < 10; i++) expect(await v.fill(`X${i}`, 2000, 0, '2026-10-10', 200, now, '203.0.113.0/24', sync.MAX_NEW_VAULTS_PER_NETWORK_PER_DAY)).toBe('counted');
    expect(await v.fill('X10', 2000, 0, '2026-10-10', 200, now, '203.0.113.0/24', sync.MAX_NEW_VAULTS_PER_NETWORK_PER_DAY)).toBe('network');
  });
});
