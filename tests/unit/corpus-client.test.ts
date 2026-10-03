/**
 * The client's bucket requests under a corpus whose bucket count changed (round fifty-five, 3; both reviewers): the
 * bucket names, the id and the count a request carries come from one corpus read; a 409 sends the client back for a
 * fresh read and it hashes again; the page's caches are keyed by corpus and count, so a bucket of one layout is never
 * read as a bucket of another.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { bucketOf } from '$core/bucket';

const store = new Map<string, string>();
const ls = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
let served = { id: 'B', buckets: 64 };
let corpusFails = 0;
const asked: string[] = [];
const species = Array.from({ length: 200 }, (_, i) => `genus-sp${i}`);
const slug = species.find((s) => bucketOf(s, 32) !== bucketOf(s, 64))!;

function server(url: string): Response {
  asked.push(url);
  const u = new URL(url, 'http://x');
  if (u.pathname === '/api/corpus') {
    if (corpusFails > 0) { corpusFails--; throw new TypeError('Failed to fetch'); }
    return new Response(JSON.stringify(served), { status: 200 });
  }
  if (u.pathname === '/api/entries') {
    const n = Number(u.searchParams.get('n') ?? 32);
    if (n !== served.buckets) return new Response(JSON.stringify({ error: 'bucket count' }), { status: 409 });
    const want = new Set((u.searchParams.get('b') ?? '').split(','));
    return new Response(JSON.stringify(species.filter((s) => want.has(bucketOf(s, served.buckets))).map((s, i) => ({ key: i + 1, slug: s, name: s, photos: 0, open: 0, climate: 'ok' }))), { status: 200 });
  }
  return new Response('', { status: 404 });
}

beforeEach(() => {
  vi.resetModules();
  store.clear();
  asked.length = 0;
  corpusFails = 0;
  served = { id: 'B', buckets: 64 };
  Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true });
  vi.stubGlobal('fetch', async (url: string) => server(url));
});
afterEach(() => vi.unstubAllGlobals());

describe('the client under a changed bucket count', () => {
  it('a failed corpus read then a fresh one: the request carries the count it was hashed by, is refused, and is asked again under the new count; the species is found', async () => {
    store.set('cultifolio.corpus', JSON.stringify({ id: 'A', buckets: 32 }));
    corpusFails = 1;
    const { entriesFor } = await import('$lib/ui/index.svelte');
    const got = await entriesFor([slug]);
    expect(got?.has(slug)).toBe(true);
    const entries = asked.filter((u) => u.startsWith('/api/entries'));
    expect(entries[0]).toBe(`/api/entries?b=${bucketOf(slug, 32)}&c=A&n=32`); // one captured pair, never the 32-bucket name with n=64
    expect(entries[entries.length - 1]).toBe(`/api/entries?b=${bucketOf(slug, 64)}&c=B&n=64`);
  });
  it('a bucket cached under one layout is not read under another: opened offline on B/64, online again on A/32', async () => {
    store.set('cultifolio.corpus', JSON.stringify({ id: 'B', buckets: 64 }));
    corpusFails = 1; // offline: the remembered read; the bucket answered from the worker's copy under B/64
    served = { id: 'B', buckets: 64 };
    const m = await import('$lib/ui/index.svelte');
    expect((await m.entriesFor([slug]))?.has(slug)).toBe(true);
    // online, and the corpus is A/32: the failed read was not kept, so the next ask reads A/32 and hashes by it
    served = { id: 'A', buckets: 32 };
    asked.length = 0;
    const again = await m.entriesFor([slug]);
    expect(again?.has(slug)).toBe(true);
    expect(asked).toContain(`/api/entries?b=${bucketOf(slug, 32)}&c=A&n=32`); // a request under the new layout, not the B/64 bucket read from the page's cache
  });
  it('a corpus read that failed is not kept: the next ask reads again', async () => {
    corpusFails = 1;
    const m = await import('$lib/ui/index.svelte');
    expect((await m.corpusInfo()).id).toBe('');
    expect((await m.corpusInfo()).id).toBe('B');
  });
});
