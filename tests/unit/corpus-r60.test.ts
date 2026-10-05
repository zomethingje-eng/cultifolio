/**
 * Round sixty, the reference against the three reviews (the corpus and server reviews, A and B): a refused corpus never
 * falls to the fixture, a refusal is remembered for ten minutes only, an R2 error keeps the corpus held, the near pass is
 * charged, the search reads the names growers write (markers, hybrids, cultivars, citations) and retries on the first
 * two words, saying so, every English common name is searched, a dossier that cannot be read is a 503 and never "no
 * species page", odd species addresses move to the slug, the search's answers are kept in the Worker's cache, and the
 * sitemap carries the corpus's build date.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { corpusNow, _forgetIndex, searchAnswer, getDossier, REFUSAL_MS, UNREADABLE, WHOLE_LIKE, type Loaded } from '$lib/server/dossiers';
import { synonymInIndex, nameFromSlug } from '$lib/server/synonyms';
import { buildProducts } from '$dossier/products';
import { manifestPath, productPath } from '$dossier/manifest';
import { dossierPath } from '$dossier/schema';
import { md5 } from '$dossier/md5';
import { englishNames } from '$dossier/index-entry';
import { shownAt } from '$dossier/photo-size';
import { heroOf } from '$dossier/dedupe';
import { catalogueOf } from '$dossier/catalogue';
import { catalogueRows } from '$lib/server/catalogue';
import { lastmodOf, sitemapChunk, sitemapIndex } from '$lib/server/sitemap';
import { prepare, search, relaxedQuery, cleanQuery } from '$core/search';
import { clip } from '$core/text';
import { resetRateLimits } from '$lib/server/sync';
import { _clean } from '../../src/routes/api/search/+server';

type E = { key: number; slug: string; name: string; open: number; photos: number; climate: string; family?: string; common?: string; commons?: string[]; origin?: string[]; syn?: string[] };
const mk = (names: string[], keys: Record<string, number> = {}): E[] => names.map((name, i) => ({ key: keys[name] ?? 1000 + i, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), name, open: 0, photos: 0, climate: 'ok' }));
const X = mk(['Aloe vera', 'Copiapoa cinerea', 'Lithops lesliei', 'Haworthia cooperi'], { 'Copiapoa cinerea': 5384013 });
const Y = mk(['Adenia globosa', 'Aloe vera', 'Copiapoa cinerea', 'Lithops lesliei', 'Haworthia cooperi'], { 'Copiapoa cinerea': 5384013 });
const noStatic = (async () => new Response('', { status: 404 })) as typeof fetch;
const FIXTURE_DOSSIER = readFileSync('fixtures/dossiers/s/v2/5384013.json', 'utf8');

function productsOf(idx: object[]) {
  const text = JSON.stringify(idx);
  const { manifest, files } = buildProducts(idx as never, text, () => new Map());
  return { manifest, text, blobs: new Map([...files].map(([name, body]) => [productPath(manifest.files[name]), body] as [string, string])) };
}
/** A bucket whose etags are the content's own MD5, as R2's are; it can be made to fail, and it says what it read. */
function bucket(init: Iterable<[string, string]> = []) {
  const m = new Map(init);
  const reads: string[] = [];
  let heads = 0;
  const fail = { head: false, get: false };
  return {
    m, reads, fail, heads: () => heads,
    get: async (k: string) => { if (fail.get) throw new Error('R2 internal error'); reads.push(k); return m.has(k) ? { text: async () => m.get(k)!, json: async () => JSON.parse(m.get(k)!), etag: md5(m.get(k)!) } : null; },
    head: async (k: string) => { heads++; if (fail.head) throw new Error('R2 internal error'); return m.has(k) ? { etag: md5(m.get(k)!) } : null; }
  };
}
/** What a load or a route threw (Kit's redirect or error), or null when it answered. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const caught = async (p: unknown): Promise<any> => { try { await p; return null; } catch (e) { return e; } };
const platformOf = (b: ReturnType<typeof bucket>, extra: Record<string, unknown> = {}) => ({ env: { STORE: b }, ...extra }) as unknown as App.Platform;
let now = Date.UTC(2026, 9, 4, 12);
const at = (t: number) => { now = t; vi.spyOn(Date, 'now').mockImplementation(() => now); };
beforeEach(() => { _forgetIndex(); resetRateLimits(); at(Date.UTC(2026, 9, 4, 12)); vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());

describe('a corpus the Worker cannot read is never answered with the fixture (round sixty; A24)', () => {
  it('a fresh isolate under a refused manifest serves the top-level index, under its own id', async () => {
    const b = bucket([[manifestPath(), '{"v":99}'], ['s/v2/index.json', JSON.stringify(X)]]);
    const c = await corpusNow(platformOf(b), noStatic);
    expect({ fixture: c.corpus === 'fixture', species: c.idx.length, manifest: !!c.manifest }).toEqual({ fixture: false, species: X.length, manifest: false });
  });
  it('with no top-level index either, the corpus is a 503 that says so: for the pages and for the routes', async () => {
    const b = bucket([[manifestPath(), '{"v":99}']]);
    await expect(corpusNow(platformOf(b), noStatic)).rejects.toMatchObject({ status: 503, body: { message: UNREADABLE } });
    _forgetIndex();
    const { GET } = await import('../../src/routes/api/search/+server');
    await expect(GET({ url: new URL('https://x/api/search?q=aloe'), platform: platformOf(b), fetch: noStatic, getClientAddress: () => '1.2.3.4' } as never)).rejects.toMatchObject({ status: 503 });
    const { load } = await import('../../src/routes/species/[slug]/+page.server');
    const url = new URL('https://x/species/welwitschia-mirabilis'); // a fixture species: never served from here
    await expect(load({ params: { slug: 'welwitschia-mirabilis' }, platform: platformOf(b), fetch: noStatic, setHeaders: () => {}, cookies: { get: () => undefined }, request: new Request(url), url, getClientAddress: () => '1.2.3.4', locals: {} } as never)).rejects.toMatchObject({ status: 503 });
  });
  it('a valid manifest whose index is of the wrong length, with nothing held and no top-level index: 503, not the fixture', async () => {
    const a = productsOf(X), y = productsOf(Y);
    const b = bucket([...y.blobs, [manifestPath(), JSON.stringify({ ...y.manifest, files: { ...y.manifest.files, 'index.json': a.manifest.files['index.json'] } })], [productPath(a.manifest.files['index.json']), a.text]]);
    await expect(corpusNow(platformOf(b), noStatic)).rejects.toMatchObject({ status: 503 });
  });
  it('a bucket that holds no corpus at all (a dev server\'s empty bucket) is the fixture, as before', async () => {
    expect((await corpusNow(platformOf(bucket()), noStatic)).corpus).toBe('fixture');
  });
});

describe('a refused manifest is remembered for ten minutes, then read again (round sixty; A25)', () => {
  it('a damaged index put right under the identical manifest is taken once the ten minutes pass', async () => {
    const a = productsOf(X), y = productsOf(Y);
    const b = bucket([...a.blobs, [manifestPath(), JSON.stringify(a.manifest)]]);
    const p = platformOf(b);
    const T0 = now;
    expect((await corpusNow(p, noStatic)).corpus).toBe(a.manifest.id);
    // B lands with its index damaged in transit (not JSON)
    for (const [k, v] of y.blobs) b.m.set(k, v);
    const yIndex = productPath(y.manifest.files['index.json']);
    b.m.set(yIndex, '[{"key":1,');
    b.m.set(manifestPath(), JSON.stringify(y.manifest));
    at(T0 + 61_000);
    b.reads.length = 0;
    expect((await corpusNow(p, noStatic)).corpus).toBe(a.manifest.id);
    expect(b.reads).toContain(yIndex);
    // the index is put right under the same name; the manifest is byte for byte the same, so its etag is too
    b.m.set(yIndex, y.blobs.get(yIndex)!);
    b.reads.length = 0;
    at(T0 + 61_000 + REFUSAL_MS - 30_000);
    expect((await corpusNow(p, noStatic)).corpus).toBe(a.manifest.id); // still remembered
    expect(b.reads).toEqual([]);
    at(T0 + 61_000 + REFUSAL_MS + 61_000);
    expect((await corpusNow(p, noStatic)).corpus).toBe(y.manifest.id); // read again, and taken
  });
});

describe('an R2 error at the minute\'s check keeps the corpus held (round sixty; the server review, 7; the corpus review, 5)', () => {
  it('a head that throws: the held corpus answers, and the bucket is asked again ten seconds later, not on every request', async () => {
    const a = productsOf(X);
    const b = bucket([...a.blobs, [manifestPath(), JSON.stringify(a.manifest)]]);
    const p = platformOf(b);
    const T0 = now;
    await corpusNow(p, noStatic);
    b.fail.head = true;
    at(T0 + 61_000);
    expect((await corpusNow(p, noStatic)).corpus).toBe(a.manifest.id);
    const h = b.heads();
    at(T0 + 61_000 + 5_000);
    expect((await corpusNow(p, noStatic)).corpus).toBe(a.manifest.id);
    expect(b.heads()).toBe(h);
    at(T0 + 61_000 + 11_000);
    expect((await corpusNow(p, noStatic)).corpus).toBe(a.manifest.id);
    expect(b.heads()).toBeGreaterThan(h);
  });
  it('a get that throws after a new manifest was seen keeps the old corpus, and takes the new one once R2 answers', async () => {
    const a = productsOf(X), y = productsOf(Y);
    const b = bucket([...a.blobs, [manifestPath(), JSON.stringify(a.manifest)]]);
    const p = platformOf(b);
    const T0 = now;
    await corpusNow(p, noStatic);
    for (const [k, v] of y.blobs) b.m.set(k, v);
    b.m.set(manifestPath(), JSON.stringify(y.manifest));
    b.fail.get = true;
    at(T0 + 61_000);
    expect((await corpusNow(p, noStatic)).corpus).toBe(a.manifest.id);
    b.fail.get = false;
    at(T0 + 61_000 + 11_000);
    expect((await corpusNow(p, noStatic)).corpus).toBe(y.manifest.id);
  });
  it('with nothing held, an R2 that does not answer is a 503, never the fixture', async () => {
    const b = bucket([[manifestPath(), '{}']]);
    b.fail.get = true;
    await expect(corpusNow(platformOf(b), noStatic)).rejects.toMatchObject({ status: 503 });
  });
});

describe('the near pass is charged as the exact one is (round sixty; A26; the corpus review, 6)', () => {
  const big = Array.from({ length: WHOLE_LIKE + 100 }, (_, i) => ({ key: i + 1, slug: `g${i}-s`, name: `G${i} s`, family: 'Cactaceae', open: 0, photos: 0, climate: 'ok' }));
  it('a typo whose near keys reach a family of more than WHOLE_LIKE species is charged, once', async () => {
    const p = productsOf(big);
    const plat = platformOf(bucket([...p.blobs, [manifestPath(), JSON.stringify(p.manifest)]]));
    let charged = 0;
    const r = await searchAnswer(plat, noStatic, 'xact', 60, async () => { charged++; return null; });
    expect('hits' in r).toBe(true);
    expect(charged).toBe(1);
    const refused = await searchAnswer(plat, noStatic, 'xact', 60, async () => new Response('slow', { status: 429 }));
    expect('stop' in refused && refused.stop.status).toBe(429);
    // an exact pass past WHOLE_LIKE and then the near pass: one charge for the request, not two
    charged = 0;
    await searchAnswer(plat, noStatic, 'cactaceaq', 60, async () => { charged++; return null; });
    expect(charged).toBe(1);
  });
});

describe('the query read as characters (round sixty; A28, A29)', () => {
  it('_clean normalises before it cuts, and cuts by characters: two spellings of one long query are one query', () => {
    const long = 'a'.repeat(79);
    const composed = `${long}é more`;
    const decomposed = `${long}é more`;
    expect(_clean(decomposed)).toBe(_clean(composed));
    expect(_clean(composed)).toBe(`${long}é`);
    const astral = _clean(`${'b'.repeat(79)}𝔸𝔸`);
    expect(astral).toBe(`${'b'.repeat(79)}𝔸`);
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(astral)).toBe(false);
  });
  it('clip never leaves half a character, keeps a word that ends where the room does, and never ends ".…"', () => {
    const s = `${'x'.repeat(8)}😀😀😀 tail`; // the emoji straddle the cut
    const c = clip(s, 10);
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(c)).toBe(false);
    expect(c.endsWith('…')).toBe(true);
    expect(clip('abcdefghi jklmnopqrstuvwxyz and more', 10)).toBe('abcdefghi…');
    expect(clip(`${'a'.repeat(13)} bbbbb ccc ddd`, 20)).toBe(`${'a'.repeat(13)} bbbbb…`); // "bbbbb" ends where the room does: kept, not dropped
    expect(clip('A short sentence. Then a long one that goes on', 19)).toBe('A short sentence…');
    expect(clip('abcdefghijklmn opqrstuvwxyz', 20)).toBe('abcdefghijklmn…');
    const w = 'Welwitschia is a monotypic genus of gnetophytes containing only the species Welwitschia mirabilis. It is named after the Austrian botanist Friedrich Welwitsch, who described it in 1859.';
    for (const n of [40, 77, 101, 155]) {
      const cut = clip(w, n);
      expect(cut.length).toBeLessThanOrEqual(n);
      const body = cut.slice(0, -1);
      expect(/[\s,.;:]/.test(w[body.length] ?? ' '), `${n}: ${cut}`).toBe(true);
    }
    expect(clip('short', 10)).toBe('short');
  });
});

/** The reviewer's grower index (corpus review, ux): names as the reference files them. */
const UX: E[] = [
  ['Copiapoa cinerea', { family: 'Cactaceae', origin: ['Chile North'], syn: ['Echinocactus cinereus'] }, 5384013],
  ['Copiapoa humilis', { family: 'Cactaceae', origin: ['Chile North'] }],
  ['Lithops lesliei', { family: 'Aizoaceae', common: 'living stones', origin: ['Northern Provinces'] }],
  ['Welwitschia mirabilis', { family: 'Welwitschiaceae', common: 'Welwitschia', commons: ['tree tumbo', 'tumboa'], origin: ['Namibia', 'Angola'] }],
  ['Aloe × nobilis', { family: 'Asphodelaceae' }],
  ['× Gasteraloe beguinii', { family: 'Asphodelaceae' }],
  ['Aloe vera', { family: 'Asphodelaceae', common: 'true aloe' }],
  ['Ariocarpus retusus subsp. trigonus', { family: 'Cactaceae' }],
  ['Ariocarpus retusus', { family: 'Cactaceae' }],
  ['Echeveria elegans', { family: 'Crassulaceae', common: 'Mexican snowball' }],
  ['Curio rowleyanus', { family: 'Asteraceae', common: 'string-of-beads', commons: ['string of pearls'] }],
  ['Haworthiopsis attenuata', { family: 'Asphodelaceae', common: 'zebra haworthia', syn: ['Haworthia attenuata'] }]
].map(([name, extra, key], i) => ({ key: (key as number | undefined) ?? 100 + i, slug: (name as string).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), name: name as string, open: 0, photos: 0, climate: 'ok', ...(extra as object) }));

describe('the names growers write (round sixty; the corpus review, 3; the self-review, 15)', () => {
  const cases: Array<[string, string, string?]> = [
    // query, the first hit, and the retry's query when the answer is the retry's
    ['Copiapoa cinerea (Phil.) Britton & Rose', 'Copiapoa cinerea'],
    ['Copiapoa cinerea Britton & Rose', 'Copiapoa cinerea'],
    ['Copiapoa cinerea L.', 'Copiapoa cinerea'],
    ['Lithops lesliei N.E.Br.', 'Lithops lesliei'],
    ['Lithops lesliei (N.E.Br.) N.E.Br.', 'Lithops lesliei'],
    ['Aloe x nobilis', 'Aloe × nobilis'],
    ['Aloe × nobilis', 'Aloe × nobilis'],
    ['x Gasteraloe beguinii', '× Gasteraloe beguinii'],
    ['Ariocarpus retusus subspecies trigonus', 'Ariocarpus retusus subsp. trigonus'],
    ['Ariocarpus retusus fo. trigonus', 'Ariocarpus retusus subsp. trigonus'],
    ['Ariocarpus retusus v. trigonus', 'Ariocarpus retusus subsp. trigonus'],
    ['Copiapoa ’cinerea’', 'Copiapoa cinerea'], // a phone's quotes around a plain name: the name, as before
    ['Copiapoa cinerea var. columna-alba', 'Copiapoa cinerea', 'Copiapoa cinerea'],
    ['Copiapoa cinerea subsp. haseltoniana', 'Copiapoa cinerea', 'Copiapoa cinerea'],
    ["Echeveria 'Perle von Nurnberg'", 'Echeveria elegans', 'Echeveria'],
    ['Echeveria elegans ‘Rainbow’', 'Echeveria elegans', 'Echeveria elegans'],
    ['Echeveria cv. Perle', 'Echeveria elegans', 'Echeveria'],
    ['Haworthia attenuata f. clariperla', 'Haworthiopsis attenuata', 'Haworthia attenuata'],
    ['string of pearls', 'Curio rowleyanus'], // a second English name, searched since round sixty
    ['tree tumbo', 'Welwitschia mirabilis']
  ];
  it('each is found, through the postings and through the whole index alike; a retry says what it searched for', async () => {
    const p = productsOf(UX);
    const withManifest = platformOf(bucket([...p.blobs, [manifestPath(), JSON.stringify(p.manifest)]]));
    const plain = platformOf(bucket([['s/v2/index.json', JSON.stringify(UX)]]));
    for (const [q, first, retried] of cases) {
      const outs = [];
      for (const plat of [withManifest, plain]) {
        _forgetIndex();
        const a = await searchAnswer(plat, noStatic, _clean(q), 5, async () => null);
        if ('stop' in a) throw new Error('stopped');
        outs.push({ first: a.hits[0]?.name, relaxed: a.relaxed?.query });
      }
      expect({ q, ...outs[0] }).toEqual({ q, first, relaxed: retried });
      expect(outs[1]).toEqual(outs[0]);
    }
  });
  it('nothing to retry: the answer is empty and says no retry', async () => {
    const plain = platformOf(bucket([['s/v2/index.json', JSON.stringify(UX)]]));
    const a = await searchAnswer(plain, noStatic, 'zzzz qqqq', 5, async () => null);
    expect(a).toMatchObject({ hits: [] });
    expect('relaxed' in a && a.relaxed).toBeFalsy();
    expect(relaxedQuery('Aloe vera')).toBeNull();
    expect(cleanQuery('Cape Provinces South')).toEqual(['Cape', 'Provinces', 'South']); // capitals after a capitalised word are not an author
  });
  it("the species 404's suggestions find the species a variety is filed under", async () => {
    const { load } = await import('../../src/routes/species/[slug]/+page.server');
    const url = new URL('https://x/species/copiapoa-cinerea-var-columna-alba');
    const gbifDown = (async (u: string) => (String(u).includes('gbif.org') ? new Response('busy', { status: 503 }) : new Response('', { status: 404 }))) as unknown as typeof fetch;
    const e = await caught(load({ params: { slug: 'copiapoa-cinerea-var-columna-alba' }, platform: undefined, fetch: gbifDown, setHeaders: () => {}, cookies: { get: () => undefined }, request: new Request(url), url, getClientAddress: () => '1.2.3.9', locals: {} } as never));
    expect(e).toMatchObject({ status: 404 });
    expect(e.body.species.suggest.map((s: { slug: string }) => s.slug)).toContain('copiapoa-cinerea');
  });
  it('/api/search answers a list, with the retry named in a header; `shape=2` answers { hits, relaxed }', async () => {
    const { GET } = await import('../../src/routes/api/search/+server');
    const plat = platformOf(bucket([['s/v2/index.json', JSON.stringify(UX)]]));
    const call = (qs: string) => GET({ url: new URL(`https://x/api/search?${qs}`), platform: plat, fetch: noStatic, getClientAddress: () => '1.2.3.4' } as never);
    const a = await call(`q=${encodeURIComponent('Copiapoa cinerea var. columna-alba')}`);
    expect(((await a.json()) as Array<{ name: string }>)[0].name).toBe('Copiapoa cinerea');
    expect(decodeURIComponent(a.headers.get('x-search-relaxed') ?? '')).toBe('Copiapoa cinerea');
    const b = (await (await call(`q=${encodeURIComponent('Copiapoa cinerea var. columna-alba')}&shape=2`)).json()) as { hits: Array<{ name: string }>; relaxed?: { query: string } };
    expect(b.relaxed).toEqual({ query: 'Copiapoa cinerea' });
    expect(b.hits[0].name).toBe('Copiapoa cinerea');
    const c = (await (await call('q=aloe&shape=2')).json()) as { hits: unknown[]; relaxed?: unknown };
    expect(c.relaxed).toBeUndefined();
    expect(c.hits.length).toBeGreaterThan(0);
    expect(await (await call('q=%3C%3E&shape=2')).json()).toEqual({ hits: [] });
  });
});

describe('every English common name (round sixty; the product review, 6)', () => {
  it('the build keeps the first as `common` and every other, once, as `commons`', () => {
    expect(englishNames([{ name: 'Tree tumbo', lang: 'eng' }, { name: 'Tumboa', lang: 'eng' }, { name: 'tree  tumbo', lang: 'eng' }, { name: 'Tweeblaarkanniedood', lang: 'afr' }])).toEqual({ common: 'Tree tumbo', commons: ['Tumboa'] });
    expect(englishNames([{ name: 'Welwitschia', lang: 'eng' }])).toEqual({ common: 'Welwitschia' });
    expect(englishNames([{ name: 'x', lang: 'deu' }])).toEqual({});
  });
  it('an index from before (no `commons`) is still read and searched', async () => {
    const old = UX.map(({ commons: _c, ...e }) => e);
    const plat = platformOf(bucket([['s/v2/index.json', JSON.stringify(old)]]));
    const a = await searchAnswer(plat, noStatic, 'string of beads', 5, async () => null);
    expect('hits' in a && a.hits[0]?.name).toBe('Curio rowleyanus');
    const b = await searchAnswer(plat, noStatic, 'tree tumbo', 5, async () => null);
    expect('hits' in b && b.hits.length).toBe(0);
  });
});

/** A bucket corpus holding Copiapoa cinerea, its dossier as given (or none). */
function speciesBucket(dossier: string | null) {
  const p = productsOf(X);
  const b = bucket([...p.blobs, [manifestPath(), JSON.stringify(p.manifest)], ...(dossier ? [[dossierPath(5384013), dossier] as [string, string]] : [])]);
  return { b, plat: platformOf(b), p };
}
const speciesEvent = (slug: string, plat: App.Platform | undefined, headers: Record<string, string> = {}, fetch = noStatic) => {
  const url = new URL(`https://cultifolio.com/species/${encodeURIComponent(slug)}`); // `params.slug` is the decoded path segment
  return { params: { slug }, platform: plat, fetch, setHeaders: (h: Record<string, string>) => Object.assign(headers, h), cookies: { get: () => undefined }, request: new Request(url), url, getClientAddress: () => '1.2.3.4', locals: {} };
};

describe('a species the index lists whose page cannot be read (round sixty; A6)', () => {
  it('is a 503 "could not be read", not kept, carrying the species and `unreadable`: never "No species page"', async () => {
    const { plat } = speciesBucket(null);
    const headers: Record<string, string> = {};
    const { load } = await import('../../src/routes/species/[slug]/+page.server');
    const e = await caught(load(speciesEvent('copiapoa-cinerea', plat, headers) as never));
    expect(e).toMatchObject({ status: 503, body: { message: 'This species page could not be read just now', unreadable: true, species: { name: 'Copiapoa cinerea', genus: 'Copiapoa' } } });
    expect(headers['cache-control']).toBe('no-store');
  });
  it('a dossier read that throws (R2) is the same 503', async () => {
    const { b, plat } = speciesBucket(FIXTURE_DOSSIER);
    await corpusNow(plat, noStatic);
    const get = b.get;
    b.get = async (k: string) => { if (k === dossierPath(5384013)) throw new Error('R2 internal error'); return get(k); };
    const { load } = await import('../../src/routes/species/[slug]/+page.server');
    await expect(load(speciesEvent('copiapoa-cinerea', plat) as never)).rejects.toMatchObject({ status: 503 });
  });
  it('compare says "could not be read" for that column, and "not in the reference" only for a name the index lacks', async () => {
    const { plat } = speciesBucket(null);
    const headers: Record<string, string> = {};
    const { load } = await import('../../src/routes/compare/+page.server');
    const url = new URL('https://x/compare?s=copiapoa-cinerea,aloe-vera,nonsensia-fakeii');
    const page = (await load({ url, platform: plat, fetch: noStatic, setHeaders: (h: Record<string, string>) => Object.assign(headers, h), cookies: { get: () => undefined }, request: new Request(url), locals: {} } as never)) as { missing: string[]; unreadable: string[]; items: unknown[] };
    expect(page.missing).toEqual(['nonsensia-fakeii']);
    expect(page.unreadable).toEqual(['copiapoa-cinerea', 'aloe-vera']);
    expect(headers['cache-control']).toBe('no-store');
  });
  it('/api/dossier: 503 for a listed key it cannot read, 404 for a key the index lacks; never kept', async () => {
    const { plat } = speciesBucket(null);
    const { GET } = await import('../../src/routes/api/dossier/[key]/+server');
    const ask = async (key: string) => {
      try {
        return await GET({ params: { key }, platform: plat, fetch: noStatic, getClientAddress: () => '1.2.3.4', url: new URL(`https://x/api/dossier/${key}`) } as never);
      } catch (e) {
        return e as { status: number; headers?: Headers };
      }
    };
    const a = await ask('5384013');
    expect([a.status, a.headers?.get('cache-control')]).toEqual([503, 'no-store']);
    expect(await ask('424242')).toMatchObject({ status: 404 });
  });
});

describe('/api/dossier (round sixty; B11, the harness review, 10)', () => {
  it('a cold isolate\'s first request is answered, not a 404, and every answer is no-store', async () => {
    _forgetIndex(); // nothing loaded: the fixture's stand-in used to be decided before the load that set it
    const { GET } = await import('../../src/routes/api/dossier/[key]/+server');
    const ask = async (q: string) => GET({ params: { key: '5384013' }, platform: undefined, fetch: noStatic, getClientAddress: () => '1.2.3.6', url: new URL(`https://x/api/dossier/5384013${q}`) } as never);
    const first = await ask('?c=fixture');
    expect(first.status).toBe(200);
    for (const q of ['', '?c=someoldcorpus', '?c=fixture']) expect((await ask(q)).headers.get('cache-control')).toBe('no-store');
    expect(await getDossier(undefined, noStatic, 5384013)).not.toBeNull();
  });
});

describe('odd species addresses (round sixty; the corpus review, 9)', () => {
  it('a space, an underscore, capitals, an encoded ? or a line break move to the slug; the Location is always encoded', async () => {
    const { load } = await import('../../src/routes/species/[slug]/+page.server');
    const where = async (slug: string) => {
      const e = await caught(load(speciesEvent(slug, undefined) as never));
      return e && { status: e.status, location: e.location };
    };
    expect(await where('Copiapoa cinerea')).toEqual({ status: 301, location: '/species/copiapoa-cinerea' });
    expect(await where('copiapoa_cinerea')).toEqual({ status: 301, location: '/species/copiapoa-cinerea' });
    expect(await where('Copiapoa-Cinerea')).toEqual({ status: 301, location: '/species/copiapoa-cinerea' });
    expect(await where('Copiapoa?x')).toEqual({ status: 301, location: '/species/copiapoa-x' });
    const crlf = await where('A\r\nX-Evil: 1');
    expect(crlf?.status).toBe(301);
    expect(crlf?.location).not.toMatch(/[\r\n\s]/);
    expect(await where('%%%')).toEqual({ status: 404, location: undefined });
  });
  it('an underscore or a space splits a name as a hyphen does', () => {
    expect(nameFromSlug('copiapoa_cinerea')).toBe('Copiapoa cinerea');
    expect(nameFromSlug('Copiapoa cinerea')).toBe('Copiapoa cinerea');
    expect(nameFromSlug('haworthia-attenuata-var-radula')).toBe('Haworthia attenuata var. radula');
  });
});

describe('one corpus per request, for the older names too (round sixty; A27)', () => {
  it('synonymInIndex reads the corpus the request holds', async () => {
    const held = { idx: [{ key: 77, slug: 'tylecodon-paniculatus', name: 'Tylecodon paniculatus', open: 0, photos: 0, climate: 'ok', syn: ['Cotyledon paniculata'] }] } as unknown as Loaded;
    expect(await synonymInIndex(undefined, noStatic, 'cotyledon-paniculata', held)).toMatchObject({ acceptedKey: 77, slug: 'tylecodon-paniculatus' });
    expect(await synonymInIndex(undefined, noStatic, 'cotyledon-paniculata')).toBeNull(); // the fixture corpus has no such name
  });
});

describe('Commons photographs at 800 pixels (round sixty; A7; the self-review, 13)', () => {
  const ORIG = 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Copiapoa_cinerea.jpg';
  const THUMB = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Copiapoa_cinerea.jpg/800px-Copiapoa_cinerea.jpg';
  it('shownAt gives the thumbnail for an original, and keeps a thumbnail or another host as it is', () => {
    expect(shownAt({ url: ORIG, thumb: THUMB })).toBe(THUMB);
    expect(shownAt({ url: THUMB, thumb: THUMB })).toBe(THUMB);
    expect(shownAt({ url: ORIG })).toBe(ORIG);
    expect(shownAt({ url: ORIG, thumb: 'https://api.gbif.org/v1/image/cache/fit-in/400x/occurrence/1/media/ab' })).toBe('https://api.gbif.org/v1/image/cache/fit-in/400x/occurrence/1/media/ab');
    expect(shownAt({ url: ORIG, thumb: 'https://elsewhere.example/a.jpg' })).toBe(ORIG); // never a host the page does not name
    expect(shownAt({ url: 'https://static.inaturalist.org/photos/1/large.jpg', thumb: 'x' })).toBe('https://static.inaturalist.org/photos/1/large.jpg');
    expect(shownAt({ url: 'https://example.org/a.jpg', thumb: 'https://api.gbif.org/v1/image/cache/x' })).toBe('https://api.gbif.org/v1/image/cache/x');
  });
  it('a species page whose lead photograph is from Commons is given data whose lead loads at the thumbnail', async () => {
    const d = JSON.parse(FIXTURE_DOSSIER);
    d.photos = [{ src: 'commons', id: 'c1', url: ORIG, thumb: THUMB, width: 4000, height: 3000, licence: 'by-sa', attribution: 'A. Grower (CC BY-SA)', page: 'https://commons.wikimedia.org/wiki/File:Copiapoa_cinerea.jpg', captive: false }];
    const { plat } = speciesBucket(JSON.stringify(d));
    const { load } = await import('../../src/routes/species/[slug]/+page.server');
    const page = (await load(speciesEvent('copiapoa-cinerea', plat) as never)) as { d: { photos: Array<{ url: string; thumb: string; captive?: boolean }> } };
    expect(shownAt(heroOf(page.d.photos)!)).toBe(THUMB);
  });
});

describe('the catalogue counts a pending climate apart from a refused one (round sixty; A10; the self-review, 14)', () => {
  it('notChecked is the refused alone; pending is its own count; an older file reads pending as 0', async () => {
    const idx = [...mk(['Aloe a', 'Aloe b', 'Aloe c', 'Aloe d'])];
    idx[1].climate = 'refused';
    idx[2].climate = 'pending';
    idx[3].climate = 'none';
    const row = catalogueOf(idx as never, 'genus', 'all').rows.find((r) => r.id === 'aloe')!;
    expect({ count: row.count, withClimate: row.withClimate, notChecked: row.notChecked, pending: row.pending }).toEqual({ count: 4, withClimate: 1, notChecked: 1, pending: 1 });
    // a corpus built before round sixty: its catalogue file's rows have no `pending`
    const p = productsOf(idx);
    const file = catalogueOf(idx as never, 'genus', 'all');
    const old = { rows: file.rows.map(({ pending: _p, ...r }) => r), letters: file.letters, letterAt: file.letterAt, total: file.total, withClimate: file.withClimate };
    const b = bucket([...p.blobs, [manifestPath(), JSON.stringify(p.manifest)]]);
    b.m.set(productPath(p.manifest.files['catalogue/genus-all.json']), JSON.stringify(old));
    const got = await catalogueRows(platformOf(b), noStatic, 'genus', 'all');
    expect(got.fromFile).toBe(true);
    expect(got.cat.rows[0].pending).toBe(0);
  });
});

describe('the sitemap says when the corpus was built (round sixty; the corpus review, 14)', () => {
  it('lastmod is the manifest\'s build day; a corpus with none writes none', async () => {
    expect(lastmodOf('2026-10-01T08:30:00.000Z')).toBe('2026-10-01');
    expect(lastmodOf(undefined)).toBeNull();
    expect(lastmodOf('not a date')).toBeNull();
    expect(sitemapChunk(['/species/a'], 1, '2026-10-01')).toContain('<url><loc>https://cultifolio.com/species/a</loc><lastmod>2026-10-01</lastmod></url>');
    expect(sitemapIndex(['/species/a'], '2026-10-01')).toContain('<lastmod>2026-10-01</lastmod>');
    expect(sitemapChunk(['/species/a'], 1)).not.toContain('lastmod');
    const p = productsOf(X);
    const plat = platformOf(bucket([...p.blobs, [manifestPath(), JSON.stringify(p.manifest)]]));
    const { GET } = await import('../../src/routes/sitemap-[n].xml/+server');
    const r = await GET({ params: { n: '1' }, platform: plat, fetch: noStatic, getClientAddress: () => '1.2.3.4' } as never);
    expect(await r.text()).toContain(`<lastmod>${lastmodOf(p.manifest.built)}</lastmod>`);
  });
});

describe('the search\'s answers are kept in the Worker\'s cache for a day (round sixty; the server review, 15)', () => {
  it('the same query under the same corpus is answered from the cache: no posting read, no count against the address', async () => {
    const p = productsOf(UX);
    const b = bucket([...p.blobs, [manifestPath(), JSON.stringify(p.manifest)]]);
    const kept = new Map<string, Response>();
    const plat = platformOf(b, { caches: { default: { match: async (r: Request) => kept.get(r.url)?.clone(), put: async (r: Request, res: Response) => { kept.set(r.url, res); } } } });
    const { GET } = await import('../../src/routes/api/search/+server');
    const call = () => GET({ url: new URL(`https://x/api/search?q=copiapoa&c=${p.manifest.id}`), platform: plat, fetch: noStatic, getClientAddress: () => '1.2.3.4' } as never);
    const first = await call();
    expect(first.headers.get('cache-control')).toBe('public, max-age=86400');
    expect([...kept.keys()][0]).toContain(`c=${p.manifest.id}`);
    b.reads.length = 0;
    const second = await call();
    expect(await second.json()).toEqual(await first.json());
    expect(b.reads).toEqual([]);
    // a query cleaned to the same text shares the entry
    await GET({ url: new URL(`https://x/api/search?q=${encodeURIComponent('copiapoa,')}&c=${p.manifest.id}`), platform: plat, fetch: noStatic, getClientAddress: () => '1.2.3.4' } as never);
    expect(kept.size).toBe(1);
  });
});

describe('short.json is used only when its positions are this index\'s (S46)', () => {
  it('a file whose positions are out of range is not used: the postings answer', async () => {
    const idx = mk(['Aloe vera', 'Aloe ferox', 'Agave americana', 'Copiapoa cinerea']);
    const p = productsOf(idx);
    p.blobs.set(productPath(p.manifest.files['short.json']!), JSON.stringify({ a: [99999, 5] }));
    const plat = platformOf(bucket([...p.blobs, [manifestPath(), JSON.stringify(p.manifest)]]));
    const got = await searchAnswer(plat, noStatic, 'a', 60, async () => null);
    if ('stop' in got) throw new Error('stopped');
    expect(got.hits.map((h) => h.key)).toEqual(search(prepare(idx), 'a', 60).map((h) => h.key));
  });
});

describe('the species 404 that could not ask GBIF (S57)', () => {
  it('is not cached', async () => {
    const headers: Record<string, string> = {};
    const { load } = await import('../../src/routes/species/[slug]/+page.server');
    const down = (async (u: string) => (String(u).includes('api.gbif.org') ? new Response('busy', { status: 503 }) : new Response('', { status: 404 }))) as unknown as typeof fetch;
    await expect(load(speciesEvent('nonsensia-fakeii', undefined, headers, down) as never)).rejects.toMatchObject({ status: 404 });
    expect(headers['cache-control']).toBe('no-store');
  });
});
