/**
 * Self-review of round sixty-one, server area: guards for the round's fixes that its own tests let through (mutation
 * survivors S2, S3, U3, U6, U11, A11, R7, R8). Every test here PASSES on f4ab4f8 and FAILS under the named mutation.
 * Adopted in round sixty-two by agent S as written, from docs/review-61/tests/server--guards.test.ts.
 * Run: npx vitest run tests/unit/r62s-guards.test.ts
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Counters, SWEEP_PAGE, SWEEP_PAGES } from '$lib/server/counters';
import { storeOnce, deleteCounted, readMeta, writeMeta, resetRateLimits, resetMetaFlush, upstreamCall, RecountCrossed } from '$lib/server/sync';
import { pagedStorage } from './helpers/r61s-fake';
import { fakeR2, fakeKV, countersNs, type FakeR2 } from './helpers/fake-sync';

const ID = 'ABCDEFGHJKMNPQRSTVWXYZ2346';
const T = Date.UTC(2026, 9, 4, 12);
const NOW = Date.UTC(2026, 9, 10);
const meta = async (r2: FakeR2) => (await readMeta(r2 as never, ID))!;
beforeEach(() => { resetRateLimits(); resetMetaFlush(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('the paged sweep, cut short', () => {
  // Kills S2 (no `reclaim` when a run stops short): places deleted by a run that stops come off `all` in that run.
  it('a run that stops inside the places gives back every place it deleted', async () => {
    const storage = pagedStorage();
    const c = new Counters({ storage } as never, {} as never);
    const n = SWEEP_PAGE * SWEEP_PAGES + 500;
    for (let i = 0; i < n; i++) storage.m.set(`f:V${String(i).padStart(7, '0')}`, { d: '2026-01-01', w: '2026-01-01' });
    storage.m.set('all', n);
    await c.tick(NOW);
    const left = [...storage.m.keys()].filter((k) => k.startsWith('f:')).length;
    expect(left).toBeGreaterThan(0); // it did stop short
    expect((storage.m.get('all') as number) + 0).toBe(left);
  }, 120_000);
  // Kills S3 (no cursor): kept keys past one run's budget, stale ones after them in key order; the second run must go
  // on from where the first stopped, or it reads the same kept pages again and never reaches the stale ones.
  it('the second run goes on from the cursor and reaches keys past the first run\'s budget', async () => {
    const storage = pagedStorage();
    const c = new Counters({ storage } as never, {} as never);
    for (let i = 0; i < SWEEP_PAGE * SWEEP_PAGES; i++) storage.m.set(`c:a${String(i).padStart(7, '0')}`, { at: NOW, day: '2026-10-10' });
    for (let i = 0; i < 50; i++) storage.m.set(`c:z${i}`, { at: 1, day: '2026-01-01' });
    await c.tick(NOW);
    storage.fired();
    await c.tick(NOW + 1_000);
    expect([...storage.m.keys()].filter((k) => k.startsWith('c:z'))).toEqual([]);
  }, 120_000);
});

describe('the cap', () => {
  // Kills U3 (only the first service of a call counted): a US forecast spends the NWS's share too.
  it('a US forecast (met + nws) spends the address\'s NWS part as well as its MET part', async () => {
    const counters = countersNs();
    const platform = { env: { COUNTERS: counters } } as unknown as App.Platform;
    for (let i = 0; i < 60; i++) expect((await upstreamCall(platform, ['met', 'nws'], '1.2.3.4', T)).ok).toBe(true);
    const r = await upstreamCall(platform, ['nws'], '1.2.3.4', T);
    expect(r).toMatchObject({ ok: false, who: 'address', service: 'nws' });
  });
  // Kills U11 (the client drops `held`): the server's held answer reaches the frost line's words.
  it('the forecast client carries `held` from a 503, and the line says "not asked"', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: "not asked: this site's calls are used up for this minute", held: true, service: 'met', retryAfter: 30 }), { status: 503, headers: { 'content-type': 'application/json' } }));
    const { getForecast, forecastRefusal } = await import('$lib/weather/client');
    const r = await getForecast(51.5, -0.12, 'metric');
    expect(r).toMatchObject({ ok: false, status: 503, held: true });
    expect(forecastRefusal(r as never, 'Frost')).toMatch(/not asked/);
  });
});

describe('admission and refusals', () => {
  // Kills A11 (fail closed on `touch`): a vault that has a place is never refused because the counter cannot be asked.
  it('a filled vault uploads while the vaults object throws on touch', async () => {
    const r2 = fakeR2(); const counters = countersNs();
    await writeMeta(r2 as never, ID, { tokenHash: 'h', created: 'c', entitlement: 'open', bytes: 0, filled: true });
    counters.raw('vaults').c.touch = (async () => { throw new Error('the object is overloaded'); }) as never;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await storeOnce(r2 as never, ID, await meta(r2), `vault/${ID}/photo/p000001.bin`, new Uint8Array(10), { drop: 'd'.repeat(64) }, { kv: fakeKV() as never, ip: '1.2.3.4', counters, now: T })).toBe('stored');
  });
  // Kills R8 (Retry-After 60): a crossed recount is a short wait the engine reschedules, not a refusal it keeps for the
  // hour; the engine keeps any 503 of 60 s or more (engine.svelte.ts refusedBy).
  it('a crossed recount asks for a wait the engine does not keep as a refusal (under 60 s)', () => {
    expect(Number(new RecountCrossed().response().headers.get('retry-after'))).toBeLessThan(60);
  });
});

describe('more of the same', () => {
  // Kills U6 (the KV fallback without its per-address part): without the counter object, one address still stops at a
  // tenth of a share in this isolate.
  it('without the counter object, one address takes at most a tenth of a share', async () => {
    const platform = { env: { QUEUE: fakeKV() } } as unknown as App.Platform;
    let ok = 0;
    for (let i = 0; i < 70; i++) if ((await upstreamCall(platform, ['gbif'], '1.2.3.4', T)).ok) ok++;
    expect(ok).toBe(60);
  });
  // Kills R7 (the removal rethrows a crossed recount): on a day with no row, a removal whose two listings are crossed
  // still stands, and its bytes are left to the next listing.
  it('a removal on a day with no row stands when both its listings are crossed', async () => {
    const r2 = fakeR2(); const counters = countersNs();
    await writeMeta(r2 as never, ID, { tokenHash: 'h', created: 'c', entitlement: 'open', bytes: 0, filled: true });
    await r2.put(`vault/${ID}/photo/p000002.bin`, new Uint8Array(40), { customMetadata: { drop: 'd'.repeat(64) } });
    const v = counters.raw(`bytes:${ID}`);
    const real = r2.list.bind(r2);
    r2.list = (async (o: { prefix: string }) => { const r = await real(o as never); if (o.prefix.endsWith('/photo/')) v.m.set('gen', ((v.m.get('gen') as number) ?? 0) + 1); return r; }) as typeof r2.list;
    const r = await deleteCounted(r2 as never, ID, await meta(r2), `vault/${ID}/photo/p000002.bin`, { kv: fakeKV() as never, ip: '1.2.3.4', counters, now: T }, 'd'.repeat(64), null);
    expect([r, r2.objs.has(`vault/${ID}/photo/p000002.bin`)]).toEqual([true, false]);
  });
});
