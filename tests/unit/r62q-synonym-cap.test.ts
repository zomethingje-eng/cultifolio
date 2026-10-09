/**
 * Round sixty-two, decision 3 (with S's decision 6): the species 404's old-name check charges GBIF calls to the reader's
 * address as the names route does (the server review, 3; A29). Adopted from docs/review-61/tests/server--review.test.ts,
 * "one address spends at most a tenth of GBIF's share in a minute, whichever route asks", with the address passed. It
 * FAILED on the base (120 calls from one address).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resetRateLimits, upstreamCall } from '$lib/server/sync';
import { synonymOf } from '$lib/server/synonyms';
import { countersNs } from './helpers/fake-sync';

const T = Date.UTC(2026, 9, 4, 12);
beforeEach(() => resetRateLimits());
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('the old-name check is counted to the reader (server 3, A29)', () => {
  it("one address spends at most a tenth of GBIF's share in a minute, whichever route asks", async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T);
    const platform = { env: { COUNTERS: countersNs() } } as unknown as App.Platform;
    let gbif = 0;
    for (let i = 0; i < 60; i++) if ((await upstreamCall(platform, ['gbif'], '1.2.3.4', T)).ok) gbif++;
    const fetch = (async () => { gbif++; return new Response(JSON.stringify({ matchType: 'NONE' }), { headers: { 'content-type': 'application/json' } }); }) as unknown as typeof globalThis.fetch;
    const answers: unknown[] = [];
    for (let i = 0; i < 60; i++) answers.push(await synonymOf(platform as never, fetch as never, `aloe-nonexistens${String.fromCharCode(97 + (i % 26))}${i}`, undefined, '1.2.3.4'));
    expect(gbif).toBeLessThanOrEqual(60); // base: 120
    expect(answers.every((a) => a === 'held')).toBe(true); // held back, and said as that
    // another reader is still asked
    expect(await synonymOf(platform as never, fetch as never, 'aloe-otherreader', undefined, '5.6.7.8')).toBeNull();
  });
});
