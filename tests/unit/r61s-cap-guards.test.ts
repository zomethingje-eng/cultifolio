/**
 * Adopted in round sixty-one by agent S: guards as written, the names route's refusal loosened to the decision (a cap
 * refusal says "not asked"; its status is the names route's owner's to choose, 502 now, 503 once it moves to
 * `upstreamCall`). Review of round sixty, server area: guards for three paths no round-sixty test covers (each found by reverting the line:
 * the round's server tests all still passed).
 *  - the old-name check (`synonymOf`) stops at the site's cap on outside calls and says 'held' (the 404 says the site held it back);
 *  - the names route stops at the cap and never asks GBIF;
 *  - a vault's counter object keeps its midnight alarm while only claims (`c:`) remain, so they are swept in two days.
 *
 * GUARD: PASSES on 21257b7.
 * Run: npx vitest run tests/unit/r61s-cap-guards.test.ts
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resetRateLimits, RATE, upstreamAllowed } from '$lib/server/sync';
import { synonymOf } from '$lib/server/synonyms';
import { Counters } from '$lib/server/counters';
import { fakeKV } from './helpers/fake-sync';

const T = Date.UTC(2026, 9, 4, 12, 0, 0);
beforeEach(() => { resetRateLimits(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(T); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
const spend = async (platform: unknown) => { for (let i = 0; i < RATE.upstream.limit; i++) expect(await upstreamAllowed(platform as never)).toBe(true); };

describe('the cap on outside calls, in the two routes no test held to it', () => {
  it("synonymOf: past the cap, 'held', and GBIF is not asked", async () => {
    const platform = { env: { QUEUE: fakeKV() } };
    await spend(platform);
    const gbif = vi.fn(async () => new Response('{}'));
    expect(await synonymOf(platform as never, gbif as never, 'haworthia-attenuata')).toBe('held'); // the site held it back, said as that (round sixty-one, at the merge)
    expect(gbif).not.toHaveBeenCalled();
  });
  it('the names route: past the cap, a refusal that says the backbone was not asked, and GBIF is not asked', async () => {
    const platform = { env: { QUEUE: fakeKV() } };
    await spend(platform);
    const gbif = vi.fn(async () => new Response('[]'));
    const route = await import('../../src/routes/api/names/+server');
    const r = (await route.GET({ url: new URL('https://x/api/names?q=Copiapoa'), platform, fetch: gbif, getClientAddress: () => '198.51.100.7' } as never)) as Response;
    expect([502, 503]).toContain(r.status);
    expect(((await r.json()) as { error: string }).error).toMatch(/not asked/);
    expect(gbif).not.toHaveBeenCalled();
  });
});

describe("a vault's counter object and its claims", () => {
  it('keeps its alarm while only claims remain, and the claims go within two days', async () => {
    const m = new Map<string, unknown>();
    let alarm: number | null = null;
    const storage = {
      async get(keys: string[]) { return new Map(keys.filter((k) => m.has(k)).map((k) => [k, m.get(k)])); },
      async put(e: Record<string, unknown>) { for (const [k, v] of Object.entries(e)) m.set(k, v); },
      async list(o: { prefix?: string; limit?: number } = {}) { return new Map([...m].filter(([k]) => k.startsWith(o.prefix ?? '')).slice(0, o.limit ?? Infinity)); },
      async delete(keys: string | string[]) { for (const k of typeof keys === 'string' ? [keys] : keys) m.delete(k); },
      async getAlarm() { return alarm; },
      async setAlarm(t: number) { alarm = t; }
    };
    const c = new Counters({ storage } as never, {} as never);
    const h = await c.hold('vault/X/photo/p000001.bin', T);
    if (!h.ok) throw new Error('not held');
    await c.unhold('vault/X/photo/p000001.bin', h.token, true, T); // an upload's claim
    expect([...m.keys()]).toEqual(['c:vault/X/photo/p000001.bin']);
    let day = T;
    for (let i = 0; i < 3 && alarm != null; i++) { day = alarm; alarm = null; await c.tick(day); }
    expect([...m.keys()]).toEqual([]); // swept at the second midnight: kept two days, as /about/formats says
    expect(day - T).toBeLessThanOrEqual(2 * 86_400_000);
  });
});
