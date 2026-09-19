import { describe, it, expect, beforeEach } from 'vitest';
import { makeFetcher, resetPacing, hostCooling, markCooledRecently } from '$dossier/fetch';

const res = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'retry-after': '0' } });

describe('the fetch layer', () => {
  beforeEach(() => resetPacing());
  it('retries a 429 with backoff, then refuses honestly', async () => {
    let calls = 0;
    const f = makeFetcher(async () => (++calls, res(429)));
    const r = await f('https://rate.example/x');
    expect(r.status).toBe('refused');
    expect(calls).toBe(6); // first try + 5 retries
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

describe('a host that makes every call wait', () => {
  beforeEach(() => resetPacing());
  it('is called throttled after eight throttled calls in a row, and cooled', async () => {
    // Each call: 429 first, then 200 on the retry. Never a refusal, so strikes would never trip.
    let calls = 0;
    const f = makeFetcher(async () => (++calls % 2 === 1 ? res(429) : res(200, { ok: 1 })));
    for (let i = 0; i < 7; i++) expect((await f('https://slow.example/' + i)).status).toBe('ok');
    expect(hostCooling('slow.example')).toBe(false);
    const r = await f('https://slow.example/8');
    expect(r.status).toBe('refused');
    expect('detail' in r && r.detail).toMatch(/throttled 8 calls in a row/);
    expect(hostCooling('slow.example')).toBe(true);
  });
  it('forgets the run when a call is answered first time', async () => {
    let calls = 0;
    // Six throttled calls, one clean one, then six more: never reaches eight in a row.
    const f = makeFetcher(async () => (++calls, calls === 13 || calls % 2 === 0 ? res(200, { ok: 1 }) : res(429)));
    for (let i = 0; i < 13; i++) expect((await f('https://slow.example/' + i)).status).toBe('ok');
    expect(hostCooling('slow.example')).toBe(false);
  });
});

describe('Retry-After', () => {
  beforeEach(() => resetPacing());
  it('a long Retry-After is honoured by refusing now and cooling the host for that long, not by a shorter wait', async () => {
    let calls = 0;
    const f = makeFetcher(async () => (++calls, new Response('{}', { status: 429, headers: { 'retry-after': '600' } })));
    const r = await f('https://slow.example/x');
    expect(r.status).toBe('refused');
    expect('detail' in r && r.detail).toMatch(/10 minutes/);
    expect(calls).toBe(1);
    expect(hostCooling('slow.example')).toBe(true);
  });
  it('an HTTP-date Retry-After is read', async () => {
    let calls = 0;
    const when = new Date(Date.now() + 15 * 60_000).toUTCString();
    const f = makeFetcher(async () => (++calls, new Response('{}', { status: 503, headers: { 'retry-after': when } })));
    const r = await f('https://slow.example/y');
    expect(r.status).toBe('refused');
    expect('detail' in r && r.detail).toMatch(/1[45] minutes/);
  });
});

describe('a host that just finished cooling', () => {
  beforeEach(() => resetPacing());
  it('goes straight back to cooling on the first 429, with no slow retries', async () => {
    let calls = 0;
    const f = makeFetcher(async () => (++calls, res(429)));
    markCooledRecently('rate.example');
    const r = await f('https://rate.example/x');
    expect(r.status).toBe('refused');
    expect('detail' in r && r.detail).toMatch(/again after a cooldown/);
    expect(calls).toBe(1);
    expect(hostCooling('rate.example')).toBe(true);
    const r2 = await f('https://rate.example/y');
    expect(calls).toBe(1); // not even asked
    expect(r2.status).toBe('refused');
  });
  it('still serves a host that recovered', async () => {
    let calls = 0;
    const f = makeFetcher(async () => (++calls, res(200, { ok: 1 })));
    markCooledRecently('fine.example');
    const r = await f('https://fine.example/x');
    expect(r.status).toBe('ok');
  });
});
