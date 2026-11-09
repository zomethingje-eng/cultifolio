/**
 * Round eighty-seven (browse): the browse pages on the server, over a corpus read through its files as the live site
 * reads one (a manifest naming the lookup and search files, the index never parsed): the build's `browse.json` read and
 * checked, a manifest without it said as such (never "no species"), the tiles' photographs from the search's show
 * blocks, the entrance pages' addresses (404, a code moved to its address, a genus of one species to its species), the
 * sitemap's file of entrance pages, the CSV route, the search box's rows.
 *
 * Fails on the base (r85m head): none of these routes or $lib/browse exists.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { corpusNow, _forgetIndex, fromFiles, searchedFromFiles, type IndexEntry } from '$lib/server/dossiers';
import { buildProducts } from '$dossier/products';
import { manifestPath, productPath, type Manifest } from '$dossier/manifest';
import { md5 } from '$dossier/md5';
import { slugify } from '$core/names';
import { resetRateLimits } from '$lib/server/sync';
import { browseTableOf, BROWSE_UNBUILT } from '$lib/browse/table';
import { browseOf, entriesAt, browseView, hasBrowse } from '$lib/browse/load.server';
import { load as browseLoad } from '../../src/routes/browse/+page.server';
import { load as regionLoad } from '../../src/routes/region/[slug]/+page.server';
import { load as regionsLoad } from '../../src/routes/region/+page.server';
import { load as genusLoad } from '../../src/routes/genus/[slug]/+page.server';
import { load as generaLoad } from '../../src/routes/genus/+page.server';
import { load as familyLoad } from '../../src/routes/family/[slug]/+page.server';
import { GET as csvGet } from '../../src/routes/browse/csv/+server';
import { GET as suggestGet } from '../../src/routes/api/suggest/+server';
import { GET as sitemapGet } from '../../src/routes/sitemap.xml/+server';
import { GET as sitemapPartGet } from '../../src/routes/sitemap-[n].xml/+server';

const thumb = (k: number) => `https://inaturalist-open-data.s3.amazonaws.com/photos/${k}/medium.jpg`;
const e = (k: number, name: string, origin: string[], o: Partial<IndexEntry> = {}): IndexEntry => ({ key: `k${k}`, gbif: 9000 + k, slug: slugify(name), name, family: 'Apocynaceae', origin, photos: 4, open: 3, climate: 'ok', thumb: thumb(k), credit: 'CC BY, someone', changed: 20765, ...o });
const IDX: IndexEntry[] = [
  e(1, 'Hoodia alstonii', ['Cape Provinces', 'Namibia'], { grown: 5 }),
  e(2, 'Hoodia gordonii', ['Cape Provinces', 'Namibia', 'Botswana'], { grown: 37, credit: 'CC BY-NC, someone' }),
  e(3, 'Hoodia juttae', ['Namibia'], { climate: 'none', thumb: undefined, credit: undefined }),
  e(4, 'Lithops lesliei', ['Cape Provinces', 'Northern Provinces'], { family: 'Aizoaceae', grown: 2000 }),
  e(5, 'Welwitschia mirabilis', ['Namibia', 'Angola'], { family: 'Welwitschiaceae' }),
  e(6, 'Agave calodonta', ['Mexico'], { family: 'Asparagaceae' })
];

function bucket(m: Map<string, string>) {
  const obj = (k: string) => ({ text: async () => m.get(k)!, json: async () => JSON.parse(m.get(k)!), etag: `"${k}:${m.get(k)!.length}"`, body: m.get(k)! });
  return { m, get: async (k: string) => (m.has(k) ? obj(k) : null), head: async (k: string) => (m.has(k) ? { etag: `"${k}:${m.get(k)!.length}"` } : null) };
}
/** The corpus as the build writes it; with the browse table (`table`), without it, or with one cut short. */
function corpus(table: 'with' | 'without' | 'short' = 'with') {
  const p = buildProducts(IDX, JSON.stringify(IDX), () => new Map(), '2026-11-08T00:00:00Z');
  const m = new Map<string, string>([...[...p.files].map(([n, body]) => [productPath(p.manifest.files[n]), body] as [string, string]), ...[...p.stored].map(([h, b]) => [productPath(h), b] as [string, string])]);
  const manifest: Manifest = { ...p.manifest, files: { ...p.manifest.files } };
  // The build writes the table once products.ts does (the change asked of the data agent); this test writes its own either way.
  delete manifest.files['browse.json'];
  if (table !== 'without') {
    const t = browseTableOf(IDX);
    const body = JSON.stringify(table === 'short' ? { ...t, grown: t.grown.slice(1) } : t);
    manifest.files['browse.json'] = md5(body);
    m.set(productPath(md5(body)), body);
  }
  m.set(manifestPath(), JSON.stringify(manifest));
  return { env: { STORE: bucket(m), QUEUE: kv() } } as unknown as App.Platform;
}
const kv = () => { const m = new Map<string, string>(); return { get: async (k: string) => m.get(k) ?? null, put: async (k: string, v: string) => void m.set(k, v) }; };
const noStatic = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;
const ev = (platform: App.Platform, path: string, params: Record<string, string> = {}) => ({ params, platform, fetch: noStatic, url: new URL(`https://cultifolio.com${path}`), setHeaders: () => {}, getClientAddress: () => '192.0.2.9', locals: {}, cookies: { get: () => undefined }, request: new Request(`https://cultifolio.com${path}`) }) as never; // the reader's units are read since the review of stage 2's pages (4)
const settle = async <T,>(p: Promise<T> | T) => { try { return { ok: await p }; } catch (x) { const y = x as { status?: number; body?: { message?: string }; location?: string }; return { status: y.status, message: y.body?.message, location: y.location }; } };

beforeEach(() => { _forgetIndex(); resetRateLimits(); vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());

describe('the browse table of a corpus read through its files', () => {
  it("is the build's browse.json, never the index", async () => {
    const platform = corpus();
    const c = await corpusNow(platform, noStatic);
    expect(fromFiles(c) && searchedFromFiles(c)).toBe(true);
    const p = await browseOf(c, platform, noStatic);
    expect(p.t).toEqual(browseTableOf(IDX));
    expect(hasBrowse(c)).toBe(true);
  });
  it('a manifest naming none is said as such (a 503 in words), and one cut short is unreadable, never no species', async () => {
    let platform = corpus('without');
    let c = await corpusNow(platform, noStatic);
    expect(hasBrowse(c)).toBe(false);
    expect(await settle(browseOf(c, platform, noStatic))).toMatchObject({ status: 503, message: BROWSE_UNBUILT });
    expect(await settle(browseLoad(ev(platform, '/browse')))).toMatchObject({ status: 503 });
    _forgetIndex();
    platform = corpus('short');
    c = await corpusNow(platform, noStatic);
    expect(await settle(browseOf(c, platform, noStatic))).toMatchObject({ status: 503, message: 'The reference could not be read just now' });
  });
  it("reads the tiles' entries from the show blocks, and a share image only from an openly licensed photograph", async () => {
    const platform = corpus();
    const c = await corpusNow(platform, noStatic);
    const p = await browseOf(c, platform, noStatic);
    const got = await entriesAt(c, platform, noStatic, p.t, [0, 3, 5]);
    expect([...got.values()].map((x) => x.name)).toEqual(['Hoodia alstonii', 'Lithops lesliei', 'Agave calodonta']);
    const { view } = await browseView(c, platform, noStatic, new URL('https://cultifolio.com/browse?g=hoodia'));
    expect(view.items.map((x) => [x.name, x.thumb ? 'photo' : 'none', x.credit ?? ''])).toEqual([['Hoodia gordonii', 'photo', 'Photo: CC BY-NC, someone'], ['Hoodia alstonii', 'photo', 'Photo: CC BY, someone'], ['Hoodia juttae', 'none', '']]);
    expect(view.share).toEqual({ src: thumb(1), alt: 'Hoodia alstonii. Photo: CC BY, someone' }); // not the CC BY-NC one first in the list
    expect(view.items[2]).toMatchObject({ grown: null, climate: 'no habitat climate' }); // not counted, never 0
    const none = await browseView(c, platform, noStatic, new URL('https://cultifolio.com/browse?r=NAM&only=1')); // Hoodia juttae alone, with no photograph
    expect(none.view.share).toBeNull(); // no photograph to share: none, never a made one
  });
});

describe('the entrance pages (C2)', () => {
  it('/region/<slug>: a region, a code moved to its address, an unknown one 404', async () => {
    const platform = corpus();
    const r = (await settle(regionLoad(ev(platform, '/region/namibia', { slug: 'namibia' })))).ok as Record<string, any>;
    expect(r.region).toMatchObject({ code: 'NAM', label: 'Namibia', level: 3 });
    expect(r.figures).toMatchObject({ total: 4, only: 1, climate: 3 });
    expect(r.line.map((x: { label: string }) => x.label)).toEqual(['Africa', 'Southern Africa']);
    expect(r.view.items.map((x: { name: string }) => x.name)).toEqual(['Hoodia gordonii', 'Hoodia alstonii', 'Hoodia juttae', 'Welwitschia mirabilis']);
    expect(r.view.qs).toBe('');
    expect(r.view.items.filter((x: { only?: boolean }) => x.only).map((x: { name: string }) => x.name)).toEqual(['Hoodia juttae']); // the list's "only here"

    expect(await settle(regionLoad(ev(platform, '/region/nam', { slug: 'nam' })))).toMatchObject({ status: 301, location: '/region/namibia' });
    expect(await settle(regionLoad(ev(platform, '/region/27', { slug: '27' })))).toMatchObject({ status: 301, location: '/region/southern-africa' });
    expect(await settle(regionLoad(ev(platform, '/region/atlantis', { slug: 'atlantis' })))).toMatchObject({ status: 404, message: "No region of TDWG's scheme has this address" });
    // The page's only filter is its region: a filter in its address is not read there (links go to /browse). Since the
    // review of stage 1 (S5) such an address moves to the page's own, which keeps what the page reads (the view).
    expect(await settle(regionLoad(ev(platform, '/region/namibia?f=welwitschiaceae&view=list', { slug: 'namibia' })))).toMatchObject({ status: 301, location: '/region/namibia?view=list' });
    const f = (await settle(regionLoad(ev(platform, '/region/namibia?view=list', { slug: 'namibia' })))).ok as Record<string, any>;
    expect(f.figures.total).toBe(4);
    expect(f.view.query.view).toBe('list');
    expect(f.view.rail.families.find((x: { label: string }) => x.label === 'Welwitschiaceae').href).toBe('/browse?r=NAM&f=welwitschiaceae&view=list');
  });
  it('/genus/<slug>: a genus of two species or more; one of one species moves to its page; /family/<slug>', async () => {
    const platform = corpus();
    const g = (await settle(genusLoad(ev(platform, '/genus/hoodia', { slug: 'hoodia' })))).ok as Record<string, any>;
    expect(g).toMatchObject({ genus: 'Hoodia', family: { name: 'Apocynaceae', slug: 'apocynaceae' } });
    expect(g.figures.total).toBe(3);
    expect(g.regions.map((r: { label: string; n: number }) => `${r.label} ${r.n}`)).toEqual(['Namibia 3', 'Cape Provinces 2', 'Botswana 1']);
    expect(await settle(genusLoad(ev(platform, '/genus/lithops', { slug: 'lithops' })))).toMatchObject({ status: 307, location: '/species/lithops-lesliei' });
    expect(await settle(genusLoad(ev(platform, '/genus/rosa', { slug: 'rosa' })))).toMatchObject({ status: 404 });
    const f = (await settle(familyLoad(ev(platform, '/family/apocynaceae', { slug: 'apocynaceae' })))).ok as Record<string, any>;
    expect(f.figures.total).toBe(3);
    expect(await settle(familyLoad(ev(platform, '/family/rosaceae', { slug: 'rosaceae' })))).toMatchObject({ status: 404 });
  });
  it('/region and /genus: the indexes', async () => {
    const platform = corpus();
    const r = (await settle(regionsLoad(ev(platform, '/region')))).ok as Record<string, any>;
    expect(r.continents.find((x: { code: string }) => x.code === '2').n).toBe(5);
    expect(r.countries.find((x: { name: string }) => x.name === 'Mexico')).toMatchObject({ n: 1, href: '/browse?r=MXC,MXE,MXG,MXI,MXN,MXS,MXT' });
    const g = (await settle(generaLoad(ev(platform, '/genus')))).ok as Record<string, any>;
    expect(g.genera.map((x: { name: string }) => x.name)).toEqual(['Hoodia']); // the first letter with a genus of two species
    expect(g.letters).toEqual([{ l: 'H', n: 1 }]);
    expect(g.single).toBe(3);
  });
  it('the sitemap lists one file more, of the entrance pages, only where the corpus has a browse table', async () => {
    let platform = corpus();
    const idx = await (await sitemapGet(ev(platform, '/sitemap.xml'))).text();
    const files = [...idx.matchAll(/<loc>[^<]*sitemap-[0-9a-f]+-(\d+)\.xml<\/loc>/g)].map((x) => Number(x[1]));
    const last = Math.max(...files);
    const c = await corpusNow(platform, noStatic);
    const n = Object.keys(c.manifest!.files).filter((x) => /^sitemap\/\d+\.json$/.test(x)).length;
    expect(last).toBe(n + 1);
    const part = await (await sitemapPartGet(ev(platform, `/sitemap-${last}.xml`, { n: String(last) }))).text();
    for (const u of ['/browse', '/region', '/genus', '/family', '/region/namibia', '/region/southern-africa', '/region/mexico', '/genus/hoodia', '/family/apocynaceae']) expect(part).toContain(`<loc>https://cultifolio.com${u}</loc>`);
    expect(part).not.toContain('/genus/lithops'); // one species: its own page
    expect(part).not.toContain('/browse?');
    _forgetIndex();
    platform = corpus('without');
    const idx2 = await (await sitemapGet(ev(platform, '/sitemap.xml'))).text();
    expect([...idx2.matchAll(/sitemap-[0-9a-f]+-(\d+)\.xml/g)].length).toBe(n);
  });
});

describe('the CSV route (C4) and the search box\'s rows (C3)', () => {
  it('answers every result as CSV with its name, and the file of sources', async () => {
    const platform = corpus();
    const r = await csvGet(ev(platform, '/browse/csv?r=NAM,CPV&g=hoodia'));
    expect(r.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(r.headers.get('content-disposition')).toBe('attachment; filename="browse-hoodia-native-to-namibia.csv"');
    const bytes = new Uint8Array(await r.clone().arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // UTF-8's byte-order mark
    const text = await r.text();
    expect(text.split('\r\n').filter(Boolean)).toHaveLength(4);
    const s = await csvGet(ev(platform, '/browse/csv?part=sources'));
    expect(await s.text()).toContain('grown,');
  });
  it('/api/suggest answers rows, an empty query none', async () => {
    const platform = corpus();
    const rows = ((await (await suggestGet(ev(platform, '/api/suggest?q=hoodia%20namib'))).json()) as { rows: unknown[] }).rows;
    expect(rows[0]).toMatchObject({ kind: 'combined', label: 'Hoodia native to Namibia', n: 3 });
    expect(((await (await suggestGet(ev(platform, '/api/suggest?q=%20'))).json()) as { rows: unknown[] }).rows).toEqual([]);
  });
});
