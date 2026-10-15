/**
 * Round seventy-one, agent E: the server's half of the self-review of round seventy.
 *
 * E2: a listing's settle ran in `listBatches`' `finally`, inside the request. A request the client leaves mid-walk may
 * end with the Worker's invocation, so the settle never ran, the reservation lapsed after a minute, and the walk's pages
 * were counted nowhere: one ask a second, never settled, listed 72,000 pages an hour against the 1,200. The route now
 * hands the listing to `waitUntil`, so the walk and its settle outlive the client. FAILED on the base: `waitUntil` was
 * never called.
 *
 * E3: a vault's writes an hour were counted by the clock hour and started again at its turn: 3,600 log batches in the
 * last thirty seconds of one hour and 3,600 in the first of the next were all taken (7,200 within 38 s). Now any sixty
 * minutes hold at most 3,600 of a kind, as for listings. FAILED on the base: 7,200 taken; Retry-After to the hour.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { writeMeta, resetRateLimits, resetMetaFlush, vaultIdFor } from '$lib/server/sync';
import { tokenHash } from '$lib/sync/crypto';
import { Counters } from '$lib/server/counters';
import { fakeR2, fakeKV, countersNs } from './helpers/fake-sync';
import { pagedStorage } from './helpers/r61s-fake';

const MIN = 60_000;
beforeEach(() => { resetRateLimits(); resetMetaFlush(); });

describe('E2: a listing is settled whether or not its client stays', () => {
  it('the GET hands the walk to waitUntil, and that promise alone settles the reservation in the walk\'s minute', async () => {
    const token = 'c'.repeat(64);
    const id = await vaultIdFor(token);
    const r2 = fakeR2();
    await writeMeta(r2 as never, id, { tokenHash: await tokenHash(token), created: 'c', entitlement: 'open', bytes: 0, filled: true });
    for (let i = 0; i < 3; i++) await r2.put(`vault/${id}/log/1760097600000-0000-dev-${String(i).padStart(12, '0')}.bin`, new Uint8Array(4));
    const counters = countersNs();
    const kept: Promise<unknown>[] = [];
    const platform = { env: { STORE: r2, QUEUE: fakeKV(), COUNTERS: counters, SYNC_OPEN: '1' }, context: { waitUntil: (p: Promise<unknown>) => void kept.push(p) } };
    const route = await import('../../src/routes/api/sync/log/+server');
    const req = new Request(`https://x/api/sync/log?vault=${id}&since=0`, { headers: { authorization: `Bearer ${token}` } });
    // The client goes away: the response is never awaited. Only what was handed to waitUntil is run to its end here.
    void Promise.resolve(route.GET({ request: req, url: new URL(req.url), platform, getClientAddress: () => "198.51.100.7" } as never)).catch(() => {});
    for (let i = 0; i < 50 && !kept.length; i++) await new Promise((r) => setTimeout(r, 10));
    expect(kept.length).toBe(1); // base: 0, the settle depended on the request running to its end
    await Promise.all(kept);
    const l = counters.raw(`bytes:${id}`).m.get('l') as { m: Array<[number, number]>; r: unknown[] };
    expect(l.r).toEqual([]); // the reservation settled, not left to lapse
    expect(l.m.reduce((t, [, n]) => t + n, 0)).toBe(1); // the one page walked, counted
  });
});

describe('E3: a vault\'s writes are counted over any sixty minutes', () => {
  const T = Date.UTC(2026, 9, 16, 13, 0, 0);
  const take = (c: Counters, now: number, of: 'log' | 'photo' = 'log') => c.take('vault', 1, 1e12, '2026-10-16', 0, now, null, 3600, of);
  it('3,600 taken in the last half-minute of an hour leave none for the first minutes of the next', async () => {
    const c = new Counters({ storage: pagedStorage() } as never, {} as never);
    let n = 0;
    for (let i = 0; i < 3600; i++) if ('ok' in (await take(c, T - 30_000 + i))) n++;
    expect(n).toBe(3600);
    const after = await take(c, T + 5_000);
    expect(after).toMatchObject({ spent: true }); // base: ok, the turn emptied the count
    // Asked again when the minute they were taken in leaves the count: 12:59 + 61 minutes, 14:00.
    expect((after as { retryAfter: number }).retryAfter).toBe(60 * 60 - 5);
    expect(await take(c, T + 60 * MIN - 1)).toMatchObject({ spent: true });
    expect(await take(c, T + 60 * MIN)).toMatchObject({ ok: true });
  });
  it('a sliding check: an upload a second for three hours never puts more than 3,600 in any sixty minutes', async () => {
    const c = new Counters({ storage: pagedStorage() } as never, {} as never);
    const at: number[] = [];
    for (let s = 0; s < 3 * 3600; s += 0.5) { const t = T - 20 * MIN + s * 1000; if ('ok' in (await take(c, t))) at.push(t); }
    let most = 0, j = 0;
    for (let i = 0; i < at.length; i++) { while (at[i] - at[j] >= 60 * MIN) j++; most = Math.max(most, i - j + 1); }
    expect(most).toBeLessThanOrEqual(3600); // base: 7,200 across a turn
  }, 120_000);
  it('guard: photographs and log batches are still counted apart', async () => {
    const c = new Counters({ storage: pagedStorage() } as never, {} as never);
    for (let i = 0; i < 3600; i++) await take(c, T + i, 'photo');
    expect(await take(c, T + 4000, 'photo')).toMatchObject({ spent: true });
    expect(await take(c, T + 4000, 'log')).toMatchObject({ ok: true });
  });
  it('a count stored by the clock hour before this build stays counted until its hour\'s last minute has left the sixty (base: forgotten at the turn)', async () => {
    const s = pagedStorage();
    const c = new Counters({ storage: s } as never, {} as never);
    const hour = Math.floor((T - 30 * MIN) / 3_600_000);
    s.m.set('w', { h: hour, n: 3600 });
    expect(await take(c, T - 20 * MIN)).toMatchObject({ spent: true });
    // Read as taken in its hour's last minute (12:59), so counted to 14:00: never less long than the clock hour counted it.
    expect(await take(c, T + 59 * MIN)).toMatchObject({ spent: true });
    expect(await take(c, T + 60 * MIN)).toMatchObject({ ok: true });
  });
});
