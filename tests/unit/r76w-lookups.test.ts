/**
 * Round seventy-six (W; docs/SCALE-STUDY.md section 6): the Worker reads every name a page asks for from the build's
 * lookup files (cards/ and older/, names/ until round seventy-seven; rows/, genera.json, featured.json, sitemap/), and
 * the index only for the search. Proved here on
 * a small corpus built to hold every case (homonyms by slug, an older name two species hold, a hyphenated one, an
 * older name that is another's accepted name, a merged page's old address, a genus address, misses):
 *
 * 1. every key, through the files and through the maps over the index, answers the same;
 * 2. the routes answer the same, page for page, under a manifest naming the files and under one that does not (a corpus
 *    built before this round, which the Worker reads through its index as before: the fallback);
 * 3. under the files, a species page, the home page, the dossier API and the sitemaps never read the index; since round
 *    seventy-seven, nor does the search (it did in round seventy-six).
 *
 * The real corpus is proved by scripts/dev/scale/r76-proof.ts (its output: scripts/dev/scale/results/r76-proof.txt).
 * FAILS on r76base: neither lookup module exists there, and the Worker read the index on every cold page.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { corpusNow, _forgetIndex, fromFiles, type IndexEntry, type Loaded } from '$lib/server/dossiers';
import { indexLookup, filesLookup, addressOf } from '$lib/server/lookup';
import { buildProducts, type Alias } from '$dossier/products';
import { manifestPath, productPath, hasLookups, type Manifest } from '$dossier/manifest';
import { lookupFileNames, plainName, synonymKey, cardFilesFor, olderFilesFor } from '$dossier/lookups';
import { dossierPath } from '$dossier/schema';
import { slugify, genusOf } from '$core/names';
import { nameFromSlug } from '$lib/server/synonyms';
import { resetRateLimits } from '$lib/server/sync';
import { load as speciesLoad } from '../../src/routes/species/[slug]/+page.server';
import { load as homeLoad } from '../../src/routes/+page.server';
import { GET as dossierGet } from '../../src/routes/api/dossier/[key]/+server';
import { GET as sitemapGet } from '../../src/routes/sitemap.xml/+server';
import { GET as sitemapPartGet } from '../../src/routes/sitemap-[n].xml/+server';
import { GET as searchGet } from '../../src/routes/api/search/+server';
import { GET as indexGet } from '../../src/routes/api/index/+server';
import { gbifPage } from '../../src/lib/core/page-id';

const thumb = (k: number) => `https://inaturalist-open-data.s3.amazonaws.com/photos/${k}/medium.jpg`;
// Each page keyed by its GBIF key, in GBIF's namespace (round seventy-eight); `near` as GBIF keys, written as ids.
const e = (key: number, name: string, { near, ...o }: Omit<Partial<IndexEntry>, 'near'> & { near?: number[] } = {}): IndexEntry => ({ key: gbifPage(key), gbif: key, ...(near ? { near: near.map(gbifPage) } : {}), slug: slugify(name), name, family: name.startsWith('Rosa') ? 'Rosaceae' : 'Asphodelaceae', origin: ['Cape Provinces'], photos: 9, open: key % 97, climate: key % 3 ? 'ok' : 'none', thumb: thumb(key), credit: 'CC BY, someone', changed: 20_000 + key % 7, ...o });
const IDX: IndexEntry[] = [
  e(11, 'Aloe arborescens', { syn: ['Aloe fruticosa'], near: [12, 13, 31] }),
  e(12, 'Aloe ferox', { syn: ['Aloe horrida', 'Cotyledon mammillaris'], common: 'Bitter aloe' }),
  e(13, 'Aloe vera', { syn: ['Aloe barbadensis', 'Aloe vulgaris'], older: ['Aloe variegata', 'Arbutus uva-ursi'] }),
  e(14, 'Aloe vera', { slug: 'aloe-vera-14', syn: ['Aloe perfoliata'] }), // a homonym: the build gave it its key in the slug
  e(15, 'Aloiampelos ciliaris', { syn: ['Aloe ciliaris', 'Cotyledon mammillaris'], origin: [] }),
  e(21, 'Gonialoe variegata', { syn: ['Aloe variegata'], climate: 'refused' }),
  e(22, 'Haworthiopsis attenuata', { syn: ['Haworthia attenuata', 'Arbutus uva ursi'], family: undefined }),
  e(31, 'Annona montana', { syn: ['Annona muricata', 'Annona marcgravii'], family: 'Annonaceae', origin: ['Brazil Northeast'] }),
  e(32, 'Annona muricata', { family: 'Annonaceae', origin: ['Brazil Northeast'] }),
  e(41, 'Pelecyphora macromeris', { syn: ['Coryphantha macromeris'], family: 'Cactaceae', origin: ['Mexico Northeast'] }),
  e(51, 'Rosa canina', { photos: 3, near: [52] }),
  e(52, 'Rosa rugosa', { thumb: undefined, credit: undefined }),
  e(53, 'Rosa × alba', { slug: 'rosa-x-alba' })
];
const ALIASES: Alias[] = [{ slug: 'coryphantha-macromeris', key: gbifPage(41) }];
const template = JSON.parse(readFileSync('fixtures/dossiers/s/v3/k2735933.json', 'utf8'));
const SYN: Record<number, string[]> = { 31: ['Annona muricata Vell.', 'Annona marcgravii Mart.'], 12: ['Aloe horrida Haw.', 'Cotyledon mammillaris L.f.', 'Aloe vera (L.) Burm.f.'], 15: ['Cotyledon mammillaris Thunb.'] };
const dossierOf = (x: IndexEntry) => JSON.stringify({ ...template, key: x.key, slug: x.slug, name: { ...template.name, scientific: x.name, genus: genusOf(x.name), synonyms: SYN[x.gbif!] ?? x.syn ?? [] } });

/** A bucket over a map, counting the reads of each object. */
function bucket(m: Map<string, string>) {
  const reads: string[] = [];
  const obj = (k: string) => ({ text: async () => m.get(k)!, json: async () => JSON.parse(m.get(k)!), etag: `"${k}:${m.get(k)!.length}"`, body: m.get(k)! });
  return { m, reads, get: async (k: string) => { reads.push(k); return m.has(k) ? obj(k) : null; }, head: async (k: string) => (m.has(k) ? { etag: `"${k}:${m.get(k)!.length}"` } : null) };
}
/** The corpus as the build writes it, under a manifest that names the lookup files, or (`before`) one built before them. */
function corpus(before = false) {
  const text = JSON.stringify(IDX, null, 1);
  const p = buildProducts(IDX, text, () => new Map(), '2026-10-17T00:00:00Z', ALIASES, (k) => SYN[Number(k.slice(1))] ?? IDX.find((x) => x.key === k)?.syn);
  let manifest: Manifest = p.manifest;
  if (before) {
    const old = new Set(lookupFileNames(IDX.length, 1));
    manifest = { ...manifest, files: Object.fromEntries(Object.entries(manifest.files).filter(([n]) => !old.has(n))) };
  }
  const m = new Map<string, string>([[manifestPath(), JSON.stringify(manifest)], ...[...p.files].map(([n, body]) => [productPath(p.manifest.files[n]), body] as [string, string]), ...[...p.stored].map(([h, b]) => [productPath(h), b] as [string, string]), ...IDX.map((x) => [dossierPath(x.key), dossierOf(x)] as [string, string])]);
  return { manifest, store: bucket(m), indexPath: productPath(p.manifest.files['index.json']) };
}
const noStatic = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;
const settle = async <T,>(p: Promise<T> | T) => { try { return { ok: JSON.parse(JSON.stringify(await p)) }; } catch (x) { const y = x as { status?: number; body?: unknown; location?: string }; return { status: y.status, body: y.body, location: y.location, error: y.status ? undefined : String(x) }; } };
const platformOf = (store: ReturnType<typeof bucket>) => ({ env: { STORE: store } }) as unknown as App.Platform;
const speciesEvent = (c: Loaded, platform: App.Platform, slug: string, search = '') => {
  const url = new URL(`https://cultifolio.com/species/${slug}${search}`);
  return { params: { slug }, platform, fetch: noStatic, setHeaders: () => {}, cookies: { get: () => undefined }, request: new Request(url), url, getClientAddress: () => '192.0.2.7', locals: { corpus: c } } as never;
};
const homeEvent = (c: Loaded, platform: App.Platform, q: string) => {
  const url = new URL(`https://cultifolio.com/${q}`);
  return { platform, fetch: noStatic, setHeaders: () => {}, url, cookies: { get: () => undefined }, request: new Request(url), locals: { corpus: c } } as never;
};
const routeEvent = (platform: App.Platform, path: string, params: Record<string, string> = {}) => ({ params, platform, fetch: noStatic, url: new URL(`https://cultifolio.com${path}`), request: new Request(`https://cultifolio.com${path}`), getClientAddress: () => '192.0.2.8', setHeaders: () => {} }) as never;
const body = async (r: Response) => ({ status: r.status, text: await r.text() });

beforeEach(() => { _forgetIndex(); resetRateLimits(); vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());

/** Every key a request may look up, and every address. */
const keys = new Set<string>(['', 'aloe', 'nosuch', '#11', 'coryphantha-macromeris', 'cotyledon mammillaris', 'arbutus uva-ursi', 'arbutus uva ursi']);
const addresses = new Set<string>(['aloe', 'rosa', 'annona', 'nosuch-plant', 'Aloe-vera', 'aloe_vera', 'coryphantha-macromeris', 'x-rosa-alba', 'not-a-plant-zzz', 'haworthia-attenuata-var-radula', 'aloe-vera-14', '']);
for (const x of IDX) {
  for (const n of [x.name, ...(x.syn ?? []), ...(x.older ?? [])]) { keys.add(n.toLowerCase()); keys.add(slugify(n)); keys.add(synonymKey(n)); keys.add(plainName(n)); addresses.add(slugify(n)); const r = nameFromSlug(slugify(n)); if (r) keys.add(r.toLowerCase()); }
  keys.add(x.slug); addresses.add(x.slug); addresses.add(genusOf(x.name).toLowerCase());
}

describe('the lookup files answer as the maps over the index (round seventy-six)', () => {
  it('every slug, name and older name; every key; every row; the genera; the older names named elsewhere; every address', async () => {
    const { store, manifest } = corpus();
    expect(hasLookups(manifest)).toBe(true);
    // Round seventy-seven: the card files and the files of names, where round seventy-six wrote one product (`names/`).
    expect(Object.keys(manifest.files).filter((n) => n.startsWith('cards/')).length).toBe(cardFilesFor(IDX.length));
    expect(Object.keys(manifest.files).filter((n) => n.startsWith('older/')).length).toBe(olderFilesFor(IDX.length));
    expect(Object.keys(manifest.files).filter((n) => n.startsWith('names/')).length).toBe(0);
    const platform = platformOf(store);
    const c = await corpusNow(platform, noStatic);
    expect({ files: fromFiles(c), idx: c.idx }).toEqual({ files: true, idx: null });
    const a = filesLookup(c, platform, noStatic), b = indexLookup(IDX);
    const differ: string[] = [];
    const same = (what: string, x: unknown, y: unknown) => { if (JSON.stringify(x) !== JSON.stringify(y)) differ.push(`${what}: ${JSON.stringify(x)} / ${JSON.stringify(y)}`); };
    for (const k of keys) {
      same(`slug ${k}`, await a.slug(k), await b.slug(k));
      same(`accepted ${k}`, await a.accepted(k), await b.accepted(k));
      same(`older ${k}`, await a.older(k), await b.older(k));
    }
    for (const x of IDX) {
      const s = await a.species(x.key);
      same(`species ${x.key}`, s && { ...s, x: undefined }, await b.species(x.key));
      const names = (SYN[x.gbif!] ?? []).map((n) => plainName(n.split(' ').slice(0, 2).join(' ')));
      same(`elsewhere ${x.key}`, [...(await a.elsewhere(x.key, names))], [...(await b.elsewhere(x.key, names))]);
    }
    same('genera', [...(await a.genera())], [...(await b.genera())]);
    for (const by of ['genus', 'family', 'origin'] as const) for (const id of ['aloe', 'rosa', 'annona', 'asphodelaceae', 'rosaceae', 'cactaceae', 'southern-africa', 'origin-not-stated', 'family-not-stated', 'nosuch']) same(`row ${by}/${id}`, await a.row(by, id), await b.row(by, id));
    const kinds = new Set<string>();
    for (const x of addresses) { const r = await addressOf(a, x); kinds.add(r.kind); same(`address ${x}`, r, await addressOf(b, x)); }
    expect(differ).toEqual([]);
    // and the cases are all there: the test is not vacuous
    expect([...kinds].sort()).toEqual(['ask', 'genus', 'move', 'older', 'page', 'shared']);
    const shared = await a.older('cotyledon mammillaris');
    expect(shared && 'many' in shared ? shared.many.map(([k]) => k).sort() : null).toEqual([gbifPage(12), gbifPage(15)]);
    expect(await addressOf(a, 'coryphantha-macromeris')).toEqual({ kind: 'older', slug: 'pelecyphora-macromeris', matched: 'Coryphantha macromeris', name: 'Pelecyphora macromeris', key: gbifPage(41) });
    expect(await addressOf(a, 'arbutus-uva-ursi')).toMatchObject({ kind: 'shared' }); // two spellings an address cannot tell apart, held by two species
    expect([...(await a.elsewhere(gbifPage(31), ['annona muricata']))]).toEqual([['annona muricata', [gbifPage(32), 'annona-muricata', 'Annona muricata']]]);
  });

  it('the routes answer page for page alike through the files and through the index of a corpus built before them (the fallback)', async () => {
    const out: Record<string, unknown[]> = { files: [], index: [] };
    for (const which of ['files', 'index'] as const) {
      _forgetIndex(); resetRateLimits();
      const { store, manifest } = corpus(which === 'index');
      expect(hasLookups(manifest)).toBe(which === 'files');
      const platform = platformOf(store);
      const c = await corpusNow(platform, noStatic);
      expect(fromFiles(c)).toBe(which === 'files');
      expect(!!c.idx).toBe(which === 'index'); // the fallback reads the index whole, as before
      const r = out[which];
      for (const x of [...addresses].filter((s) => s !== '')) r.push([x, await settle(speciesLoad(speciesEvent(c, platform, x)))]);
      for (const was of ['Annona muricata', 'Cotyledon mammillaris', 'Aloe horrida', 'Aloe variegata', 'Nosuch name']) for (const x of ['aloe-ferox', 'annona-montana', 'aloe-vera']) r.push([x, was, await settle(speciesLoad(speciesEvent(c, platform, x, `?was=${encodeURIComponent(was)}`)))]);
      for (const q of ['', '?by=genus', '?by=genus&open=aloe', '?by=genus&open=rosa&chip=climate', '?by=family&open=asphodelaceae&chip=noclimate', '?by=origin&open=southern-africa', '?chip=grown', '?by=genus&chip=grown&open=aloe', '?by=family&chip=grown', '?by=origin&chip=grown', '?by=genus&chip=grown&open=annona']) r.push([q, await settle(homeLoad(homeEvent(c, platform, q)))]);
      for (const k of [11, 14, 41, 99, 3084426]) r.push([k, await settle(Promise.resolve(dossierGet(routeEvent(platform, `/api/dossier/${k}`, { key: String(k) }))).then(body))]);
      r.push(['sitemap', await body(await sitemapGet(routeEvent(platform, '/sitemap.xml')))]);
      for (const n of ['1', '2']) r.push([`sitemap-${n}`, await settle(Promise.resolve(sitemapPartGet(routeEvent(platform, `/sitemap-${n}.xml`, { n }))).then(body))]);
    }
    expect(out.files.length).toBeGreaterThan(60);
    for (let i = 0; i < out.files.length; i++) expect(out.files[i]).toEqual(out.index[i]);
    // and what they say is what the cases are
    const find = (k: string) => out.files.find((x) => (x as unknown[])[0] === k && (x as unknown[]).length === 2) as [string, { ok?: { featured?: unknown[]; grown?: unknown; siblingCount?: number; near?: unknown[] }; status?: number; location?: string }];
    expect(find('coryphantha-macromeris')[1]).toMatchObject({ status: 302, location: '/species/pelecyphora-macromeris?was=Coryphantha%20macromeris' });
    expect(find('cotyledon-mammillaris')[1]).toMatchObject({ status: 404 });
    expect(find('aloe')[1]).toMatchObject({ status: 302, location: '/?by=genus&open=aloe' });
    expect(find('aloe-arborescens')[1].ok).toMatchObject({ siblingCount: 3 });
    expect(find('aloe-arborescens')[1].ok!.near!.length).toBe(2); // 12 and 31 have a habitat climate; 13 has none
    expect(find('')[1].ok!.featured!.length).toBeGreaterThan(0);
    expect(find('?chip=grown')[1].ok!.grown).toBeTruthy();
  });

  // Round seventy-seven: and the search neither, from the key files (it read the index once in round seventy-six);
  // tests/unit/r77k-search-files.test.ts proves every caller of the search.
  it('under the files, a species page, the home page, the dossier API, the sitemaps and the search never read the index', async () => {
    const { store, indexPath } = corpus();
    const platform = platformOf(store);
    const c = await corpusNow(platform, noStatic);
    await speciesLoad(speciesEvent(c, platform, 'aloe-arborescens'));
    await settle(speciesLoad(speciesEvent(c, platform, 'cotyledon-mammillaris')));
    await settle(speciesLoad(speciesEvent(c, platform, 'coryphantha-macromeris')));
    await homeLoad(homeEvent(c, platform, '?by=genus&open=aloe&chip=grown'));
    await dossierGet(routeEvent(platform, '/api/dossier/11', { key: '11' }));
    await sitemapGet(routeEvent(platform, '/sitemap.xml'));
    await sitemapPartGet(routeEvent(platform, '/sitemap-1.xml', { n: '1' }));
    expect(store.reads.filter((k) => k === indexPath)).toEqual([]);
    // /api/index passes the stored file on without reading it whole into the isolate
    const listed = await indexGet(routeEvent(platform, '/api/index'));
    expect(JSON.parse(await listed.text()).length).toBe(IDX.length);
    // nor does the search, from the key files (round seventy-seven)
    store.reads.length = 0;
    const s1 = await searchGet(routeEvent(platform, '/api/search?q=aloe'));
    const s2 = await searchGet(routeEvent(platform, '/api/search?q=rosa'));
    expect([s1.status, s2.status]).toEqual([200, 200]);
    expect(store.reads.filter((k) => k === indexPath).length).toBe(0);
  });

  it('a lookup file the bucket cannot give is a 503 that says so, never "no species page"', async () => {
    const { store, manifest } = corpus();
    const platform = platformOf(store);
    const c = await corpusNow(platform, noStatic);
    for (let i = 0; i < cardFilesFor(IDX.length); i++) store.m.delete(productPath(manifest.files[`cards/${i}.json`])); // a page's own card (round seventy-seven; `names/` until then)
    expect(await settle(speciesLoad(speciesEvent(c, platform, 'aloe-ferox')))).toMatchObject({ status: 503 });
  });
});
