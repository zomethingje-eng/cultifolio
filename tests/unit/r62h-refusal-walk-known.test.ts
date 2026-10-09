/**
 * Round sixty-two, agent H (triage decision 10; the harness review's 5): the `it.fails` case of
 * r61q-refusal-walk.test.ts, stated as the known wrong answer exactly. `it.fails` passes on ANY failure: with the sheets
 * route made to throw a TypeError for every bucket but "00", that file still reports "1 expected fail" and stays green.
 * This case failed then. Finding 13 was fixed at the merge of round sixty-two (a 503 for the bucket), and the case is
 * inverted, as `it.fails` would have asked.
 *
 * Adopted from docs/review-61/tests/harness--refusal-walk-known.test.ts, cut to the one case and the setup it needs. The
 * `it.fails` case in r61q-refusal-walk.test.ts is then redundant (its owner, or the lead at the merge, removes it).
 */
import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import { _forgetIndex, corpusNow } from '$lib/server/dossiers';
import { resetRateLimits } from '$lib/server/sync';
import { bucketOf } from '$core/bucket';
import { md5 } from '$dossier/md5';

const noStatic = (async () => new Response('', { status: 404 })) as typeof fetch;
function bucket(init: Iterable<[string, string]> = []) {
  const m = new Map(init);
  return {
    get: async (k: string) => (m.has(k) ? { text: async () => m.get(k)!, json: async () => JSON.parse(m.get(k)!), etag: md5(m.get(k)!) } : null),
    head: async (k: string) => (m.has(k) ? { etag: md5(m.get(k)!) } : null)
  };
}
const plat = (b: ReturnType<typeof bucket>) => ({ env: { STORE: b } }) as unknown as App.Platform;
const ev = (path: string, platform: App.Platform) => {
  const url = new URL(`https://cultifolio.com${path}`);
  return { url, platform, fetch: noStatic, request: new Request(url), getClientAddress: () => '9.9.9.9', setHeaders: () => {}, cookies: { get: () => undefined }, locals: {}, params: {}, isDataRequest: false } as never;
};

beforeEach(() => { _forgetIndex(); resetRateLimits(); vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());

const W = { key: 5411106, slug: 'welwitschia-mirabilis', name: 'Welwitschia mirabilis', family: 'Welwitschiaceae', open: 900, photos: 20, climate: 'ok', thumb: 'https://inaturalist-open-data.s3.amazonaws.com/photos/1/medium.jpg' };

it('finding 13, fixed in round sixty-two: without a manifest a bucket whose species cannot be read answers 503, never 200 without it', async () => {
  const b = bucket([['s/v2/index.json', JSON.stringify([W])]]);
  const c = await corpusNow(plat(b), noStatic);
  const { GET } = await import('../../src/routes/api/sheets/+server');
  const r = await GET(ev(`/api/sheets?b=${bucketOf(W.slug, c.buckets)}&n=${c.buckets}`, plat(b)));
  expect(r.status).toBe(503); // inverted in round sixty-two, as the KNOWN case asked: a 200 here left the species out
  expect(r.headers.get('cache-control')).toBe('no-store');
});
