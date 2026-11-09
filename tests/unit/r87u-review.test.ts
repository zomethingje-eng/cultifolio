/**
 * Round eighty-seven, the fix of the independent review of stage 1 (the user-facing pages): each finding at its cause.
 *
 * B1. The front page's Browse table says the counts the browse pages list: /region's level-3 regions, /family's
 *     families, /genus's genera with a page, and no "on a map" (/region has none). On the base it said "on a map, N
 *     regions" with N the old catalogue's origin groups (3 on the fixture, where /region lists 14).
 * B2. A corpus with no browse table: the front page links no browse page (each is a 503) and gives the catalogue's own
 *     groupings; /api/suggest answers no rows, not a 503; a not-found answer says whether the browse pages are there.
 * S1. "Not counted" is never 0: with no species' cultivated observations counted the filter is not applied, the order
 *     "most grown" is not offered and the figures are null; partly counted, how many are not counted is said.
 * S4. Every browse page's HTML is `private, max-age=60`. S5. Every browse page's render is counted; the CSV under the
 *     index's allowance; an address not in its one spelling moves to it.
 * M1. The kind of a name filed under another page is read only for the `olderOf` it was recorded for.
 * M2. The lead's photograph is never shown without its credit's day. M5. /api/suggest is kept only under its corpus
 *     and build. M6. app.html's colours and shell are the look's.
 *
 * Each `it` fails on the base (r87s1 head, 381aea9) where it names a change of behaviour.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { corpusNow, _forgetIndex, type IndexEntry } from '$lib/server/dossiers';
import { buildProducts } from '$dossier/products';
import { manifestPath, productPath, type Manifest } from '$dossier/manifest';
import { md5 } from '$dossier/md5';
import { slugify } from '$core/names';
import { resetRateLimits, RATE } from '$lib/server/sync';
import { browseTableOf, BROWSE_COUNTS_FILE } from '$lib/browse/table';
import { prepared, runQuery, allRows, titleOf, parseQuery, EMPTY } from '$lib/browse/engine';
import { browseView, browseCounts, hasBrowse, canonicalSearch, figuresOf } from '$lib/browse/load.server';
import { entranceCountsOf, entranceCountsIn } from '$lib/browse/counts';
import { recordedKind, withKindOf } from '$lib/ui/ref/older-kind';
import { mySpeciesOf } from '$lib/db/species-list';
import { leadOf, leadFrom } from '$lib/ui/ref/lead-figure';
import type { Accession } from '$lib/db/types';
import { load as frontLoad } from '../../src/routes/+page.server';
import { load as browseLoad } from '../../src/routes/browse/+page.server';
import { load as regionsLoad } from '../../src/routes/region/+page.server';
import { load as regionLoad } from '../../src/routes/region/[slug]/+page.server';
import { load as generaLoad } from '../../src/routes/genus/+page.server';
import { load as genusLoad } from '../../src/routes/genus/[slug]/+page.server';
import { load as familiesLoad } from '../../src/routes/family/+page.server';
import { load as familyLoad } from '../../src/routes/family/[slug]/+page.server';
import { GET as csvGet } from '../../src/routes/browse/csv/+server';
import { GET as suggestGet } from '../../src/routes/api/suggest/+server';
import { handleError } from '../../src/hooks.server';

const thumb = (k: number) => `https://inaturalist-open-data.s3.amazonaws.com/photos/${k}/medium.jpg`;
const e = (k: number, name: string, origin: string[], o: Partial<IndexEntry> = {}): IndexEntry => ({ key: `k${k}`, gbif: 9000 + k, slug: slugify(name), name, family: 'Apocynaceae', origin, photos: 4, open: 3, climate: 'ok', thumb: thumb(k), credit: 'CC BY, someone', changed: 20765, ...o });
const IDX: IndexEntry[] = [
  e(1, 'Hoodia alstonii', ['Cape Provinces', 'Namibia'], { grown: 5 }),
  e(2, 'Hoodia gordonii', ['Cape Provinces', 'Namibia', 'Botswana'], { grown: 37 }),
  e(3, 'Hoodia juttae', ['Namibia'], { climate: 'none' }),
  e(4, 'Lithops lesliei', ['Cape Provinces', 'Northern Provinces'], { family: 'Aizoaceae', grown: 2000 }),
  e(5, 'Lithops aucampiae', ['Cape Provinces'], { family: 'Aizoaceae', grown: 0 }),
  e(6, 'Welwitschia mirabilis', ['Namibia', 'Angola'], { family: 'Welwitschiaceae' }),
  e(7, 'Agave calodonta', ['Mexico'], { family: 'Asparagaceae' })
];
const UNCOUNTED = IDX.map(({ grown: _g, ...x }) => x as IndexEntry);

function bucket(m: Map<string, string>) {
  const obj = (k: string) => ({ text: async () => m.get(k)!, json: async () => JSON.parse(m.get(k)!), etag: `"${k}:${m.get(k)!.length}"`, body: m.get(k)! });
  return { m, get: async (k: string) => (m.has(k) ? obj(k) : null), head: async (k: string) => (m.has(k) ? { etag: `"${k}:${m.get(k)!.length}"` } : null) };
}
const kv = () => { const m = new Map<string, string>(); return { get: async (k: string) => m.get(k) ?? null, put: async (k: string, v: string) => void m.set(k, v) }; };
/** The corpus as the build writes it, read through its files; with the browse table or without, and the counts file as given. */
function corpus(idx: IndexEntry[], table: 'with' | 'without' = 'with', counts?: Record<string, unknown>) {
  const p = buildProducts(idx, JSON.stringify(idx), () => new Map(), '2026-11-08T00:00:00Z');
  const m = new Map<string, string>([...[...p.files].map(([n, body]) => [productPath(p.manifest.files[n]), body] as [string, string]), ...[...p.stored].map(([h, b]) => [productPath(h), b] as [string, string])]);
  const manifest: Manifest = { ...p.manifest, files: { ...p.manifest.files } };
  delete manifest.files['browse.json'];
  delete manifest.files[BROWSE_COUNTS_FILE];
  if (table === 'with') {
    const body = JSON.stringify(browseTableOf(idx));
    manifest.files['browse.json'] = md5(body);
    m.set(productPath(md5(body)), body);
    const c = JSON.stringify(counts ?? { grown: null });
    manifest.files[BROWSE_COUNTS_FILE] = md5(c);
    m.set(productPath(md5(c)), c);
  }
  m.set(manifestPath(), JSON.stringify(manifest));
  return { env: { STORE: bucket(m), QUEUE: kv() } } as unknown as App.Platform;
}
/** The fixture's way: an index in the bucket and no manifest, the browse table made from it on the Worker. */
const indexOnly = (idx: IndexEntry[]) => ({ env: { STORE: { get: async () => ({ text: async () => JSON.stringify(idx), json: async () => idx, etag: '"i"' }), head: async () => ({ etag: '"i"' }) }, QUEUE: kv() } }) as unknown as App.Platform;
const noStatic = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;
let headers: Record<string, string> = {};
const ev = (platform: App.Platform, path: string, params: Record<string, string> = {}, ip = '192.0.2.9') => ({ params, platform, fetch: noStatic, url: new URL(`https://cultifolio.com${path}`), setHeaders: (h: Record<string, string>) => Object.assign(headers, h), getClientAddress: () => ip, locals: {}, cookies: { get: () => undefined }, request: new Request(`https://cultifolio.com${path}`) }) as never;
const settle = async <T,>(p: Promise<T> | T) => { try { return { ok: await p }; } catch (x) { const y = x as { status?: number; body?: { message?: string; browse?: boolean }; location?: string }; return { status: y.status, message: y.body?.message, browse: y.body?.browse, location: y.location }; } };
const ok = async (p: unknown) => (await settle(p as Promise<unknown>)).ok as Record<string, any>;

beforeEach(() => { _forgetIndex(); resetRateLimits(); headers = {}; vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());

describe('r87u B1: the front page counts what the browse pages list', () => {
  it('regions, families and genera are /region\'s, /family\'s and /genus\'s own numbers', async () => {
    const platform = indexOnly(IDX);
    const front = await ok(frontLoad(ev(platform, '/')));
    const regions = await ok(regionsLoad(ev(platform, '/region')));
    const families = await ok(familiesLoad(ev(platform, '/family')));
    const genera = await ok(generaLoad(ev(platform, '/genus')));
    expect(front.groups).toMatchObject({ regions: regions.level3, families: families.families.length, genera: genera.withPage });
    // Cape Provinces, Namibia, Botswana, Northern Provinces, Angola; Mexico is a wider origin, in no level-3 count.
    expect(front.groups.regions).toBe(5);
    expect(front.groups.genera).toBe(2); // Hoodia and Lithops; Welwitschia and Agave have one species each
    expect(front.catalogueGroups).toBeNull();
  });
  // The row's words, and that no row says "on a map", in the browser: tests/e2e/r87u-review.spec.ts, 5.
  it('under a manifest, read from the counts file, never the table; a file of before gives none of the three', async () => {
    const t = prepared(browseTableOf(IDX));
    const counts = { grown: 4, ...entranceCountsOf(t) };
    let platform = corpus(IDX, 'with', counts);
    expect(await browseCounts(await corpusNow(platform, noStatic), platform, noStatic)).toEqual({ grown: 4, regions: 5, families: 4, genera: 2, grownNotCounted: 3 });
    _forgetIndex();
    platform = corpus(IDX, 'with', { grown: 4 });
    const front = await ok(frontLoad(ev(platform, '/')));
    expect(front.groups).toEqual({ regions: null, families: null, genera: null, grown: 4, grownNotCounted: null, grownUncounted: false });
    expect(entranceCountsIn({ regions: -1, families: 2.5, genera: '3', grownNotCounted: 0 })).toEqual({ grownNotCounted: 0 });
  });
});

describe('r87u B2: a corpus with no browse table', () => {
  it('the front page links no browse page and gives the catalogue\'s groupings', async () => {
    const platform = corpus(IDX, 'without');
    const c = await corpusNow(platform, noStatic);
    expect(hasBrowse(c)).toBe(false);
    const front = await ok(frontLoad(ev(platform, '/')));
    expect(front.groups).toBeNull();
    expect(front.catalogueGroups).toMatchObject({ families: 4, genera: 4 });
    expect(typeof front.catalogueGroups.origins).toBe('number');
  });
  it('/api/suggest answers no rows, said as unbuilt, not a 503', async () => {
    const platform = corpus(IDX, 'without');
    const r = await suggestGet(ev(platform, '/api/suggest?q=hoodia'));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ rows: [], unbuilt: true });
  });
  it('a not-found answer says whether the browse pages are there', async () => {
    const without = corpus(IDX, 'without');
    const event = (platform: App.Platform) => ({ platform, fetch: noStatic, locals: {}, url: new URL('https://cultifolio.com/nowhere') }) as never;
    expect(await handleError({ error: new Error('Not Found'), event: event(without), status: 404, message: 'Not Found' })).toEqual({ message: 'Not Found', browse: false });
    _forgetIndex();
    expect(await handleError({ error: new Error('Not Found'), event: event(corpus(IDX)), status: 404, message: 'Not Found' })).toEqual({ message: 'Not Found', browse: true });
    expect(await handleError({ error: new Error('boom'), event: event(without), status: 500, message: 'Internal Error' })).toEqual({ message: 'Internal Error' });
    _forgetIndex();
    expect(await settle(regionLoad(ev(without, '/region/atlantis', { slug: 'atlantis' })))).toMatchObject({ status: 404, browse: false });
    // The page's line follows the mark, both ways, in the browser: tests/e2e/r87u-review.spec.ts, 10.
  });
});

describe('r87u S1: not counted is never shown as 0', () => {
  it('with nothing counted: the filter not applied and said, no number, no "most grown"', async () => {
    const p = prepared(browseTableOf(UNCOUNTED));
    const a = runQuery(p, { ...EMPTY, grown: true });
    expect(a.total).toBe(IDX.length); // not "0 species"
    expect(a.query.grown).toBe(false);
    expect(a.grown).toEqual({ state: 'none', notCounted: IDX.length, asked: true });
    expect(allRows(p, { ...EMPTY, grown: true })).toHaveLength(IDX.length);
    expect(titleOf(p, { ...EMPTY, grown: true })).toBe('Every species in the reference');
    const platform = indexOnly(UNCOUNTED);
    const c = await corpusNow(platform, noStatic);
    const { view, answer } = await browseView(c, platform, noStatic, new URL('https://cultifolio.com/browse?grown=1'));
    const flag = view.rail.flags.find((x) => x.key === 'grown')!;
    expect(flag).toMatchObject({ disabled: true, uncounted: true, on: false });
    expect(flag.n).toBeUndefined();
    expect(view.sorts.grown).toBeUndefined();
    expect(view.grown).toEqual({ state: 'none', notCounted: IDX.length, asked: true });
    expect(figuresOf(answer)).toMatchObject({ grown: null, grownNotCounted: 0 });
    const g = await ok(genusLoad(ev(platform, '/genus/hoodia', { slug: 'hoodia' })));
    expect(g.figures.grown).toBeNull();
    // The pages' words for it in the browser: tests/e2e/r87u-review.spec.ts, 6.
  });
  it('partly counted: how many are not counted, and never among the grown', async () => {
    const p = prepared(browseTableOf(IDX));
    const a = runQuery(p, { ...EMPTY, grown: true });
    expect(a.total).toBe(3); // alstonii 5, gordonii 37, lesliei 2000; aucampiae's 0 is counted as none grown
    expect(a.grown).toEqual({ state: 'some', notCounted: 3, asked: true }); // juttae, Welwitschia, Agave
    const hoodia = runQuery(p, { ...EMPTY, g: 'hoodia' });
    expect(hoodia.grown.notCounted).toBe(1);
    const platform = indexOnly(IDX);
    const c = await corpusNow(platform, noStatic);
    const { view } = await browseView(c, platform, noStatic, new URL('https://cultifolio.com/browse'));
    expect(view.rail.flags.find((x) => x.key === 'grown')).toMatchObject({ n: 3, notCounted: 3 });
    expect(view.sorts.grown).toBe('/browse');
    const f = await ok(familyLoad(ev(platform, '/family/apocynaceae', { slug: 'apocynaceae' })));
    expect(f.figures).toMatchObject({ grown: 2, grownNotCounted: 1 });
  });
});

describe('r87u S4 and S5: the browse pages\' caching, counting and one spelling', () => {
  const pages: Array<[string, (e: never) => unknown, Record<string, string>]> = [
    ['/browse', browseLoad, {}], ['/region', regionsLoad, {}], ['/region/namibia', regionLoad, { slug: 'namibia' }], ['/genus', generaLoad, {}],
    ['/genus/hoodia', genusLoad, { slug: 'hoodia' }], ['/family', familiesLoad, {}], ['/family/apocynaceae', familyLoad, { slug: 'apocynaceae' }]
  ];
  it('every browse page\'s HTML is kept a minute by the browser alone', async () => {
    const platform = indexOnly(IDX);
    for (const [path, load, params] of pages) {
      headers = {};
      await ok(load(ev(platform, path, params)));
      expect(headers['cache-control'], path).toBe('private, max-age=60');
    }
  });
  it('every browse page\'s render is counted under `render`', async () => {
    for (const [path, load, params] of pages) {
      resetRateLimits();
      const platform = indexOnly(IDX); // its own counters' store, so one page's count is not the next one's
      for (let i = 0; i < RATE.render.limit; i++) await load(ev(platform, path, params, '192.0.2.77'));
      expect(await settle(load(ev(platform, path, params, '192.0.2.77'))), path).toMatchObject({ status: 429 });
    }
  });
  it('the CSV of results is counted with the whole index; its file of sources as a page', async () => {
    const platform = indexOnly(IDX);
    for (let i = 0; i < RATE.index.limit; i++) expect((await csvGet(ev(platform, '/browse/csv?g=hoodia', {}, '192.0.2.50'))).status).toBe(200);
    expect((await csvGet(ev(platform, '/browse/csv?g=hoodia', {}, '192.0.2.50'))).status).toBe(429);
    expect((await csvGet(ev(platform, '/browse/csv?part=sources', {}, '192.0.2.50'))).status).toBe(200);
  });
  it('an address not in its one spelling moves to it', async () => {
    const platform = indexOnly(IDX);
    expect(await settle(browseLoad(ev(platform, '/browse?utm_source=x')))).toMatchObject({ status: 301, location: '/browse' });
    expect(await settle(browseLoad(ev(platform, '/browse?grown=1&r=nam')))).toMatchObject({ status: 301, location: '/browse?r=NAM&grown=1' });
    expect(await settle(browseLoad(ev(platform, '/browse?r=NAM&grown=1')))).toHaveProperty('ok');
    // The same address spelt with its comma encoded, as the client's router asks for it, is not moved (a loop otherwise).
    expect(await settle(browseLoad(ev(platform, '/browse?r=CPV%2CNAM')))).toHaveProperty('ok');
    expect(await settle(browseLoad(ev(platform, '/browse?r=CPV,NAM')))).toHaveProperty('ok');
    expect(await settle(regionsLoad(ev(platform, '/region?x=1')))).toMatchObject({ status: 301, location: '/region' });
    expect(await settle(familiesLoad(ev(platform, '/family?x=1')))).toMatchObject({ status: 301, location: '/family' });
    expect(await settle(generaLoad(ev(platform, '/genus?from=h&x=1')))).toMatchObject({ status: 301, location: '/genus?from=H' });
    expect(await settle(regionLoad(ev(platform, '/region/nam?view=list&t=1', { slug: 'nam' })))).toMatchObject({ status: 301, location: '/region/namibia?view=list' });
    expect(await settle(genusLoad(ev(platform, '/genus/hoodia?r=NAM', { slug: 'hoodia' })))).toMatchObject({ status: 301, location: '/genus/hoodia' });
    // Every link a view draws is in its one spelling already: following one never moves.
    const c = await corpusNow(platform, noStatic);
    const { view } = await browseView(c, platform, noStatic, new URL('https://cultifolio.com/browse?r=NAM'));
    for (const l of [...view.rail.options, ...view.rail.families, ...view.rail.flags, ...view.pills]) {
      const u = new URL(`https://cultifolio.com${l.href}`);
      expect(canonicalSearch(u, 'browse'), l.href).toBe(u.search);
    }
    expect(parseQuery(new URLSearchParams('grown=1')).grown).toBe(true);
  });
});

describe('r87u M5: /api/suggest is kept only under its corpus and build', () => {
  it('asked under the corpus served, kept five minutes; under another or none, not kept', async () => {
    const platform = corpus(IDX);
    const c = await corpusNow(platform, noStatic);
    const at = async (q: string) => (await suggestGet(ev(platform, `/api/suggest?q=hoodia${q}`))).headers.get('cache-control');
    expect(await at(`&c=${c.corpus}`)).toBe('public, max-age=300');
    expect(await at('&c=another')).toBe('no-store');
    expect(await at('')).toBe('no-store');
    expect(await at(`&c=${c.corpus}&v=an-old-build`)).toBe('no-store');
    // The box asks under both, in the browser: tests/e2e/r87u-review.spec.ts, 9.
  });
});

describe('r87u M1: the kind is read only for the name it was recorded for', () => {
  const plant = (o: Partial<Accession>) => ({ id: 'r1', acc: '2026-0001', taxonName: 'Ceropegia alstonii', status: 'growing', ...o }) as Accession;
  it('recorded with its olderOf it says; moved by an older version, or with no name beside it, it does not', () => {
    expect(recordedKind(plant({ olderOf: 'Hoodia alstonii', olderKind: 'gbif', olderKindOf: 'Hoodia alstonii' }))).toBe('gbif');
    expect(recordedKind(plant({ olderOf: 'Hoodia gordonii', olderKind: 'gbif', olderKindOf: 'Hoodia alstonii' }))).toBeNull(); // round 86's rename moved olderOf
    expect(recordedKind(plant({ olderOf: 'Hoodia alstonii', olderKind: 'gbif' }))).toBeNull(); // stage 1's record: no name beside it
    expect(recordedKind(plant({ olderOf: null, olderKind: 'gbif', olderKindOf: 'Hoodia alstonii' }))).toBeNull();
    expect(recordedKind(plant({ olderOf: 'Hoodia alstonii', olderKind: 'merged', olderKindOf: 'Hoodia alstonii' }))).toBeNull();
    const moved = mySpeciesOf([plant({ olderOf: 'Hoodia gordonii', olderKind: 'gbif', olderKindOf: 'Hoodia alstonii' })], []).get('ceropegia-alstonii')!;
    expect(moved.olderOf).toBe('Hoodia gordonii');
    expect(moved).not.toHaveProperty('olderKind');
  });
  it('every plant filed is filed with the pair', () => {
    expect(withKindOf({ olderOf: 'Hoodia alstonii', olderKind: 'gbif' })).toEqual({ olderOf: 'Hoodia alstonii', olderKind: 'gbif', olderKindOf: 'Hoodia alstonii' });
    expect(withKindOf({ olderKind: 'gbif' } as { olderOf?: string; olderKind?: string })).toEqual({});
    expect(withKindOf({ olderOf: 'Hoodia alstonii' })).toEqual({ olderOf: 'Hoodia alstonii' });
    // The add form files the pair through `addAccessions`, in the browser: tests/e2e/r87p-pages.spec.ts, 8.
  });
});

describe('r87u M2: the lead\'s photograph is never shown without its credit\'s day', () => {
  const fixture = JSON.parse(readFileSync('fixtures/dossiers/s/v3/k2735933.json', 'utf8'));
  it('a record whose photograph has no day read is passed over for the next', async () => {
    expect(leadOf(fixture)?.photo?.read).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const undated = structuredClone(fixture);
    for (const p of undated.photos) delete p.read;
    for (const k of Object.keys(undated.upstream)) if (/photo|inat|commons/i.test(k)) { delete undated.upstream[k].asOf; delete undated.upstream[k].at; }
    expect(leadOf(undated)).toBeNull();
    const second = { ...structuredClone(fixture), slug: 'second' };
    expect((await leadFrom([{ slug: 'a' }, { slug: 'b' }], async (s) => (s === 'a' ? undated : second)))?.slug).toBe('second');
  });
});

describe('r87u M6: the head\'s colours and the shell are the look\'s', () => {
  const html = readFileSync('src/app.html', 'utf8');
  const css = readFileSync('src/lib/ui/theme.css', 'utf8');
  it('theme-color is the page\'s own ground, light and dark', () => {
    const bg = (block: string) => /--bg:\s*(#[0-9a-f]{6})/i.exec(block)![1];
    expect(html).toContain(`<meta name="theme-color" content="${bg(css.slice(css.indexOf(':root {')))}" media="(prefers-color-scheme: light)" />`);
    expect(html).toContain(`<meta name="theme-color" content="${bg(css.slice(css.indexOf(":root[data-theme='dark'] {")))}" media="(prefers-color-scheme: dark)" />`);
    expect(html).toContain('content="#ffffff" media="(prefers-color-scheme: light)"');
    expect(html).toContain('content="#141615" media="(prefers-color-scheme: dark)"');
  });
  it('the shell is the top bar: the word on the ground over a rule in the ink, no old mark or greys', () => {
    const shell = html.slice(html.indexOf('<div id="shell"'));
    expect(shell).not.toMatch(/✳|#f3f5f4|#dde3e0|#5b6662|min-height: 44px/);
    expect(shell).toContain('border-bottom: 1px solid var(--ink, #1b1d1c)');
    expect(html).toMatch(/#shell \.bar\{min-height:52px\}@media \(min-width:701px\)\{#shell \.bar\{min-height:56px\}\}/);
    expect(shell).toContain('Opening your plants…'); // its purpose kept: what a page drawn on the device shows first
  });
});
