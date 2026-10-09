/**
 * Self-review of round sixty-one, server area. Reproductions (FAIL on f4ab4f8) and guards (PASS), each marked.
 * Run (once copied to tests/unit/): npx vitest run tests/unit/server--review.test.ts
 * Status on f4ab4f8: 4 FAIL (reproductions: the legacy reclaim, the lapsed-lease landing, the address part of GBIF, the
 * names 429 the picker words as "did not answer"); 3 PASS (guards: the unfenced upload, a crossed open, and the proof
 * checked again inside the hold, which kills mutation P2).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { storeOnce, readMeta, writeMeta, resetRateLimits, resetMetaFlush, upstreamCall, deleteCounted, vaultBytes, MAX_BYTES } from '$lib/server/sync';
import { synonymOf } from '$lib/server/synonyms';
import { RECLAIM_DAYS, LEASE_MS } from '$lib/server/counters';
import { fakeR2, fakeKV, countersNs, type FakeR2 } from './helpers/fake-sync';

const ID = 'ABCDEFGHJKMNPQRSTVWXYZ2346';
const PROOF = { drop: 'd'.repeat(64) };
const photo = (i: number, id = ID) => `vault/${id}/photo/p${String(i).padStart(6, '0')}.bin`;
const T = Date.UTC(2026, 9, 4, 12);
const DAY = 86_400_000;
const MIN = 60_000;
const meta0 = (filled: boolean | undefined) => ({ tokenHash: 'h', created: 'c', entitlement: 'open' as const, bytes: 0, ...(filled === undefined ? {} : { filled }) });
const meta = async (r2: FakeR2, id = ID) => (await readMeta(r2 as never, id))!;
beforeEach(() => { resetRateLimits(); resetMetaFlush(); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('places: a pre-round-58 vault (no `filled`) across a reclaim', () => {
  // FAILS on f4ab4f8. `touch(..., legacy = meta.filled === undefined)` adopts a vault without counting it, and nothing ever
  // writes `filled` into a legacy meta, so after the 90-day sweep has taken its place off `all`, its next upload is
  // "adopted" again for free: the vault holds a place (`f:` written) that `all` does not count.
  it('a legacy vault reclaimed after 90 days is counted again when it comes back', async () => {
    const r2 = fakeR2(); const counters = countersNs();
    const kv = fakeKV(); kv.m.set('vaults:all', '1'); // the seed: this one legacy vault
    await writeMeta(r2 as never, ID, meta0(undefined));
    await storeOnce(r2 as never, ID, await meta(r2), photo(1), new Uint8Array(10), PROOF, { kv: kv as never, ip: '1.2.3.4', counters, now: T });
    const vaults = counters.objects.get('vaults')!;
    expect([vaults.m.get('all'), vaults.m.has(`f:${ID}`)]).toEqual([1, true]);
    await vaults.c.sweep(T + (RECLAIM_DAYS + 2) * DAY);
    expect([vaults.m.get('all'), vaults.m.has(`f:${ID}`)]).toEqual([0, false]);
    resetMetaFlush();
    await storeOnce(r2 as never, ID, await meta(r2), photo(2), new Uint8Array(10), PROOF, { kv: kv as never, ip: '1.2.3.4', counters, now: T + (RECLAIM_DAYS + 3) * DAY });
    // the vault holds a place again; the ceiling in all must count it
    expect([vaults.m.get('all'), vaults.m.has(`f:${ID}`)]).toEqual([1, true]);
  });
});

describe('recounts: a landing whose lease had already lapsed', () => {
  // FAILS on f4ab4f8. `release(lease, true)` returns early when the lease is gone, so the generation is not bumped, and a
  // listing taken before that landing and committed after it is accepted: the landed bytes are missing from the total
  // until the next day's listing. (A lease lapses after ten minutes; a Worker's R2 put that slow is rare, so P3.)
  it('a listing crossed by a landing whose lease lapsed is refused', async () => {
    const counters = countersNs();
    const v = counters.get(`bytes:${ID}`);
    const day = '2026-10-04';
    const a = await v.take!('vault', 100, MAX_BYTES, day, 0, T);
    expect('lease' in a && a.lease).toBeTruthy();
    // eleven minutes on, another upload's take finds the lease lapsed (the row goes stale) and lists
    const later = T + LEASE_MS + MIN;
    expect(await v.take!('vault', 50, MAX_BYTES, day, null, later)).toEqual({ recount: true });
    const g = await v.generation!();
    const listed = 0; // the slow object is not in the bucket yet
    await v.release!((a as { lease: string }).lease, true); // ...and lands now
    const b = await v.take!('vault', 50, MAX_BYTES, day, listed, later, g.gen);
    expect(b).toEqual({ recount: true });
  });
});

describe('the cap: one address and GBIF', () => {
  // FAILS on f4ab4f8 (as /about/how words it). The names route charges GBIF calls to the address (`upstreamCall(..., ip)`),
  // but the species 404's old-name check goes through `upstreamAllowed(platform)`, with no address. The species page's
  // `match` bucket lets one address make 60 such lookups in a minute, so one address takes 120 of GBIF's 600 in a minute,
  // a fifth of the share, not "a tenth".
  it('one address spends at most a tenth of GBIF\'s share in a minute, whichever route asks', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T);
    const counters = countersNs();
    const platform = { env: { COUNTERS: counters } } as unknown as App.Platform;
    let gbif = 0;
    for (let i = 0; i < 60; i++) if ((await upstreamCall(platform, ['gbif'], '1.2.3.4', T)).ok) gbif++;
    const fetch = (async () => { gbif++; return new Response(JSON.stringify({ matchType: 'NONE' }), { headers: { 'content-type': 'application/json' } }); }) as unknown as typeof globalThis.fetch;
    // the same reader then opens 60 unknown species addresses (the `match` bucket allows 60 per ten minutes)
    for (let i = 0; i < 60; i++) await synonymOf(platform as never, fetch as never, `aloe-nonexistens${String.fromCharCode(97 + (i % 26))}${i}`);
    expect(gbif).toBeLessThanOrEqual(60);
  });
});

describe('photo removal: the upload side is not fenced (residual, read with the B10 test)', () => {
  // PASSES on f4ab4f8 (a guard of what is sound). An upload whose own step stalls past its hold lets a removal in; the
  // removal finds nothing (404, the device marks it done), and the upload lands with no claim (its unhold finds another
  // token). The photograph is then removed by the next DELETE any device sends, since no claim protects it: the
  // uploading device sends one itself once it folds the removal. Nothing is lost and nothing is kept for good.
  it('an upload whose put stalls past its hold, a removal meanwhile, then a removal asked again: gone', async () => {
    const r2 = fakeR2(); const counters = countersNs();
    await writeMeta(r2 as never, ID, meta0(true));
    let reached!: () => void; const atPut = new Promise<void>((r) => (reached = r));
    let go!: () => void; const gate = new Promise<void>((r) => (go = r));
    r2.hooks.beforePut = async (k) => { if (k === photo(1)) { reached(); await gate; } };
    const up = storeOnce(r2 as never, ID, await meta(r2), photo(1), new Uint8Array(30), PROOF, { kv: fakeKV() as never, ip: '1.2.3.4', counters, now: T });
    await atPut;
    const R = T - 5 * MIN; // the record was removed on another device before this (late) first upload
    const first = await deleteCounted(r2 as never, ID, await meta(r2), photo(1), { kv: fakeKV() as never, ip: '1.2.3.4', counters, now: T + 2 * MIN }, PROOF.drop, R);
    go();
    expect(await up).toBe('stored');
    expect(first).toBe(false);
    const again = await deleteCounted(r2 as never, ID, await meta(r2), photo(1), { kv: fakeKV() as never, ip: '1.2.3.4', counters, now: T + 3 * MIN }, PROOF.drop, R);
    expect([again, r2.objs.has(photo(1))]).toEqual([true, false]);
  });
});

describe('recount crossing on a vault open', () => {
  // PASSES on f4ab4f8 (a guard): two crossed listings on an open throw, and nothing is written.
  it('an open whose two listings are each crossed by a landing answers RecountCrossed, total unwritten', async () => {
    const r2 = fakeR2(); const counters = countersNs();
    await writeMeta(r2 as never, ID, meta0(true));
    const v = counters.raw(`bytes:${ID}`);
    const real = r2.list.bind(r2);
    let n = 0;
    r2.list = (async (o: { prefix: string }) => { const r = await real(o as never); if (o.prefix.endsWith('/photo/')) { n++; v.m.set('gen', ((v.m.get('gen') as number) ?? 0) + 1); } return r; }) as typeof r2.list;
    const e = await vaultBytes(r2 as never, fakeKV() as never, ID, await meta(r2), T, true, { kv: fakeKV() as never, ip: '1.2.3.4', counters, now: T }).catch((x) => x);
    expect((e as Error).constructor.name).toBe('RecountCrossed');
    expect([n, v.m.get('v')]).toEqual([2, undefined]);
  });
});

describe('the names route: the site\'s own rate limit, as the picker reads it', () => {
  // FAILS on f4ab4f8. A typist (or an office behind one address) past `RATE.names` (300 per ten minutes, spread so the
  // per-minute GBIF part is never reached) gets the route's own 429 "too many requests from this address", with no
  // `held`. SpeciesPicker.svelte:54 maps any answer without `held: true` to "The name service did not answer" (:239-240),
  // which says a refusal of this site's as a silence of GBIF's (rule 2).
  it('a 429 from the route itself carries something the picker can word as a refusal', async () => {
    const { GET } = await import('../../src/routes/api/names/+server');
    const kv = fakeKV();
    vi.useFakeTimers({ toFake: ['Date'] });
    let now = Date.UTC(2026, 9, 4, 12, 0, 1);
    vi.setSystemTime(now);
    const platform = { env: { QUEUE: kv }, context: { waitUntil: (p: Promise<unknown>) => void p } } as unknown as App.Platform;
    const fetch = (async () => new Response('[]', { status: 200 })) as unknown as typeof globalThis.fetch;
    let last: Response | null = null;
    for (let i = 0; i < 301; i++) {
      if (i && i % 50 === 0) { now += 61_000; vi.setSystemTime(now); }
      last = await GET({ url: new URL(`http://x/api/names?q=aloe${'abcdefghijklmnopqrstuvwxyz'[i % 26]}${'abcdefghijklmnopqrstuvwxyz'[Math.floor(i / 26) % 26]}`), platform, fetch, getClientAddress: () => '1.2.3.4' } as never);
    }
    expect(last!.status).toBe(429);
    const body = (await last!.json()) as { error: string; held?: boolean };
    expect(body.error).toMatch(/too many requests/);
    expect(body.held).toBe(true);
  });
});

describe('photo removal: the proof is checked again inside the hold', () => {
  // PASSES on f4ab4f8 (a guard; it kills mutation P2, which the round's own tests let through). A proof-less DELETE whose
  // unheld look finds nothing goes on to take the hold; an upload that lands between that look and the hold must not be
  // removed by it. Without the check inside the hold, the bearer token alone deletes a photograph.
  it('a DELETE without the proof, racing a first upload, removes nothing', async () => {
    const r2 = fakeR2(); const counters = countersNs();
    await writeMeta(r2 as never, ID, meta0(true));
    let first = true;
    r2.hooks.afterHead = async (k) => {
      if (k !== photo(1) || !first) return;
      first = false;
      r2.hooks.afterHead = undefined;
      await storeOnce(r2 as never, ID, await meta(r2), photo(1), new Uint8Array(20), PROOF, { kv: fakeKV() as never, ip: '1.2.3.4', counters, now: T });
    };
    const r = await deleteCounted(r2 as never, ID, await meta(r2), photo(1), { kv: fakeKV() as never, ip: '5.6.7.8', counters, now: T + 1_000 }, 'a'.repeat(64), null);
    expect([r, r2.objs.has(photo(1))]).toEqual(['noproof', true]);
  });
});
