/**
 * Round eighty-one (S): why three of 205 searches hung (review-d 6), and what keeps them from hanging.
 *
 * On Cloudflare a read begun by one request belongs to it: when that request ends first (a search's warm reads, begun
 * and not awaited; a client that went away), the read is cancelled, and another request that waited on its promise is
 * never answered. The Worker kept every read in flight in one map of promises, shared by every request of the isolate.
 * Here a request's read that never settles stands for the cancelled one; a second request (another execution context)
 * must still be answered, from its own read. And the warm reads are kept to their end by the request that began them
 * (`waitUntil`). The corpus load, shared the same way, is held to the same rule.
 *
 * FAILS on r81base: the second request waits on the first's read for ever (here, past the test's half second), and the
 * warm reads are given to no `waitUntil`.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { _forgetIndex, stored, warmSearch, corpusNow } from '$lib/server/dossiers';
import { buildProducts } from '$dossier/products';
import { manifestPath, productPath, contentHash } from '$dossier/manifest';
import type { IndexEntry } from '$dossier/index-entry';
import { gbifPage } from '$core/page-id';
import { resetRateLimits } from '$lib/server/sync';

const noStatic = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;
const never = new Promise<never>(() => {});
const late = <T,>(p: Promise<T>, ms = 500) => Promise.race([p, new Promise<'hung'>((r) => setTimeout(() => r('hung'), ms))]);
const ctx = () => { const kept: Promise<unknown>[] = []; return { kept, waitUntil: (p: Promise<unknown>) => void kept.push(p), passThroughOnException: () => {} }; };

beforeEach(() => { _forgetIndex(); resetRateLimits(); });

describe('a read in flight is not shared across requests (review-d 6)', () => {
  it("a second request is answered from its own read when the first's never settles", async () => {
    const body = JSON.stringify([1, 2, 3]);
    const hash = contentHash(body);
    const path = productPath(hash);
    const c = { at: Date.now(), idx: null, bySlug: null, corpus: 'x', etag: null, fromStore: true, manifest: null, buckets: 32 } as never;
    // Request A: its bucket read was cancelled with it, and never settles.
    const a = { env: { STORE: { get: async (k: string) => (k === path ? never : null) } }, context: ctx() } as unknown as App.Platform;
    void stored(c, a, noStatic, hash);
    await Promise.resolve();
    // Request B, another execution context, the same file.
    const b = { env: { STORE: { get: async (k: string) => (k === path ? { text: async () => body } : null) } }, context: ctx() } as unknown as App.Platform;
    expect(await late(stored(c, b, noStatic, hash))).toEqual([1, 2, 3]); // base: 'hung'
    // Within one request the read is shared, as before: a third call of B's is the same read.
    expect(await late(stored(c, b, noStatic, hash))).toEqual([1, 2, 3]);
  });

  it("a search's warm reads are kept to their end by the request that began them", async () => {
    const idx: IndexEntry[] = Array.from({ length: 40 }, (_, i) => ({ key: gbifPage(i + 1), gbif: i + 1, slug: `aloe-sp${i}`, name: `Aloe sp${i}`, family: 'Asphodelaceae', origin: ['Cape Provinces'], photos: 1, open: 1, climate: 'ok' }) as IndexEntry);
    const built = buildProducts(idx, JSON.stringify(idx, null, 1), () => new Map(), '2026-10-23T00:00:00Z');
    const m = new Map<string, string>([[manifestPath(), JSON.stringify(built.manifest)]]);
    for (const [nm, body] of built.files) m.set(productPath(built.manifest.files[nm]), body);
    for (const [h, body] of built.stored) m.set(productPath(h), body);
    const obj = (k: string) => ({ text: async () => m.get(k)!, json: async () => JSON.parse(m.get(k)!), etag: `"${k}"`, body: m.get(k)! });
    const store = { get: async (k: string) => (m.has(k) ? obj(k) : null), head: async (k: string) => (m.has(k) ? { etag: `"${k}"` } : null) };
    const cx = ctx();
    const pl = { env: { STORE: store }, context: cx } as unknown as App.Platform;
    const c = await corpusNow(pl, noStatic);
    const before = cx.kept.length;
    warmSearch(c, pl, noStatic, 'aloe sp1');
    expect(cx.kept.length).toBeGreaterThan(before); // base: none
    await Promise.all(cx.kept);
  });

  it('a corpus load in flight for another request is not waited on', async () => {
    const idx: IndexEntry[] = [{ key: gbifPage(1), gbif: 1, slug: 'aloe-vera', name: 'Aloe vera', family: 'Asphodelaceae', origin: [], photos: 1, open: 1, climate: 'ok' } as IndexEntry];
    const text = JSON.stringify(idx);
    const ok = { get: async (k: string) => (k === 's/v3/index.json' ? { text: async () => text, json: async () => idx, etag: '"i"', body: text } : null), head: async (k: string) => (k === 's/v3/index.json' ? { etag: '"i"' } : null) };
    const stuck = { get: async () => never, head: async () => never };
    void corpusNow({ env: { STORE: stuck }, context: ctx() } as unknown as App.Platform, noStatic);
    await Promise.resolve();
    const got = await late(corpusNow({ env: { STORE: ok }, context: ctx() } as unknown as App.Platform, noStatic));
    expect(got).not.toBe('hung'); // base: 'hung'
  });
});
