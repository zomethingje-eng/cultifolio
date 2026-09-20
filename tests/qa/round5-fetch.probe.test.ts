/**
 * Round-five probes of the fetch layer: retries, Retry-After, cooling.
 *   QA_PROBES=1 npx vitest run tests/qa/round5-fetch.probe.test.ts
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { makeFetcher, resetPacing, hostCooling } from '$dossier/fetch';

const res = (status: number, headers: Record<string, string> = {}, body: unknown = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

describe('fetch: refusals that never cool', () => {
  beforeEach(() => resetPacing());
  it('a host answering 403 on every call is asked again on every call: no strike, no cooldown', async () => {
    let calls = 0;
    const f = makeFetcher(async () => (++calls, res(403)));
    for (let i = 0; i < 6; i++) await f('https://blocked.example/' + i);
    expect({ calls, cooling: hostCooling('blocked.example') }).toEqual({ calls: 6, cooling: true });
  });
  it('Retry-After as an HTTP date in the past: five retries with no wait at all', async () => {
    let calls = 0;
    const t0 = Date.now();
    const f = makeFetcher(async () => (++calls, res(429, { 'retry-after': 'Wed, 21 Oct 2015 07:28:00 GMT' })));
    const r = await f('https://stale.example/x');
    expect({ status: r.status, calls, tookMs: Date.now() - t0 < 2000 }).toEqual({ status: 'refused', calls: 6, tookMs: false });
  });
  it('Retry-After as seconds is honoured (short, so the probe runs): one 429 then 200', async () => {
    let calls = 0;
    const t0 = Date.now();
    const f = makeFetcher(async () => (++calls === 1 ? res(429, { 'retry-after': '1' }) : res(200, {}, { ok: 1 })));
    const r = await f('https://slow.example/x');
    expect({ status: r.status, calls, waited: Date.now() - t0 >= 900 }).toEqual({ status: 'ok', calls: 2, waited: true });
  });
  it('Retry-After beyond two minutes: refused now, host cooled until then, other hosts unaffected', async () => {
    let calls = 0;
    const f = makeFetcher(async (u) => (++calls, String(u).includes('long') ? res(429, { 'retry-after': '600' }) : res(200, {}, { ok: 1 })));
    const r = await f('https://long.example/x');
    const other = await f('https://calm.example/x');
    expect({ r, cooling: hostCooling('long.example'), other: other.status, calls }).toMatchInlineSnapshot(`
      {
        "calls": 2,
        "cooling": true,
        "other": "ok",
        "r": {
          "detail": "long.example 429: asked to wait 10 minutes; not asked again until then",
          "status": "refused",
        },
      }
    `);
  });
  it('a 5xx other than 503 is "error" and is not retried; a 502 from a load balancer under load looks like a broken source', async () => {
    let calls = 0;
    const f = makeFetcher(async () => (++calls, res(502)));
    const r = await f('https://lb.example/x');
    expect({ r, calls }).toMatchInlineSnapshot(`
      {
        "calls": 1,
        "r": {
          "detail": "lb.example 502",
          "status": "error",
        },
      }
    `);
  });
});
