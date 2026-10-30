/**
 * Round eighty-four (N): the search's order for the names growers type (review-s S2, S10, S11, S12; outside review A8's
 * "houseleek" and "hens and chicks"). Read over the live index's own rows for those names (29 October 2026,
 * `fixtures/r84n-search-live.json`: every species of the index holding one of the words, with its names and photograph
 * count, as `/api/index` gave them).
 *
 * 1. A species whose own headline holds the word typed is the one its exact name means (`headlineHolds`): "snowdrop" is
 *    Galanthus nivalis ("Common snowdrop", 24th before), "saffron" Crocus sativus within the first two (34th), "pepper"
 *    Capsicum annuum and Piper nigrum first (125th), "stonecrop" Sedum acre (116th), "squill" Scilla siberica (54th).
 *    A nickname of a species whose headline is about something else stays set back ("Rose" on a Cotoneaster).
 * 2. A headline that another species of its genus holding the name has more photographs than is no evidence: Agave
 *    americana leads "century plant" (6th), Sempervivum tectorum "houseleek" (2nd), and Piper ponapense, a page of no
 *    photograph called "Pepper", no longer leads "pepper". Ficus carica still leads "fig".
 * 3. A plural typed in a phrase reads a name exactly ("hens and chicks" is "Hen-and-chicks"): a Sempervivum leads it, where
 *    Echeveria lilacina's "Mexican hens-and-chicks" did.
 * 4. A genus being typed or misspelt that several genera answer lists the nearest genus first ("lithop" Lithops before
 *    Lithophragma; "mamillaria" Mammillaria's species by the genus word's order).
 * 5. A query that finds nothing is read again from fewer letters of its last word (`shorterReadings`): "lithops lesleyi"
 *    answers Lithops lesliei, "sansiveria" the Dracaenas once called Sansevieria, through the search route, which says
 *    which letters it read.
 * 6. A typing error names no region where species answered as typed ("aster" is no "Easter Is."); a pasted sentence is
 *    not retried on its small words ("this is").
 *
 * FAILS on r84base: G. nivalis 24th, C. sativus 34th, Piper ponapense first, A. americana 6th, S. marmoreum first for
 * "houseleek", E. lilacina first for "hens and chicks", Lithophragma first for "lithop", `shorterReadings` does not exist and
 * "lithops lesleyi" answers nothing, "aster" names Easter Is., and "this is …" is retried as "this is". Checked by running
 * this file on a checkout of r84base.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { prepare, search, shorterReadings, relaxedQuery, type Searchable } from '$core/search';
import { regionsTyped } from '$core/regions';
import { _forgetIndex, type IndexEntry } from '$lib/server/dossiers';
import { buildProducts } from '$dossier/products';
import { manifestPath, productPath } from '$dossier/manifest';
import { resetRateLimits } from '$lib/server/sync';
import { gbifPage } from '$core/page-id';
import { GET as searchGet } from '../../src/routes/api/search/+server';

const LIVE = JSON.parse(readFileSync('tests/unit/fixtures/r84n-search-live.json', 'utf8')) as Searchable[];
const P = prepare(LIVE);
const order = (q: string) => search(P, q).map((h) => h.name);
const at = (q: string, name: string) => order(q).indexOf(name) + 1;

describe('the species a word names, among those that hold it (S2)', () => {
  it('snowdrop, saffron, pepper, stonecrop, squill', () => {
    expect(order('snowdrop')[0]).toBe('Galanthus nivalis');
    expect(order('Snowdrop')[0]).toBe('Galanthus nivalis');
    expect(at('saffron', 'Crocus sativus')).toBeLessThanOrEqual(2);
    expect(order('pepper').slice(0, 3)).toEqual(expect.arrayContaining(['Capsicum annuum', 'Piper nigrum']));
    expect(at('stonecrop', 'Sedum acre')).toBe(1);
    expect(at('squill', 'Scilla siberica')).toBe(1);
  });
  it('the headlines that were first stay first (guards)', () => {
    expect(order('peppermint')[0]).toBe('Mentha × piperita');
    expect(order('fig')[0]).toBe('Ficus carica');
    expect(order('daffodil')[0]).toBe('Narcissus pseudonarcissus');
    expect(order('bleeding heart')[0]).toBe('Lamprocapnos spectabilis');
    expect(order('ginger')[0]).toBe('Zingiber officinale');
    expect(order('devils backbone')[0]).toBe('Kalanchoe daigremontiana');
    expect(order('prickly pear')[0]).toBe('Opuntia ficus-indica');
  });
});

describe('a headline its genus shares (D9 at query time, S11)', () => {
  it('century plant, houseleek, pepper', () => {
    expect(order('century plant')[0]).toBe('Agave americana');
    expect(order('houseleek')[0]).toBe('Sempervivum tectorum');
    expect(order('pepper')[0]).not.toBe('Piper ponapense');
    expect(at('pepper', 'Piper ponapense')).toBeGreaterThan(at('pepper', 'Piper nigrum'));
  });
  it('a plural typed in a phrase is a name read exactly (A8)', () => {
    const h = order('hens and chicks');
    expect(h[0]).toMatch(/^Sempervivum /);
    expect(h.indexOf('Sempervivum tectorum')).toBeLessThan(h.indexOf('Echeveria lilacina'));
  });
});

describe('a genus typed in part or misspelt (S10)', () => {
  let n = 0;
  const sp = (name: string, o: Partial<Searchable> = {}): Searchable => ({ name, photos: (n = (n * 7 + 3) % 50), ...o });
  const G: Searchable[] = [
    ...['albicoma', 'bombycina', 'elongata', 'heyderi', 'prolifera', 'zeilmanniana'].map((e) => sp(`Mammillaria ${e}`, e === 'elongata' ? { common: 'Ladyfinger cactus', commons: ['Gold lace cactus'] } : e === 'prolifera' ? { common: 'Texas nipple cactus' } : {})),
    ...['acicularis', 'tenuifolia', 'variabilis'].map((e) => sp(`Maxillaria ${e}`)),
    ...['aucampiae', 'karasmontana', 'lesliei'].map((e) => sp(`Lithops ${e}`, e === 'lesliei' ? { common: "Leslie's living stone" } : {})),
    ...['glabrum', 'parviflorum'].map((e) => sp(`Lithophragma ${e}`))
  ];
  const PG = prepare(G);
  it('"lithop" lists Lithops before Lithophragma; "lith" too', () => {
    expect(search(PG, 'lithop').map((h) => h.name.split(' ')[0]).slice(0, 3)).toEqual(['Lithops', 'Lithops', 'Lithops']);
    expect(search(PG, 'lith')[0].name).toMatch(/^Lithops /);
  });
  it('"mamillaria", one letter from Mammillaria and from Maxillaria: Mammillaria first, its species by the genus word\'s order', () => {
    const h = search(PG, 'mamillaria').map((x) => x.name);
    expect(h.slice(0, 2)).toEqual(['Mammillaria elongata', 'Mammillaria prolifera']);
    expect(h.findIndex((x) => x.startsWith('Maxillaria'))).toBeGreaterThan(h.filter((x) => x.startsWith('Mammillaria')).length - 1);
  });
  it('one to three letters keep the alphabet, genus by genus (guard)', () => {
    expect(search(PG, 'ma')[0].name).toBe('Mammillaria albicoma');
  });
  it('fewer letters of the last word, at most four readings, never of a sentence or a common name', () => {
    expect(shorterReadings('lithops lesleyi')).toEqual(['lithops lesley', 'lithops lesle', 'lithops lesl']);
    expect(shorterReadings('sansiveria')).toEqual(['sansiveri', 'sansiver', 'sansive', 'sans']);
    expect(shorterReadings('aloe')).toEqual([]);
    expect(shorterReadings('this is the plant my grandmother grew')).toEqual([]);
    expect(shorterReadings('Copiapoa cinerea var')).toEqual([]);
  });
});

describe('odd readings (S12)', () => {
  it('a typing error names no region where species answered as typed', () => {
    const names = ['Easter Is.', 'Cape Provinces', 'Northern Provinces'];
    expect(regionsTyped('aster', names)).toEqual(['Easter Is.']); // as before, when nothing answered
    expect(regionsTyped('aster', names, false)).toEqual([]);
    expect(regionsTyped('provinces', names, false)).toEqual(['Cape Provinces', 'Northern Provinces']);
  });
  it('a pasted sentence is not retried on its small words', () => {
    expect(relaxedQuery('this is the plant my grandmother grew')).toBeNull();
    expect(relaxedQuery('Copiapoa cinerea var. columna-alba')).toBe('Copiapoa cinerea'); // guard
  });
});

describe('through the search route: fewer letters, said (S10)', () => {
  let k = 0;
  const e = (name: string, o: Partial<IndexEntry> = {}): IndexEntry => ({ key: gbifPage(9_400_000 + ++k), gbif: 9_400_000 + k, slug: name.toLowerCase().replace(/[^a-z]+/g, '-'), name, family: 'Aizoaceae', origin: ['Cape Provinces'], photos: 10, open: 3, climate: 'ok', ...o }) as IndexEntry;
  const IDX: IndexEntry[] = [
    e('Dracaena trifasciata', { family: 'Asparagaceae', common: 'Snake plant', syn: ['Sansevieria trifasciata'] }),
    e('Dracaena angolensis', { family: 'Asparagaceae', syn: ['Sansevieria cylindrica'] }),
    e('Lithops aucampiae'),
    e('Lithops karasmontana'),
    e('Lithops lesliei', { common: "Leslie's living stone" }),
    e('Lithophragma parviflorum', { family: 'Saxifragaceae' })
  ].sort((a, b) => a.name.localeCompare(b.name));
  let built: ReturnType<typeof buildProducts>;
  beforeAll(() => { built = buildProducts(IDX, JSON.stringify(IDX, null, 1), () => new Map(), '2026-10-30T00:00:00Z'); }, 240_000);
  function platform() {
    const m = new Map<string, string>();
    m.set(manifestPath(), JSON.stringify(built.manifest));
    for (const [nm, body] of built.files) m.set(productPath(built.manifest.files[nm]), body);
    for (const [h, body] of built.stored) m.set(productPath(h), body);
    const obj = (key: string) => ({ text: async () => m.get(key)!, json: async () => JSON.parse(m.get(key)!), etag: `"${key}"`, body: m.get(key)! });
    return { env: { STORE: { get: async (key: string) => (m.has(key) ? obj(key) : null), head: async (key: string) => (m.has(key) ? { etag: `"${key}"` } : null) } } } as unknown as App.Platform;
  }
  const noStatic = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;
  async function ask(q: string) {
    resetRateLimits();
    _forgetIndex();
    const url = new URL(`https://cultifolio.com/api/search?q=${encodeURIComponent(q)}&n=30&shape=2`);
    const r = await searchGet({ params: {}, platform: platform(), fetch: noStatic, url, request: new Request(url), getClientAddress: () => '192.0.2.84', setHeaders: () => {} } as never);
    return (await r.json()) as { hits: IndexEntry[]; relaxed?: { query: string }; regions?: unknown[] };
  }
  beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => vi.restoreAllMocks());

  it('"lithops lesleyi", two letters off, answers Lithops lesliei, read from "lithops lesle" (one letter from "leslie")', async () => {
    const a = await ask('lithops lesleyi');
    expect(a.hits[0]?.name).toBe('Lithops lesliei');
    expect(a.relaxed?.query).toBe('lithops lesle');
  });
  it('"sanseveria", one letter off, answers as before, with no fewer letters read (guard)', async () => {
    const a = await ask('sanseveria');
    expect(a.hits.map((h) => h.name)).toEqual(expect.arrayContaining(['Dracaena trifasciata', 'Dracaena angolensis']));
    expect(a.relaxed).toBeUndefined();
  });
  it('"sansiveria" answers the Dracaenas once called Sansevieria, read from "sans"', async () => {
    const a = await ask('sansiveria');
    expect(a.hits.map((h) => h.name)).toEqual(expect.arrayContaining(['Dracaena trifasciata', 'Dracaena angolensis']));
    expect(a.relaxed?.query).toBe('sans');
  });
  it('a page past the last answer is no query that found nothing (guard)', async () => {
    resetRateLimits();
    _forgetIndex();
    const url = new URL('https://cultifolio.com/api/search?q=lithops&n=30&at=30&shape=2');
    const r = await searchGet({ params: {}, platform: platform(), fetch: noStatic, url, request: new Request(url), getClientAddress: () => '192.0.2.84', setHeaders: () => {} } as never);
    const j = (await r.json()) as { hits: IndexEntry[]; relaxed?: unknown };
    expect(j.hits).toEqual([]);
    expect(j.relaxed).toBeUndefined();
  });
  it('a query that answers as written is not read from fewer letters (guard)', async () => {
    const a = await ask('lithops lesliei');
    expect(a.hits[0]?.name).toBe('Lithops lesliei');
    expect(a.relaxed).toBeUndefined();
  });
});

describe('an older genus typed whole (A8: "Notocactus", "Neoporteria")', () => {
  it('its species by the genus word\'s order, not the alphabet', () => {
    const P2 = prepare([
      { name: 'Parodia alacriportana', syn: ['Notocactus alacriportanus'], photos: 5 },
      { name: 'Parodia magnifica', common: 'Balloon cactus', commons: ['Ball cactus'], syn: ['Notocactus magnificus'], photos: 90 },
      { name: 'Parodia leninghausii', common: 'Golden ball cactus', syn: ['Notocactus leninghausii'], photos: 80 },
      { name: 'Parodia allosiphon', syn: ['Notocactus allosiphon'], photos: 12 }
    ]);
    expect(search(P2, 'notocactus').map((h) => h.name)).toEqual(['Parodia magnifica', 'Parodia leninghausii', 'Parodia allosiphon', 'Parodia alacriportana']);
    expect(search(P2, 'parodia')[0].name).toBe('Parodia magnifica'); // the genus itself, as before (guard)
  });
});
