/**
 * Round fifty-nine (three reviews): the page cache's key and the page it stores are one corpus. The hook loaded the
 * corpus for the key, the home query loaded it again, and the page a third time, so a refresh landing between them
 * stored corpus B's page under corpus A's id for the cache's minute. Now the hook loads once, into `locals`, and the
 * key, the query and the page all read that. Reproduced as the independent review did: A is current when the hook
 * starts, B is published and the minute passes during the render.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { handle } from '../../src/hooks.server';
import { _forgetIndex, corpusNow } from '$lib/server/dossiers';
import { buildProducts } from '$dossier/products';
import { manifestPath, productPath } from '$dossier/manifest';

const mk = (names: string[]) => names.map((name, i) => ({ key: 1000 + i, slug: name.toLowerCase().replace(/ /g, '-'), name, open: 0 }));
const A = mk(['Aloe vera', 'Copiapoa cinerea', 'Lithops lesliei']);
const B = mk(['Adenia globosa', 'Aloe vera', 'Copiapoa cinerea', 'Lithops lesliei']);
const noStatic = (async () => new Response('', { status: 404 })) as typeof fetch;

function products(idx: object[]) {
  const { manifest, files } = buildProducts(idx as never, JSON.stringify(idx), () => new Map());
  return { manifest, blobs: new Map([...files].map(([name, body]) => [productPath(manifest.files[name]), body])) };
}

afterEach(() => vi.restoreAllMocks());

describe('the page cache stores a page under the corpus it was rendered from (round fifty-nine)', () => {
  it('a refresh during the render: the stored key and the page agree', async () => {
    _forgetIndex();
    const a = products(A), b = products(B);
    const m = new Map<string, string>([...a.blobs, [manifestPath(), JSON.stringify(a.manifest)]]);
    const tag = (k: string) => { let h = 0; for (const ch of m.get(k)!) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return `"${h.toString(16)}"`; };
    const store = {
      get: async (k: string) => (m.has(k) ? { text: async () => m.get(k)!, json: async () => JSON.parse(m.get(k)!), etag: tag(k) } : null),
      head: async (k: string) => (m.has(k) ? { etag: tag(k) } : null)
    };
    const kept = new Map<string, Response>();
    const waited: Promise<unknown>[] = [];
    const platform = { env: { STORE: store }, caches: { default: { match: async () => undefined, put: async (r: Request, res: Response) => { kept.set(r.url, res); } } }, context: { waitUntil: (p: Promise<unknown>) => { waited.push(p); } } };
    const T0 = Date.UTC(2026, 9, 4, 12);
    vi.spyOn(Date, 'now').mockImplementation(() => T0);
    const event = { url: new URL('https://cultifolio.com/?by=genus&open=aloe'), request: new Request('https://cultifolio.com/?by=genus&open=aloe'), cookies: { get: () => undefined }, platform, fetch: noStatic, isDataRequest: false, locals: {} as App.Locals };
    const r = await handle({
      event: event as never,
      resolve: async (e: typeof event) => {
        // B lands and the minute passes while the page renders: a load made now reads B
        for (const [k, v] of b.blobs) m.set(k, v);
        m.set(manifestPath(), JSON.stringify(b.manifest));
        vi.spyOn(Date, 'now').mockImplementation(() => T0 + 61_000);
        expect((await corpusNow(platform as never, noStatic)).corpus).toBe(b.manifest.id);
        // the page renders from the corpus the request holds
        return new Response(`<p>${e.locals.corpus!.corpus} ${e.locals.corpus!.idx.length}</p>`, { headers: { 'content-type': 'text/html' } });
      }
    } as never);
    await Promise.all(waited);
    expect(await r.text()).toBe(`<p>${a.manifest.id} ${A.length}</p>`);
    const [key] = [...kept.keys()];
    expect(new URL(key).searchParams.get('c')).toBe(a.manifest.id);
  });
});
