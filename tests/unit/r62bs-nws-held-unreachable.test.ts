/**
 * Server review, round sixty-two: the forecast route's "NWS share alone spent" answer (200, alertsStatus 'held', MET
 * alone) cannot happen through the site's own callers. Every NWS call is taken together with a MET call (a US forecast
 * takes ['met', 'nws'], all or none), and the 'held' retry takes MET alone, so for every key (the site, an address, a
 * /48) MET's count is at least the NWS's. Both shares are `RATE.upstream.limit`, and `upstream()` checks MET first, so
 * a refusal always names MET. The round's own test spends the NWS by calling `upstreamCall(['nws'])` directly, which no
 * route does.
 *
 * This test spends the shares only through the forecast route (many US cells, many addresses) and shows that the next
 * US point is held back whole (503, service 'met'), never answered with MET and alerts 'held'. It PASSES on the merged
 * code: it documents that the branch is unreachable, so /about/how's new sentence describes a state the site never
 * reaches. Expected (if the branch is meant to matter): the shares differ, or the order of the check changes.
 *
 * Run: cp /tmp/r62rev/out/tests/server--nws-held-unreachable.test.ts tests/unit/ && npx vitest run tests/unit/server--nws-held-unreachable.test.ts
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resetRateLimits, RATE, UPSTREAM_ADDRESS_PART } from '$lib/server/sync';
import { fakeKV, countersNs } from './helpers/fake-sync';

const T = Date.UTC(2026, 9, 4, 12, 0, 0);
beforeEach(() => { resetRateLimits(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(T); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
const metBody = () => JSON.stringify({ properties: { timeseries: [{ time: '2026-10-04T18:00:00Z', data: { instant: { details: { air_temperature: 3 } }, next_6_hours: { details: { air_temperature_min: 1, air_temperature_max: 6 } } } }] } });

describe('the NWS share is never spent before MET through the routes', () => {
  it('after a minute of US forecasts, the next one is held back whole, never answered "alerts held"', async () => {
    const platform = { env: { QUEUE: fakeKV(), COUNTERS: countersNs() } };
    const fetch = vi.fn(async (u: string) => new Response(new URL(u).host === 'api.met.no' ? metBody() : JSON.stringify({ features: [] }), { headers: { 'content-type': 'application/json' } }));
    const { GET } = await import('../../src/routes/api/forecast/+server');
    const part = Math.floor(RATE.upstream.limit * UPSTREAM_ADDRESS_PART);
    const statuses = new Map<string, number>();
    let i = 0;
    for (let a = 0; a < 12; a++) for (let k = 0; k < part; k++) {
      i++;
      const r = (await GET({ url: new URL(`https://x/api/forecast?lat=${(30 + i / 100).toFixed(2)}&lon=-90`), platform, fetch, getClientAddress: () => `198.51.${a}.7` } as never)) as Response;
      const body = (await r.json()) as { alertsStatus?: string; service?: string };
      const kind = `${r.status} ${body.alertsStatus ?? body.service}`;
      statuses.set(kind, (statuses.get(kind) ?? 0) + 1);
    }
    expect(statuses.get('200 held')).toBeUndefined();
    expect(statuses.get('503 met')).toBeGreaterThan(0);
  });
});
