/**
 * Adopted in round sixty-one from docs/review-60/tests (the harness review); "PASSES"/"FAILS" below describe round-sixty code.
 * Harness review of round sixty: the site-wide cap on calls to other services (`upstreamAllowed`, RATE.upstream). The
 * round's test drives the forecast route past the cap; the names route and the old-name check (`synonymOf`) each have
 * their own call to the cap, and removing either call passed the suite. Past the cap both must ask GBIF nothing and say
 * so as a refusal (rule 2): the names route a 503 with `held: true` (a 502 before round sixty-one), synonymOf 'held' (before, 'unchecked').
 * PASSES on round-sixty code; each test FAILS under its mutation (`if (false) return …` in place of the cap check).
 * Adopted in round sixty-one (agent H; docs/review-60/harness.md). Run: `npx vitest run tests/unit/r61h-upstream-cap.test.ts`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resetRateLimits, upstreamCall, RATE } from '$lib/server/sync';
/** GBIF by the site's share alone, as `upstreamAllowed` asked before it went in round sixty-two. */
const upstreamAllowed = async (p: undefined) => (await upstreamCall(p, ['gbif'], null)).ok;

const T = Date.UTC(2026, 9, 4, 12);
beforeEach(() => { resetRateLimits(); vi.spyOn(Date, 'now').mockImplementation(() => T); });
afterEach(() => vi.restoreAllMocks());
async function spend() {
  for (let i = 0; i < RATE.upstream.limit; i++) await upstreamAllowed(undefined);
  expect(await upstreamAllowed(undefined)).toBe(false);
}

describe('past the site-wide cap on outside calls (harness review)', () => {
  it('the names route asks the backbone nothing and answers a refusal, not a list', async () => {
    await spend();
    let asked = 0;
    const f = (async () => { asked++; return new Response('[]', { headers: { 'content-type': 'application/json' } }); }) as typeof fetch;
    const { GET } = await import('../../src/routes/api/names/+server');
    const r = await Promise.resolve(GET({ url: new URL('http://x/api/names?q=copiapoa'), platform: { env: {} }, fetch: f, getClientAddress: () => '1.2.3.4' } as never)).catch((e: { status?: number }) => e as never);
    expect(asked).toBe(0);
    expect((r as Response).status).toBe(503); // held back by the site: 503 with `held: true` since round sixty-one (the server review, 4)
    expect(((await (r as Response).json()) as { held?: boolean }).held).toBe(true);
  });

  it('the old-name check asks GBIF nothing and says it could not ask', async () => {
    await spend();
    let asked = 0;
    const f = (async () => { asked++; return new Response(JSON.stringify({ matchType: 'EXACT', status: 'ACCEPTED' }), { headers: { 'content-type': 'application/json' } }); }) as typeof fetch;
    const { synonymOf } = await import('$lib/server/synonyms');
    expect(await synonymOf(undefined as never, f, 'copiapoa-cinereax', undefined, null)).toBe('held'); // held back by the site, said as that (round sixty-one)
    expect(asked).toBe(0);
  });
});
