/**
 * Round eighty, agent O (review C 2): the sitemap index was kept a day at the edge under an address that names no corpus,
 * and after the upload one data centre served round seventy-eight's one-file index for most of a day, so the 14,893
 * addresses of the new `sitemap-2.xml` were listed nowhere there. Now the index is kept five minutes and names its files
 * by the corpus's id, which change with every upload; the files under their own corpus's id are kept a day, and a bare
 * number or another corpus's id is answered with the current corpus's file for five minutes.
 *
 * On r80f the index is `public, max-age=86400` and names `/sitemap-1.xml`, and `/sitemap-<id>-1.xml` is a 404.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { _forgetIndex } from '$lib/server/dossiers';
import { buildProducts } from '$dossier/products';
import { manifestPath, productPath } from '$dossier/manifest';
import { md5 } from '$dossier/md5';
import { resetRateLimits } from '$lib/server/sync';
import { sitemapParam, sitemapIndex, sitemapCorpus } from '$lib/server/sitemap';
import { GET as indexGet } from '../../src/routes/sitemap.xml/+server';
import { GET as fileGet } from '../../src/routes/sitemap-[n].xml/+server';

const mk = (names: string[]) => names.map((name, i) => ({ key: `g${1000 + i}`, gbif: 1000 + i, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, open: 0, photos: 0, climate: 'ok' }));
const noStatic = (async () => new Response('', { status: 404 })) as typeof fetch;
function corpus(names: string[]) {
  const idx = mk(names);
  const { manifest, files, stored } = buildProducts(idx as never, JSON.stringify(idx), () => new Map());
  const m = new Map<string, string>([...[...files].map(([name, body]) => [productPath(manifest.files[name]), body] as [string, string]), ...[...stored].map(([h, b]) => [productPath(h), b] as [string, string]), [manifestPath(), JSON.stringify(manifest)]]);
  const store = {
    get: async (k: string) => (m.has(k) ? { text: async () => m.get(k)!, json: async () => JSON.parse(m.get(k)!), etag: md5(m.get(k)!) } : null),
    head: async (k: string) => (m.has(k) ? { etag: md5(m.get(k)!) } : null)
  };
  return { id: manifest.id, platform: { env: { STORE: store } } as unknown as App.Platform };
}
const ev = (platform: App.Platform, n?: string) => ({ params: n ? { n } : {}, platform, fetch: noStatic, getClientAddress: () => '1.2.3.4' }) as never;
const caught = async (p: unknown): Promise<{ status?: number } | null> => { try { await p; return null; } catch (e) { return e as { status?: number }; } };
beforeEach(() => { _forgetIndex(); resetRateLimits(); });

describe('the sitemap turns over with the corpus (round eighty; review C 2)', () => {
  it('the index is kept five minutes and names its files under the corpus id; those files are kept a day', async () => {
    const A = corpus(['Aloe vera', 'Copiapoa cinerea']);
    const idx = await indexGet(ev(A.platform));
    expect(idx.headers.get('cache-control')).toBe('public, max-age=300');
    const text = await idx.text();
    expect(text).toContain(`<loc>https://cultifolio.com/sitemap-${A.id}-1.xml</loc>`);
    expect(text).not.toContain('/sitemap-1.xml');
    const own = await fileGet(ev(A.platform, `${A.id}-1`));
    expect(own.headers.get('cache-control')).toBe('public, max-age=86400');
    expect(await own.text()).toContain('https://cultifolio.com/species/aloe-vera');
    // The bare number, as crawlers and the live check have it, is the same file, kept five minutes.
    const bare = await fileGet(ev(A.platform, '1'));
    expect(bare.headers.get('cache-control')).toBe('public, max-age=300');
    expect(await bare.text()).toContain('https://cultifolio.com/species/aloe-vera');
    expect((await caught(fileGet(ev(A.platform, `${A.id}-2`))))?.status).toBe(404);
  });

  it('after an upload the index names new addresses, and the old corpus\'s files answer with the new corpus for five minutes', async () => {
    const A = corpus(['Aloe vera', 'Copiapoa cinerea']);
    const B = corpus(['Adenia globosa', 'Aloe vera', 'Copiapoa cinerea']);
    expect(A.id).not.toBe(B.id);
    const text = await (await indexGet(ev(B.platform))).text();
    expect(text).toContain(`/sitemap-${B.id}-1.xml`);
    const old = await fileGet(ev(B.platform, `${A.id}-1`));
    expect(old.headers.get('cache-control')).toBe('public, max-age=300');
    expect(await old.text()).toContain('https://cultifolio.com/species/adenia-globosa');
  });

  it('the names read back, and a corpus without an id fit for an address (the fixture) keeps the bare names', () => {
    expect(sitemapParam('3')).toEqual({ corpus: null, n: 3 });
    expect(sitemapParam('a27e34d376199544-2')).toEqual({ corpus: 'a27e34d376199544', n: 2 });
    for (const bad of ['0', '-1', 'x-1', 'A27E34D376199544-1', '1.5', '', 'a27e34d376199544-']) expect(sitemapParam(bad), bad).toBeNull();
    expect(sitemapCorpus('fixture')).toBeNull();
    expect(sitemapIndex(['/'], null, 'fixture')).toContain('https://cultifolio.com/sitemap-1.xml');
  });

  it('robots.txt still names the index, and the live check reads the first file the index names', () => {
    expect(readFileSync('src/routes/robots.txt/+server.ts', 'utf8')).toContain('Sitemap: https://cultifolio.com/sitemap.xml');
    expect(readFileSync('scripts/live-check.mjs', 'utf8')).toContain(String.raw`sitemap-(?:[0-9a-f]+-)?1\.xml`);
  });
});
