/**
 * Round sixty-three, the fix pass, fixer S: two refusals of the server review of the round whose words or timing the code
 * did not keep.
 *
 * - R3 1: past three quarters of a share, a network that had called was told "this site's calls are used up for this
 *   minute" while up to a quarter of them were still open to others. It now has its own words, and `reserve: true`.
 * - R3 3: a bucket's sheet file that could not be read under a manifest was answered with a Retry-After of thirty seconds,
 *   but its miss was kept a minute (so a device that waited as told was refused again) and a read that threw was not
 *   kept at all (so every retry read again at once). Both are now kept the thirty seconds the answer says, and no longer.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resetRateLimits, RATE, upstreamCall, heldBack, HELD_BACK, HELD_BACK_RESERVE, UPSTREAM_ADDRESS_PART } from '$lib/server/sync';
import { sheetsIn, SheetsUnreadable, _forgetRefusedSheets } from '$lib/server/sheets';
import { corpusNow } from '$lib/server/dossiers';
import { fakeKV, countersNs } from './helpers/fake-sync';

const T = Date.UTC(2026, 9, 9, 12, 0, 0);
beforeEach(() => { resetRateLimits(); _forgetRefusedSheets(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(T); });
afterEach(() => { vi.useRealTimers(); });

describe("R3 1: the reserve's refusal says what happened", () => {
  it('a network that has called, past three quarters, is told the rest is kept for others, not that the calls are used up', async () => {
    const platform = { env: { QUEUE: fakeKV(), COUNTERS: countersNs() } };
    const PART = Math.floor(RATE.upstream.limit * UPSTREAM_ADDRESS_PART);
    // Eight networks of one address each take the open three quarters.
    for (let a = 0; a < 8; a++) for (let i = 0; i < PART; i++) await upstreamCall(platform as never, ['gbif'], `10.0.${a}.1`);
    const r = await upstreamCall(platform as never, ['gbif'], '10.0.0.2');
    expect(r).toMatchObject({ ok: false, who: 'reserve' });
    const res = heldBack(r as Extract<typeof r, { ok: false }>);
    const body = (await res.json()) as { error: string; held: boolean; reserve?: boolean };
    expect([res.status, body.error, body.held, body.reserve]).toEqual([503, HELD_BACK_RESERVE, true, true]);
    expect(body.error).not.toMatch(/used up/);
    // A share truly spent is still said as used up, with no `reserve`.
    const spent = heldBack({ ok: false, who: 'site', service: 'gbif', retryAfter: 5 });
    const b2 = (await spent.json()) as { error: string; reserve?: boolean };
    expect([b2.error, b2.reserve]).toEqual([HELD_BACK, undefined]);
  });
});

describe('R3 3: a sheets refusal under a manifest is kept for the time its Retry-After says', () => {
  it('a missing sheet file: refused for thirty seconds, counted down, then read afresh, not refused again by a minute-long miss', async () => {
    let asks = 0, there = false;
    const fetch = (async (u: string) => {
      if (String(u).includes('c'.repeat(16))) { asks++; return there ? new Response('[]', { status: 200 }) : new Response('', { status: 404 }); }
      return new Response('', { status: 404 });
    }) as unknown as typeof globalThis.fetch;
    const platform = { env: {} } as never;
    const c0 = await corpusNow(platform, fetch);
    const c = { ...c0, manifest: { files: { 'sheets/00.json': 'c'.repeat(16) } } };
    const first = await sheetsIn(c as never, platform, fetch, '00').catch((e) => e);
    expect(first).toBeInstanceOf(SheetsUnreadable);
    expect(first.retryAfter).toBe(30);
    vi.setSystemTime(T + 10_000);
    const again = await sheetsIn(c as never, platform, fetch, '00').catch((e) => e);
    expect([again instanceof SheetsUnreadable, again.retryAfter, asks]).toEqual([true, 20, 1]); // kept; the file not asked again
    there = true; // the store is put right
    vi.setSystemTime(T + 30_500); // the device waited as told
    expect(await sheetsIn(c as never, platform, fetch, '00')).toEqual([]);
    expect(asks).toBe(2);
  });

  it('a read that threw is kept refused for its thirty seconds as well, not read again by every retry', async () => {
    const fetch = (async () => new Response('', { status: 404 })) as unknown as typeof globalThis.fetch;
    const c0 = await corpusNow({ env: {} } as never, fetch);
    let gets = 0;
    const platform = { env: { STORE: { get: async () => { gets++; throw new Error('R2 did not answer'); } } } } as never;
    const c = { ...c0, fromStore: true, manifest: { files: { 'sheets/01.json': 'e'.repeat(16) } } };
    const first = await sheetsIn(c as never, platform, fetch, '01').catch((e) => e);
    expect([first instanceof SheetsUnreadable, first.retryAfter, gets]).toEqual([true, 30, 1]);
    vi.setSystemTime(T + 5_000);
    const again = await sheetsIn(c as never, platform, fetch, '01').catch((e) => e);
    expect([again instanceof SheetsUnreadable, again.retryAfter, gets]).toEqual([true, 25, 1]);
    vi.setSystemTime(T + 31_000);
    await sheetsIn(c as never, platform, fetch, '01').catch(() => null);
    expect(gets).toBe(2); // asked again once the half minute is over
  });
});
