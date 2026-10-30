/**
 * Round eighty-three (W): the species page's weight (independent review 1's 8, its page half; round eighty-one's C7).
 * `/species/sempervivum-tectorum` was 238 kB of HTML (47 kB gzipped). What it carried, measured: 73.7 kB was the regional
 * map's 1,052 records, a circle each; 15.5 kB the same records' places again in the data the page hydrates from; 25.7 kB
 * the page's own stylesheets, written into every page; 7.9 kB common names in other languages that nothing in the
 * browser reads; 2.7 kB the comments of app.html; 12 kB the scoping class `svelte-<hash>` on about 900 elements. The
 * coastline was already a file the maps reference.
 *
 * 1. Each record is a dot: a path of no length in one group (`$lib/map/still` `dots`), a third of the bytes.
 * 2. The page's own HTML carries the regional map drawn once, by the server, and its data only a mark in its place
 *    (`$lib/server/drawn`), and Wikidata's common names alone; a move inside the app's data is as it was.
 * 3. The page's own stylesheets stay in its HTML: as files they took 25.7 kB off it, and its first paint on a throttled
 *    phone came later (svelte.config.js). The species page's sheets are kept at install, so a species page read by a
 *    link from another opens offline (scripts/offline-files.mjs, `STYLE_ROUTE`).
 * 4. app.html sends no comment; the scoping class is `s<hash>`.
 *
 * FAILS on r83base: there is no `dots`, `$lib/server/drawn` or `STYLE_ROUTE`; the map is a circle a record; the page's HTML
 * data carries the points and every common name; app.html holds two comments; the scoping class is Svelte's.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { corpusNow, _forgetIndex, type IndexEntry } from '$lib/server/dossiers';
import { buildProducts } from '$dossier/products';
import { manifestPath, productPath } from '$dossier/manifest';
import { dossierPath } from '$dossier/schema';
import { slugify, genusOf } from '$core/names';
import { unitName } from '$core/regions';
import { resetRateLimits } from '$lib/server/sync';
import { gbifPage } from '$core/page-id';
import { regionSvg, dots, short } from '$lib/map/still';
import { describedBy } from '$lib/ui/ref/words';
import { drawOnce, placeDrawn, markOf, type Drawn } from '$lib/server/drawn';
import { offlineBuild, STYLE_ROUTE } from '../../scripts/offline-files.mjs';
import { load as speciesLoad } from '../../src/routes/species/[slug]/+page.server';

describe('r83w 1: each record a dot of one short path', () => {
  it('a number as short as SVG reads it', () => {
    expect([short(-0.0001, 2), short(20, 1), short(-0.5, 2), short(2.1, 3), short(-48.773, 2), short(0.1666, 3), short(-120, 2), short(0.05, 1)]).toEqual(['0', '20', '-.5', '2.1', '-48.77', '.167', '-120', '.1']);
  });
  it('every record a path of no length in the group that carries the class and the dot\'s width; none a circle', () => {
    const pts: Array<[number, number]> = [[-26.123, -70.6], [-26.1, 70.55], [0.004, -0.004], [-26.3, -70.6]];
    const g = dots(pts, 0.083);
    expect(g.startsWith('<g class="occ" stroke-width=".166">')).toBe(true);
    const d = [...g.matchAll(/<path d="M(-?[\d.]+) ?(-?[\d.]+)h0"\/>/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(d.length).toBe(pts.length);
    // To a quarter of the dot's radius or finer, as latitude and longitude drawn (y is minus the latitude).
    pts.forEach(([la, lo], i) => { expect(Math.abs(d[i][0] - lo)).toBeLessThanOrEqual(0.083 / 4); expect(Math.abs(d[i][1] + la)).toBeLessThanOrEqual(0.083 / 4); });
    expect(dots([], 0.1)).toBe('');
    const svg = regionSvg([{ s: -29.5, w: -71.5, n: -24.5, e: -68.5 }], pts, { lat: -26.2, lon: -70.6 }, 'Records');
    expect(svg).not.toContain('<circle class="occ"'); // base: a circle a record
    expect(svg).toContain('<g class="occ"');
    expect(svg).toContain('<circle class="pin"'); // the marker stays a circle
  });
  it('about 27 bytes a record, where a circle was 68: Sempervivum tectorum\'s 1,052 in under 30 kB, not 73.7 kB', () => {
    const pts: Array<[number, number]> = Array.from({ length: 1052 }, (_, i) => [42 + ((i * 7919) % 1000) / 100, -3 + ((i * 104729) % 1800) / 100]);
    const svg = regionSvg([], pts, { lat: 46, lon: 6 }, 'Records');
    const g = svg.slice(svg.indexOf('<g class="occ"'), svg.indexOf('</g>') + 4);
    expect(g.length / 1052).toBeLessThan(28);
    expect(svg.length).toBeLessThan(30_000);
  });
  it('the dots are drawn by the theme: stroked in the accent, each half transparent, round', () => {
    const css = readFileSync('src/lib/ui/theme.css', 'utf8');
    expect(css).toContain('.map .occ { fill: none; stroke: var(--accent); stroke-opacity: 0.5; stroke-linecap: round; }');
  });
});

describe('r83w 2: markup drawn once into the HTML', () => {
  it('the markup goes into its mark\'s place once, and a mark not met leaves the HTML as it is', () => {
    const locals: { drawn?: Drawn } = {};
    const mark = drawOnce(locals, 'region-map', '<svg>map</svg>')!;
    expect(mark).toBe(markOf('region-map'));
    expect(mark).toBe('<i data-drawn="region-map" hidden></i>');
    expect(placeDrawn(`<div><!---->${mark}<!----></div><p>${mark}</p>`, locals.drawn)).toBe(`<div><!----><svg>map</svg><!----></div><p>${mark}</p>`);
    expect(placeDrawn('<p>nothing</p>', new Map([[mark, 'x']]))).toBe('<p>nothing</p>');
    expect(placeDrawn('<p>x</p>', undefined)).toBe('<p>x</p>');
    expect(drawOnce(undefined, 'region-map', 'x')).toBeNull();
  });
  it('the hook puts the markup in as the HTML is sent', () => {
    const hook = readFileSync('src/hooks.server.ts', 'utf8');
    expect(hook).toContain('const res = await resolve(event, { transformPageChunk: ({ html }) => placeDrawn(html, event.locals?.drawn) });');
  });
});

// A corpus of two species in a bucket, as r77c-page-cpu's: the second has records and common names of three sources.
const e = (key: number, name: string, o: Partial<IndexEntry> = {}): IndexEntry => ({ key: gbifPage(key), gbif: key, slug: slugify(name), name, family: 'Cactaceae', origin: ['Chile North'], photos: 3, open: 52, climate: 'ok', ...o });
const IDX: IndexEntry[] = [e(11, 'Copiapoa cinerea'), e(12, 'Copiapoa humilis')];
const template = JSON.parse(readFileSync('fixtures/dossiers/s/v3/k2735933.json', 'utf8'));
const VERNACULAR = [
  { name: 'Almindelig kaktus', lang: 'dan', source: 'Catalogue of Life' },
  { name: 'Grey copiapoa', lang: 'eng', source: 'Wikidata' },
  { name: 'Copiapoa gris', lang: 'spa', source: 'GBIF Backbone' }
];
const dossierOf = (x: IndexEntry) => JSON.stringify({ ...template, key: x.key, slug: x.slug, name: { ...template.name, scientific: x.name, genus: genusOf(x.name), synonyms: [], vernacular: VERNACULAR } });
function store() {
  const p = buildProducts(IDX, JSON.stringify(IDX), () => new Map(), '2026-10-24T00:00:00Z', [], () => []);
  const files = new Map([...[...p.files].map(([n, body]) => [productPath(p.manifest.files[n]), body] as [string, string]), ...[...p.stored].map(([h, body]) => [productPath(h), body] as [string, string])]);
  const m = new Map<string, string>([[manifestPath(), JSON.stringify(p.manifest)], ...files, ...IDX.map((x) => [dossierPath(x.key), dossierOf(x)] as [string, string])]);
  const obj = (k: string) => ({ text: async () => m.get(k)!, json: async () => JSON.parse(m.get(k)!), etag: `"${k}"`, body: m.get(k)! });
  return { get: async (k: string) => (m.has(k) ? obj(k) : null), head: async (k: string) => (m.has(k) ? { etag: `"${k}"` } : null) };
}
const noStatic = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;
async function pageOf(isDataRequest: boolean | undefined) {
  const platform = { env: { STORE: store() } } as unknown as App.Platform;
  const c = await corpusNow(platform, noStatic);
  const url = new URL('https://cultifolio.com/species/copiapoa-cinerea');
  const locals: App.Locals = { corpus: c };
  const ev = { params: { slug: 'copiapoa-cinerea' }, platform, fetch: noStatic, setHeaders: () => {}, cookies: { get: () => undefined }, request: new Request(url), url, getClientAddress: () => '192.0.2.7', locals, ...(isDataRequest === undefined ? {} : { isDataRequest }) };
  const data = JSON.parse(JSON.stringify(await speciesLoad(ev as never)));
  return { data, locals };
}

describe('r83w 2: the species page\'s data, for its HTML and for a move inside the app', () => {
  beforeEach(() => { _forgetIndex(); resetRateLimits(); vi.spyOn(console, 'warn').mockImplementation(() => {}); });
  afterEach(() => vi.restoreAllMocks());

  it('its HTML: the map drawn for the HTML, a mark in the data, no points, and Wikidata\'s common names alone', async () => {
    const { data, locals } = await pageOf(false);
    expect(data).not.toHaveProperty('points'); // base: the 52 places
    expect(data.regionMark).toBe(markOf('region-map'));
    const drawn = locals.drawn?.get(data.regionMark);
    const pts = template.occurrences.open.map((p: number[]) => [p[0], p[1]]);
    // The very map the browser draws from a move's data: the same function of the same page.
    expect(drawn).toBe(describedBy(regionSvg(data.d.distribution.boxes, pts, data.d.centroid, 'Openly licensed records of Copiapoa cinerea', data.d.distribution.native.filter((r: { box?: unknown }) => r.box).map((r: { name: string; box: never }) => ({ name: unitName(r.name), box: r.box }))), 'records-caption')); // round eighty-four (B8): tied to its caption
    expect((drawn!.match(/<path d="M/g) ?? []).length).toBe(52);
    expect(data.d.name.vernacular).toEqual([VERNACULAR[1]]); // base: all three
  });
  it('a move inside the app (its data alone): the points and every common name, no mark, nothing drawn, as before', async () => {
    const { data, locals } = await pageOf(true);
    expect(data.points.length).toBe(52);
    expect(data).not.toHaveProperty('regionMark');
    expect(data.d.name.vernacular).toEqual(VERNACULAR);
    expect(locals.drawn).toBeUndefined();
  });
  it('a caller that does not say which: the whole data, as before', async () => {
    const { data } = await pageOf(undefined);
    expect(data.points.length).toBe(52);
    expect(data.d.name.vernacular.length).toBe(3);
  });
  it('the page draws from the points when it has them, else holds the mark the server\'s map stands in', () => {
    const page = readFileSync('src/routes/species/[slug]/+page.svelte', 'utf8');
    expect(page).toContain("const regionMap = $derived(data.points ? describedBy(regionSvg(d.distribution.boxes, data.points, d.centroid, `Openly licensed records of ${d.name.scientific}`, d.distribution.native.filter((r) => r.box).map((r) => ({ name: unitName(r.name), box: r.box! }))), 'records-caption') : (data.regionMark ?? ''));");
    expect(page).toContain('<div class="mapbox">{@html regionMap}');
  });
});

describe('r83w 3: the stylesheets stay in the HTML; the species page\'s are kept at install; the rest', () => {
  it('svelte.config.js keeps the page\'s sheets inline (measured: as files, the first paint came later) and scopes with s<hash>; app.html sends no comment', () => {
    const cfg = readFileSync('svelte.config.js', 'utf8');
    expect(cfg).toContain('inlineStyleThreshold: 40 * 1024,');
    expect(cfg).toContain("compilerOptions: { cssHash: ({ hash, css, filename }) => `s${hash(filename === '(unknown)' ? css : (filename ?? css))}` },"); // base: Svelte's svelte-<hash>
    expect(readFileSync('src/app.html', 'utf8')).not.toContain('<!--'); // base: 2.7 kB of comments in every page
  });
  it('the install keeps the species page\'s stylesheets, and of its scripts nothing', () => {
    const G = '.svelte-kit/generated/client-optimized';
    const manifest = {
      [`${G}/nodes/0.js`]: { file: '_app/immutable/nodes/0.A.js', isEntry: true, css: ['_app/immutable/assets/0.B.css'] },
      [`${G}/nodes/33.js`]: { file: '_app/immutable/nodes/33.C.js', isEntry: true, imports: ['_photo.js'], css: ['_app/immutable/assets/33.D.css'] },
      '_photo.js': { file: '_app/immutable/chunks/photo.E.js', css: ['_app/immutable/assets/photo-size.F.css'] }
    };
    const routes: Record<string, string> = { [`${G}/nodes/0.js`]: 'src/routes/+layout.svelte', [`${G}/nodes/33.js`]: 'src/routes/species/[slug]/+page.svelte' };
    const list = offlineBuild(manifest, (k) => routes[k] ?? null);
    expect(list).toContain('_app/immutable/assets/33.D.css'); // base: not kept until a page asked for it
    expect(list).toContain('_app/immutable/assets/photo-size.F.css');
    expect(list).not.toContain('_app/immutable/nodes/33.C.js');
    expect(list).not.toContain('_app/immutable/chunks/photo.E.js');
    expect(STYLE_ROUTE.test('src/routes/species/[slug]/+page.svelte')).toBe(true);
    // And /about/how says so.
    expect(readFileSync('src/routes/about/how/+page.svelte', 'utf8')).toContain("the scripts, styles and typefaces of the collection's pages, the front page and the offline page, the species page's styles, the tab's icon and the web manifest.");
  });
  it('the live check says the page\'s weight, and only notes a Worker of an earlier round (the plan runs it after each upload)', () => {
    const live = readFileSync('scripts/live-check.mjs', 'utf8');
    expect(live).toContain("the deployed Worker is older than round eighty-three, and the page's weight is not checked`);");
    expect(live).toContain('ok(`species page: ${Math.round(a.text.length / 1024)} kB of HTML, the regional map drawn once`);');
  });
});
