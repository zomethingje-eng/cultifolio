/**
 * The build's products and the manifest (round fifty-three, 2): what buildProducts writes for an index, that the
 * Worker answers from them when a manifest names them and from the index when none does, that the bucket count
 * scales with the corpus and is announced, and that a search over a shard finds what a search over the whole does.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildProducts } from '$dossier/products';
import { isManifest, shardsOf, contentHash, manifestPath, productPath, type Manifest } from '$dossier/manifest';
import { bucketsFor, bucketOf, isBucket, bucketWidth, bucketNames, BUCKETS } from '$core/bucket';
import { prepare, search, shardOf } from '$core/search';
import { catalogueOf, rowsOnly } from '$dossier/catalogue';
import type { IndexEntry } from '$dossier/index-entry';
import { _forgetIndex, getCorpus, product, entriesIn, searchFor } from '$lib/server/dossiers';
import { GET as corpusGET } from '../../src/routes/api/corpus/+server';
import { GET as entriesGET } from '../../src/routes/api/entries/+server';
import { GET as searchGET } from '../../src/routes/api/search/+server';
import { GET as rowsGET } from '../../src/routes/api/rows/+server';
import { GET as sheetsGET } from '../../src/routes/api/sheets/+server';
import { resetRateLimits } from '$lib/server/sync';

const GENERA = ['Aloe', 'Copiapoa', 'Conophytum', 'Haworthia', 'Lithops', 'Mammillaria', 'Echeveria', 'Gasteria', 'Tulista', 'Welwitschia'];
const index = (n: number): IndexEntry[] =>
  Array.from({ length: n }, (_, i) => {
    const g = GENERA[i % GENERA.length];
    const name = `${g} sp${i}`;
    return { key: i + 1, slug: name.toLowerCase().replace(/ /g, '-'), name, family: i % 3 ? 'Cactaceae' : 'Asphodelaceae', common: i % 7 ? undefined : 'silver cactus', origin: [i % 2 ? 'Chile North' : 'Cape Provinces'], photos: 3, open: i, climate: i % 2 ? 'ok' : 'none', syn: i % 5 ? undefined : [`Oldname sp${i}`] };
  });

const noStatic = (async () => new Response('', { status: 404 })) as typeof fetch;
const kv = () => { const m = new Map<string, string>(); return { get: async (k: string) => m.get(k) ?? null, put: async (k: string, v: string) => void m.set(k, v) }; };
/** An R2 holding the given objects, with a head that answers the etag. */
function r2(files: Record<string, unknown>) {
  const etag = (k: string) => `"${contentHash(JSON.stringify(files[k])).slice(0, 8)}"`;
  return { get: async (k: string) => (k in files ? { json: async () => files[k], text: async () => JSON.stringify(files[k]), etag: etag(k) } : null), head: async (k: string) => (k in files ? { etag: etag(k) } : null) };
}
const platformWith = (store: ReturnType<typeof r2>) => ({ env: { STORE: store, QUEUE: kv() }, context: { waitUntil: (p: Promise<unknown>) => void p } }) as unknown as App.Platform;
/** The bucket as the build writes it: index.json at the top, the products under b/<id>/, the manifest naming it. */
function bucketFor(idx: IndexEntry[], opts: { manifest?: boolean; drop?: string[]; tamper?: Record<string, unknown> } = {}) {
  const text = JSON.stringify(idx, null, 1);
  const { manifest, files } = buildProducts(idx, text, () => new Map());
  const objects: Record<string, unknown> = { 's/v2/index.json': idx };
  if (opts.manifest !== false) {
    objects[manifestPath()] = manifest;
    for (const [name, body] of files) if (!opts.drop?.includes(name)) objects[productPath(manifest.id, name)] = JSON.parse(body);
    for (const [name, v] of Object.entries(opts.tamper ?? {})) objects[productPath(manifest.id, name)] = v;
  }
  return { manifest, store: r2(objects) };
}
const call = (handler: (e: never) => Promise<Response>, path: string, platform: App.Platform) => handler({ url: new URL(`http://x${path}`), platform, fetch: noStatic, getClientAddress: () => '1.2.3.4' } as never);

beforeEach(() => { _forgetIndex(); resetRateLimits(); });

describe('buckets that scale (round fifty-three, 2)', () => {
  it('thirty-two up to about ten thousand species, doubling past that, and the names widen with the count', () => {
    expect(bucketsFor(9_000)).toBe(32);
    expect(bucketsFor(10_240)).toBe(32);
    expect(bucketsFor(10_241)).toBe(64);
    expect(bucketsFor(50_000)).toBe(256);
    expect(bucketsFor(100_000)).toBe(512);
    expect(bucketWidth(32)).toBe(2);
    expect(bucketWidth(256)).toBe(2);
    expect(bucketWidth(512)).toBe(3);
    expect(bucketNames(512)[511]).toBe('1ff');
    expect(isBucket('1f', 32)).toBe(true);
    expect(isBucket('20', 32)).toBe(false);
    expect(isBucket('3f', 64)).toBe(true);
    expect(isBucket('1ff', 512)).toBe(true);
    expect(isBucket('ff', 512)).toBe(false); // the wrong width
    expect(isBucket('zz', 32)).toBe(false);
    // the same slug lands in the same low bucket under thirty-two as every build before (the hash is the same; the modulus differs)
    expect(bucketOf('copiapoa-cinerea')).toBe(bucketOf('copiapoa-cinerea', BUCKETS));
    expect(bucketOf('copiapoa-cinerea', 64)).toMatch(/^[0-3][0-9a-f]$/);
  });
});

describe('the products', () => {
  it('cover every species once in the entries, name every shard a word begins, carry the catalogues, and name the same id for the same index', () => {
    const idx = index(200);
    const text = JSON.stringify(idx, null, 1);
    const a = buildProducts(idx, text, () => new Map(), '2026-01-01T00:00:00Z');
    const b = buildProducts(idx, text, () => new Map(), '2026-02-02T00:00:00Z');
    expect(isManifest(a.manifest)).toBe(true);
    expect(a.manifest.id).toBe(b.manifest.id);
    expect(a.manifest.files).toEqual(b.manifest.files); // the date is not in a file's hash
    expect(a.manifest.buckets).toBe(32);
    expect(a.manifest.species).toBe(200);
    const entries = bucketNames(32).flatMap((bk) => JSON.parse(a.files.get(`entries/${bk}.json`)!) as IndexEntry[]);
    expect(entries.map((e) => e.key).sort((x, y) => x - y)).toEqual(idx.map((e) => e.key));
    for (const bk of bucketNames(32)) for (const e of JSON.parse(a.files.get(`entries/${bk}.json`)!) as IndexEntry[]) expect(bucketOf(e.slug, 32)).toBe(bk);
    // every entry is in each shard of its words' first letters, and in no other
    const prepared = prepare(idx);
    for (const p of prepared) {
      for (const c of shardsOf(p)) expect((JSON.parse(a.files.get(`search/${c}.json`)!) as Array<{ item: IndexEntry }>).some((x) => x.item.key === p.item.key)).toBe(true);
    }
    expect(a.manifest.search).toContain('o'); // from the synonyms ("Oldname")
    expect(a.manifest.search).toContain('s'); // from the common name
    expect(a.manifest.search).not.toContain('z');
    expect(JSON.parse(a.files.get('catalogue/genus-all.json')!)).toEqual(JSON.parse(JSON.stringify(rowsOnly(catalogueOf(idx, 'genus', 'all')))));
    expect(a.files.has('catalogue/origin-noclimate.json')).toBe(true);
    expect(JSON.parse(a.files.get('index.json')!)).toEqual(idx);
    // a different index is a different id
    expect(buildProducts(index(201), JSON.stringify(index(201), null, 1), () => new Map()).manifest.id).not.toBe(a.manifest.id);
  });
  it('a search over the query\'s shard finds what a search over the whole finds, for exact matches, any word order, common names, origins and older names', () => {
    const idx = index(300);
    const { files } = buildProducts(idx, JSON.stringify(idx), () => new Map());
    const whole = prepare(idx);
    const shard = (q: string) => JSON.parse(files.get(`search/${shardOf(q)}.json`) ?? '[]') as typeof whole;
    for (const q of ['cop', 'copiapoa sp1', 'sp12 lithops', 'silver cactus', 'chile', 'oldname sp5', 'asphodelaceae', 'haworthia pumila var', 'Conophitum']) {
      expect(search(shard(q), q).map((x) => x.key)).toEqual(search(whole, q).map((x) => x.key));
    }
    expect(shardOf('var aloe')).toBe('a'); // a rank marker another word follows is not the first word
    expect(shardOf('')).toBeNull();
  });
});

describe('the Worker and the manifest', () => {
  it('announces the corpus id and the bucket count from the manifest, and reads the index from under the id', async () => {
    const idx = index(50);
    const { manifest, store } = bucketFor(idx);
    const platform = platformWith(store);
    expect(await getCorpus(platform, noStatic)).toEqual({ id: manifest.id, buckets: 32, products: true });
    const r = await call(corpusGET as never, '/api/corpus', platform);
    expect(await r.json()).toEqual({ id: manifest.id, buckets: 32 });
    expect(r.headers.get('cache-control')).toBe('no-store');
  });
  it('without a manifest the index object\'s etag is the id, the count is thirty-two, and everything is derived from the index', async () => {
    const idx = index(50);
    const { store } = bucketFor(idx, { manifest: false });
    const platform = platformWith(store);
    const c = await getCorpus(platform, noStatic);
    expect(c.products).toBe(false);
    expect(c.buckets).toBe(32);
    expect(c.id).not.toBe('fixture');
    expect(await product(platform, noStatic, 'entries/00.json')).toBeNull();
    const b = bucketOf(idx[0].slug);
    expect((await entriesIn(platform, noStatic, b)).map((e) => e.key)).toContain(idx[0].key);
    expect((await searchFor(platform, noStatic, 'c')).length).toBe(50); // the whole index prepared
  });
  it('answers entries, search, rows and sheets from the product files when the manifest names them, and from the index when a file is missing', async () => {
    const idx = index(50);
    // tampered products say which path answered: an entries bucket with one extra species, a shard with a marker, a catalogue with one row
    const spy = { ...idx[0], key: 999_999, slug: 'spy-species', name: 'Spy species' };
    const b = bucketOf('spy-species', 32);
    const { manifest, store } = bucketFor(idx, {
      tamper: { [`entries/${b}.json`]: [spy], 'search/z.json': [{ item: spy, nameWords: ['zzz'], otherWords: [], synWords: [], sortKey: 'zzz' }], 'catalogue/genus-all.json': { rows: [{ id: 'spy', label: 'Spy', sub: '', count: 1, withClimate: 0, letter: 'S' }], letters: ['S'], letterAt: { S: 0 }, total: 1, withClimate: 0 }, 'sheets/00.json': [{ slug: 'spy-species', key: 999_999 }] },
      drop: ['entries/01.json']
    });
    // the manifest must name the shard for it to be read; write it as the build would have
    const m2: Manifest = { ...manifest, search: [...manifest.search, 'z'], files: { ...manifest.files, 'search/z.json': 'x' } };
    const files = { [manifestPath()]: m2, 's/v2/index.json': idx } as Record<string, unknown>;
    const store2 = { get: async (k: string) => (k === manifestPath() ? { json: async () => m2, text: async () => JSON.stringify(m2), etag: '"m2"' } : store.get(k)), head: async (k: string) => (k === manifestPath() ? { etag: '"m2"' } : store.head(k)) };
    void files;
    const platform = platformWith(store2 as never);
    expect((await getCorpus(platform, noStatic)).id).toBe(manifest.id);
    const e = await call(entriesGET as never, `/api/entries?b=${b}&c=${manifest.id}`, platform);
    expect((await e.json() as IndexEntry[]).map((x) => x.key)).toEqual([999_999]);
    expect(e.headers.get('cache-control')).toBe('public, max-age=86400');
    // the bucket whose file was dropped is hashed from the index
    const inOne = idx.filter((x) => bucketOf(x.slug, 32) === '01').map((x) => x.key);
    expect(((await (await call(entriesGET as never, `/api/entries?b=01&c=${manifest.id}`, platform)).json()) as IndexEntry[]).map((x) => x.key)).toEqual(inOne);
    const s = await call(searchGET as never, `/api/search?q=zzz&c=${manifest.id}`, platform);
    expect((await s.json() as IndexEntry[]).map((x) => x.key)).toEqual([999_999]);
    // a first letter no word in the corpus begins: nothing, and no file is asked for
    const none = await call(searchGET as never, `/api/search?q=qqq&c=${manifest.id}`, platform);
    expect(await none.json()).toEqual([]);
    const rows = await call(rowsGET as never, `/api/rows?by=genus&chip=all&c=${manifest.id}`, platform);
    expect(((await rows.json()) as { rows: Array<{ id: string }> }).rows.map((r) => r.id)).toEqual(['spy']);
    // a catalogue file the manifest does not name is derived from the index
    const fam = await call(rowsGET as never, `/api/rows?by=family&chip=all&c=${manifest.id}`, platform);
    expect(((await fam.json()) as { rows: Array<{ id: string }> }).rows.map((r) => r.id).sort()).toEqual(['asphodelaceae', 'cactaceae']);
    const sh = await call(sheetsGET as never, `/api/sheets?b=00&c=${manifest.id}`, platform);
    expect(((await sh.json()) as Array<{ slug: string }>).map((x) => x.slug)).toEqual(['spy-species']);
  });
  it('a corpus past ten thousand species is served in sixty-four buckets, and a bucket name from the old count is refused', async () => {
    const idx = index(10_300);
    const { manifest, store } = bucketFor(idx);
    const platform = platformWith(store);
    expect(manifest.buckets).toBe(64);
    expect(await (await call(corpusGET as never, '/api/corpus', platform)).json()).toEqual({ id: manifest.id, buckets: 64 });
    const ok = await call(entriesGET as never, `/api/entries?b=3f&n=64&c=${manifest.id}`, platform);
    expect(ok.status).toBe(200);
    for (const e of (await ok.json()) as IndexEntry[]) expect(bucketOf(e.slug, 64)).toBe('3f');
    await expect(call(entriesGET as never, `/api/entries?b=40&n=64&c=${manifest.id}`, platform)).rejects.toMatchObject({ status: 400 });
    await expect(call(sheetsGET as never, `/api/sheets?b=040&n=64&c=${manifest.id}`, platform)).rejects.toMatchObject({ status: 400 });
  });

  it('round fifty-four: the id names every product, so a sheet changed by a dossier is a new id; a manifest whose index is not there is not adopted and the corpus held before stands', async () => {
    const idx = index(40);
    const text = JSON.stringify(idx, null, 1);
    const a = buildProducts(idx, text, () => new Map(), '2026-01-01T00:00:00Z');
    const b = buildProducts(idx, text, (count) => new Map([[bucketOf(idx[0].slug, count), [{ slug: idx[0].slug, key: 1 } as never]]]), '2026-01-01T00:00:00Z');
    expect(b.manifest.files['index.json']).toBe(a.manifest.files['index.json']);
    expect(b.manifest.id).not.toBe(a.manifest.id);
    // an isolate holding corpus A (no manifest) sees a manifest for B land before B's index: it keeps A, under A's id
    const objects: Record<string, unknown> = { 's/v2/index.json': idx };
    const store = { get: async (k: string) => (k in objects ? { json: async () => objects[k], text: async () => JSON.stringify(objects[k]), etag: `"${contentHash(JSON.stringify(objects[k])).slice(0, 8)}"` } : null), head: async (k: string) => (k in objects ? { etag: `"${contentHash(JSON.stringify(objects[k])).slice(0, 8)}"` } : null) };
    const platform = platformWith(store as never);
    const before = await getCorpus(platform, noStatic);
    expect(before.products).toBe(false);
    objects[manifestPath()] = b.manifest; // the manifest first, the files not yet
    _forgetIndex();
    const during = await getCorpus(platform, noStatic);
    expect(during.id).not.toBe(b.manifest.id); // never B's id over A's index
    expect(during.products).toBe(false);
    for (const [name, body] of b.files) objects[productPath(b.manifest.id, name)] = JSON.parse(body);
    _forgetIndex();
    const after = await getCorpus(platform, noStatic);
    expect(after).toEqual({ id: b.manifest.id, buckets: 32, products: true });
    // an isolate still holding A with no manifest looks for one each minute: it finds B
    _forgetIndex();
    delete objects[manifestPath()];
    expect((await getCorpus(platform, noStatic)).products).toBe(false);
    objects[manifestPath()] = b.manifest;
    vi.useFakeTimers(); vi.setSystemTime(Date.now() + 61_000);
    try { expect((await getCorpus(platform, noStatic)).id).toBe(b.manifest.id); } finally { vi.useRealTimers(); }
  });
  it('round fifty-four: a bucket asked for under another count is a 409, and a shard that finds nothing exactly is tried over the whole', async () => {
    const idx = index(60);
    const { manifest, store } = bucketFor(idx);
    const platform = platformWith(store);
    const nine = await call(entriesGET as never, `/api/entries?b=00&n=64&c=${manifest.id}`, platform);
    expect(nine.status).toBe(409);
    expect(await nine.json()).toMatchObject({ buckets: 32, id: manifest.id });
    expect(nine.headers.get('cache-control')).toBe('no-store');
    expect((await call(sheetsGET as never, `/api/sheets?b=00&n=64&c=${manifest.id}`, platform)).status).toBe(409);
    expect((await call(entriesGET as never, `/api/entries?b=00&n=32&c=${manifest.id}`, platform)).status).toBe(200);
    // "hile" for Chile: shard h holds no exact hit, and the whole index has thirty
    const r = await call(searchGET as never, `/api/search?q=hile&c=${manifest.id}`, platform);
    const hits = (await r.json()) as IndexEntry[];
    expect(hits.length).toBe(idx.filter((e) => e.origin?.[0] === 'Chile North').length);
    // and a query with no words at all is nothing, with nothing prepared
    expect(await (await call(searchGET as never, `/api/search?q=%E6%A4%8D%E7%89%A9&c=${manifest.id}`, platform)).json()).toEqual([]);
  });

  it('round fifty-five: a missing product is asked for again a minute after the miss, however busy, and a read that threw is not remembered', async () => {
    const idx = index(40);
    const { manifest, store } = bucketFor(idx, { drop: ['search/a.json'] });
    let gets = 0, fail = false;
    const objects = new Map<string, unknown>();
    const counting = { get: async (k: string) => { if (k.endsWith('search/a.json')) { gets++; if (fail) throw new Error('R2 did not answer'); const v = objects.get(k); return v ? { json: async () => v, text: async () => JSON.stringify(v), etag: '"x"' } : null; } return store.get(k); }, head: store.head };
    const platform = platformWith(counting as never);
    vi.useFakeTimers(); vi.setSystemTime(1_800_000_000_000);
    try {
      expect(await product(platform, noStatic, 'search/a.json')).toBeNull();
      const built = buildProducts(idx, JSON.stringify(idx, null, 1), () => new Map());
      objects.set(productPath(manifest.id, 'search/a.json'), JSON.parse(built.files.get('search/a.json')!));
      for (let t = 0; t < 3; t++) { vi.setSystemTime(1_800_000_000_000 + 15_000 * (t + 1)); const v = await product(platform, noStatic, "search/a.json"); expect({ t, gets, v: v === null }).toEqual({ t, gets: 1, v: true }); }
      expect(gets).toBe(1); // busy, and still the one read
      vi.setSystemTime(1_800_000_000_000 + 61_000);
      expect(await product(platform, noStatic, 'search/a.json')).not.toBeNull(); // the minute is from the miss
      expect(gets).toBe(2);
    } finally { vi.useRealTimers(); }
    // a read that throws is asked again at the next request
    _forgetIndex();
    fail = true;
    const before = gets;
    expect(await product(platform, noStatic, 'search/a.json')).toBeNull();
    fail = false;
    await product(platform, noStatic, 'search/a.json');
    expect(gets).toBe(before + 2);
  });
  it('round fifty-five: a query with no word, or a short first word the shards lack, prepares nothing; a longer one is tried over the whole under its own rate', async () => {
    const idx = index(60);
    const { manifest, store } = bucketFor(idx);
    const platform = platformWith(store);
    const dossiers = await import('$lib/server/dossiers');
    const spy = vi.spyOn(dossiers, 'searchWhole');
    for (const q of ['%E6%A4%8D%E7%89%A9', 'zzz', 'ab']) expect(await (await call(searchGET as never, `/api/search?q=${q}&c=${manifest.id}`, platform)).json()).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
