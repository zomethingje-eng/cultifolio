/**
 * The post-deploy takeover (round sixty-seven; triage-66 P2; R45-5, S-E6, S-E7).
 *
 * - The page's rule (`onTakeOver`): an early reload only with nothing typed and no vault write in flight; a tab that did
 *   not send `skip` still moves to the new build at its next navigation; a worker that does not say its build does nothing.
 * - The worker reads the previous build's cache for an old build's file, which it kept for that and never read.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { onTakeOver, EARLY_MS } from '$lib/ui/take-over';

const base = { servedByOld: true, askedSkip: true, build: 'B', version: 'A', sinceStart: 1000, typed: false, writing: 0 };

describe('onTakeOver: what a page does when a new build takes it over', () => {
  it('early, untouched, nothing writing: reloads at once', () => {
    expect(onTakeOver(base)).toBe('reload');
  });
  it('early, but a name was typed: waits for the next navigation (R45-5: the field came back empty)', () => {
    expect(onTakeOver({ ...base, typed: true })).toBe('next');
  });
  it('early, but a vault write is in flight: waits for the next navigation (S-E6)', () => {
    expect(onTakeOver({ ...base, writing: 1 })).toBe('next');
  });
  it('past the first seconds: waits for the next navigation', () => {
    expect(onTakeOver({ ...base, sinceStart: EARLY_MS })).toBe('next');
  });
  it('a tab that did not send skip, running an older build: moves at its next navigation, never at once', () => {
    expect(onTakeOver({ ...base, askedSkip: false })).toBe('next');
    expect(onTakeOver({ ...base, askedSkip: false, sinceStart: 10 })).toBe('next');
  });
  it('a worker that does not say its build: nothing (it may be this build)', () => {
    expect(onTakeOver({ ...base, build: null })).toBe('none');
  });
  it('the same build, or a page no worker served: nothing', () => {
    expect(onTakeOver({ ...base, build: 'A' })).toBe('none');
    expect(onTakeOver({ ...base, servedByOld: false })).toBe('none');
  });
  it('the layout decides by onTakeOver, with the typed flag, the focus and the vault writes', () => {
    const layout = readFileSync('src/routes/+layout.svelte', 'utf8');
    expect(layout).toMatch(/onTakeOver\(\{ servedByOld, askedSkip: takingOver, build: v, version, sinceStart: performance\.now\(\), typed: typedHere \|\| typing\(document\.activeElement\), writing: vaultWritesInFlight\(\) \}\)/);
    expect(layout).not.toMatch(/if \(!takingOver \|\| !servedByOld\) return/);
    expect(layout).not.toMatch(/performance\.now\(\) < 4000\) location\.reload/);
    expect(layout).toMatch(/addEventListener\('input', mark, \{ capture: true \}\)/);
  });
});

/* ---- the worker ---- */
type Handler = (e: { request: Request; respondWith: (p: Promise<Response>) => void; waitUntil: (p: Promise<unknown>) => void }) => void;
const handlers = new Map<string, Handler>();
const stores = new Map<string, Map<string, Response>>();
const fetched: string[] = [];
const ORIGIN = 'https://cultifolio.test';
const cacheOf = (name: string) => {
  if (!stores.has(name)) stores.set(name, new Map());
  const m = stores.get(name)!;
  const key = (r: Request | string) => (typeof r === 'string' ? new URL(r, ORIGIN).href : r.url);
  return {
    match: async (r: Request | string) => m.get(key(r))?.clone(),
    put: async (r: Request | string, res: Response) => void m.set(key(r), res),
    add: async (r: string) => void m.set(key(r), new Response('x')),
    keys: async () => [...m.keys()].map((u) => new Request(u)),
    delete: async (r: Request | string) => m.delete(key(r))
  };
};

beforeAll(async () => {
  vi.doMock('$service-worker', () => ({ build: ['/_app/immutable/entry/new.js'], files: [], version: 'B' }));
  vi.stubGlobal('self', { addEventListener: (t: string, h: Handler) => handlers.set(t, h), skipWaiting: () => {}, clients: { claim: async () => {} } });
  vi.stubGlobal('location', { origin: ORIGIN });
  vi.stubGlobal('caches', { open: async (n: string) => cacheOf(n), keys: async () => [...stores.keys()], delete: async (n: string) => stores.delete(n), match: async () => undefined });
  vi.stubGlobal('fetch', async (r: Request) => { fetched.push(r.url); throw new TypeError('offline'); });
  // By a path the type checker does not follow: the worker's `/// <reference no-default-lib>` and `webworker` lib would
  // otherwise become the whole program's, and every `for … of` over a NodeList in the e2e specs stops checking.
  const sw = '../../src/service-worker';
  await import(/* @vite-ignore */ sw);
});

async function get(path: string): Promise<Response> {
  let out: Promise<Response> | null = null;
  handlers.get('fetch')!({ request: new Request(ORIGIN + path), respondWith: (p) => (out = p), waitUntil: () => {} });
  expect(out).not.toBeNull();
  return out!;
}

describe('the worker reads the previous build\'s cache it keeps (S-E7)', () => {
  it("an old build's chunk, offline, is answered from the previous build's cache", async () => {
    await (await caches.open('cultifolio-A')).put(`${ORIGIN}/_app/immutable/chunks/old-spreadsheet.js`, new Response('old chunk'));
    await caches.open('cultifolio-B');
    const r = await get('/_app/immutable/chunks/old-spreadsheet.js');
    expect(await r.text()).toBe('old chunk');
    expect(fetched).toEqual([]);
  });
  it('the corpus cache is never read for a build file', async () => {
    await (await caches.open('cultifolio-corpus')).put(`${ORIGIN}/_app/immutable/chunks/odd.js`, new Response('corpus'));
    await expect(get('/_app/immutable/chunks/odd.js')).rejects.toThrow(/offline/);
  });
});
