import { describe, it, expect, beforeEach } from 'vitest';
import { makeFetcher, resetPacing, hostCooling } from '$dossier/fetch';

const res = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'retry-after': '0' } });

describe('the fetch layer', () => {
  beforeEach(() => resetPacing());
  it('retries a 429 with backoff, then refuses honestly', async () => {
    let calls = 0;
    const f = makeFetcher(async () => (++calls, res(429)));
    const r = await f('https://rate.example/x');
    expect(r.status).toBe('refused');
    expect(calls).toBe(4); // first try + 3 retries
  });
  it('retries a dropped connection once', async () => {
    let calls = 0;
    const f = makeFetcher(async () => (++calls === 1 ? Promise.reject(new TypeError('fetch failed')) : res(200, { ok: 1 })));
    const r = await f<{ ok: number }>('https://flaky.example/x');
    expect(r.status).toBe('ok');
    expect(calls).toBe(2);
  });
  it('after three refusals in a row a host is left alone for a while, and other hosts are unaffected', async () => {
    let calls = 0;
    const f = makeFetcher(async (u) => (++calls, String(u).includes('rate.example') ? res(429) : res(200, { fine: true })));
    for (let i = 0; i < 3; i++) await f('https://rate.example/' + i);
    expect(hostCooling('rate.example')).toBe(true);
    const before = calls;
    const r = await f('https://rate.example/again');
    expect(r.status).toBe('refused');
    expect('detail' in r && r.detail).toMatch(/not asked again/);
    expect(calls).toBe(before); // no request was made
    const other = await f<{ fine: boolean }>('https://calm.example/y');
    expect(other.status).toBe('ok');
    expect(hostCooling('calm.example')).toBe(false);
  });
});
