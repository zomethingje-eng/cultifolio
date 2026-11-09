/**
 * Round eighty-seven, the fixes after the review of stage 2's pages (its probes: review87s2-ui). Held here:
 *
 * 1. A merge's preview counts pinned views apart from the numbering scheme (they are setting records, ids `pin-`); the
 *    backup page's words for them are held in the browser (r87s2u-review.spec.ts, 1).
 * 4. The browse pages are sent with Vary on the units cookie and the language, and carry the reader's units, so the record
 *    low follows them as the species page's does.
 * 6. A pinned view's region the scheme no longer holds: left out of the view and kept as `gone`, carried in the page's one
 *    spelling as `gone=`, never in a link; /browse/data's keys say which codes are gone with the rest's count; a pin says
 *    the region is no longer in the reference, not "too many to follow".
 * 7. Species+ "(CITES)" is left out of Elsewhere while the CITES line says "not asked"; IUCN's link stays.
 * 5. At home's hours: the buttons' edge is --edge (3:1), and a change is said in a polite live region.
 *
 * Each fails on 9311e8b: the preview counted pins as `setting` ("the numbering scheme"), the browse pages had no units
 * and no Vary, an unknown region code was dropped without a word (the pin said "too many to follow"), Elsewhere linked
 * Species+ beside "not asked", and At home's buttons had a --rule edge and no live region.
 */
import { describe, it, expect, afterAll, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Route } from '@playwright/test';
import { previewMerge } from '$lib/backup/backup';
import { pinIdOf, PIN_PREFIX, goneWords, TOO_WIDE } from '$lib/browse/pins';
import { parseQuery, queryString } from '$lib/browse/engine';
import { canonicalSearch } from '$lib/browse/load.server';
import { elsewhereView } from '$lib/ui/ref/links-words';
import { _forgetIndex, type IndexEntry } from '$lib/server/dossiers';
import { resetRateLimits } from '$lib/server/sync';
import { slugify } from '$core/names';
import { GET as dataGet } from '../../src/routes/browse/data/+server';
import { load as browseLoad } from '../../src/routes/browse/+page.server';
import { load as speciesLoad } from '../../src/routes/species/[slug]/+page.server';
import { mount, stopMounting } from './helpers/mount';
import { render } from 'svelte/server';
import BrowseView from '$lib/browse/BrowseView.svelte';
import { units } from '$lib/ui/units.svelte';

afterAll(stopMounting);

describe('1. pinned views in a merge are pinned views, not the numbering scheme', () => {
  const ch = (i: number, id: string, field: string, value: unknown) => ({ t: `${String(1790000000000 + i).padStart(13, '0')}-0000-abcdefabcdef0000`, kind: 'setting', id, field, value });
  it('the preview counts them apart, under the pin prefix', () => {
    const a = pinIdOf('?r=NAM'), b = pinIdOf('?f=cactaceae');
    const incoming = [ch(1, a, 'view', '?r=NAM'), ch(2, a, 'href', '/browse?r=NAM'), ch(3, b, 'view', '?f=cactaceae'), ch(4, b, 'href', '/family/cactaceae'), ch(5, 'numbering', 'scheme', { kind: 'year' })];
    const m = previewMerge([] as never, incoming as never);
    expect(m.addedByKind[PIN_PREFIX]).toBe(2); // 9311e8b: undefined, and setting 3
    expect(m.addedByKind.setting).toBe(1); // the numbering scheme alone
  });
});

const e = (k: number, name: string, origin: string[], o: Partial<IndexEntry> = {}): IndexEntry => ({ key: `k${k}`, gbif: 9000 + k, slug: slugify(name), name, family: 'Apocynaceae', origin, photos: 4, open: 3, climate: 'ok', changed: 20765, ...o }) as IndexEntry;
const IDX: IndexEntry[] = [
  e(1, 'Hoodia alstonii', ['Cape Provinces', 'Namibia'], { grown: 5 }),
  e(2, 'Hoodia gordonii', ['Cape Provinces', 'Namibia', 'Botswana'], { grown: 37 }),
  e(3, 'Lithops lesliei', ['Cape Provinces'], { family: 'Aizoaceae', grown: 2000 })
];
const kv = () => { const m = new Map<string, string>(); return { get: async (k: string) => m.get(k) ?? null, put: async (k: string, v: string) => void m.set(k, v) }; };
const indexOnly = (idx: IndexEntry[]) => ({ env: { STORE: { get: async () => ({ text: async () => JSON.stringify(idx), json: async () => idx, etag: '"i"' }), head: async () => ({ etag: '"i"' }) }, QUEUE: kv() } }) as unknown as App.Platform;
const noStatic = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;
let headers: Record<string, string> = {};
const ev = (path: string, units?: string) => ({ params: {}, platform: indexOnly(IDX), fetch: noStatic, url: new URL(`https://cultifolio.com${path}`), setHeaders: (h: Record<string, string>) => Object.assign(headers, h), getClientAddress: () => '192.0.2.9', locals: {}, cookies: { get: (k: string) => (k === 'cultifolio.units' ? units : undefined) }, request: new Request(`https://cultifolio.com${path}`) }) as never;
const settle = async <T,>(p: Promise<T> | T) => { try { return { ok: await p }; } catch (x) { const y = x as { status?: number; location?: string }; return { status: y.status, location: y.location }; } };

describe('4. the browse pages in the reader\'s units', () => {
  beforeEach(() => { _forgetIndex(); resetRateLimits(); headers = {}; vi.spyOn(console, 'warn').mockImplementation(() => {}); });
  it('a page carries the units the cookie names, and is kept apart by them', async () => {
    const r = (await settle(browseLoad(ev('/browse?view=list', 'us')))).ok as Record<string, unknown>;
    expect(r.units).toBe('us'); // 9311e8b: no units, so the record low was always °C
    expect(headers.vary).toBe('accept-language, cookie');
    expect(headers['cache-control']).toBe('private, max-age=60');
  });
  it('the list and the tiles give the record low in the reader\'s units, one decimal, with a true minus', async () => {
    const lows = IDX.map((x, i) => ({ ...x, low: [-3.5, 4.25, null][i] }));
    const plat = ({ env: { STORE: { get: async () => ({ text: async () => JSON.stringify(lows), json: async () => lows, etag: '"l"' }), head: async () => ({ etag: '"l"' }) }, QUEUE: kv() } }) as unknown as App.Platform;
    const at = (path: string) => ({ ...(ev(path) as object), platform: plat }) as never;
    const list = ((await settle(browseLoad(at('/browse?sort=az&view=list')))).ok as { view: unknown }).view;
    const tiles = ((await settle(browseLoad(at('/browse?sort=az')))).ok as { view: unknown }).view;
    const words = (h: string) => h.replace(/<!--[^]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    units.seed('us');
    const us = words(render(BrowseView, { props: { view: list } as never }).body) + words(render(BrowseView, { props: { view: tiles } as never }).body);
    expect(us).toContain('25.7 °F'); // −3.5 °C; 9311e8b: "−3.5 °C" whatever the reader's units
    expect(us).toContain('39.7 °F'); // 4.3 °C as the table holds it
    expect(us).not.toMatch(/\d °C/);
    units.seed('metric');
    const metric = words(render(BrowseView, { props: { view: list } as never }).body);
    expect(metric).toContain('\u22123.5 °C');
    expect(metric).toContain('4.3 °C');
  });
});

describe('6. a region the scheme no longer holds is said, and the rest of the view kept', () => {
  beforeEach(() => { _forgetIndex(); resetRateLimits(); headers = {}; vi.spyOn(console, 'warn').mockImplementation(() => {}); });
  it('parsed as gone, written in the page\'s one spelling only', () => {
    const q = parseQuery(new URLSearchParams('r=XYZ,NAM&f=apocynaceae'));
    expect(q.r).toEqual(['NAM']);
    expect(q.gone).toEqual(['XYZ']);
    expect(queryString(q)).toBe('?r=NAM&f=apocynaceae'); // never in a link
    expect(canonicalSearch(new URL('https://x/browse?r=XYZ,NAM&f=apocynaceae'), 'browse')).toBe('?r=NAM&f=apocynaceae&gone=XYZ');
    expect(canonicalSearch(new URL('https://x/browse?r=NAM&f=apocynaceae&gone=XYZ'), 'browse')).toBe('?r=NAM&f=apocynaceae&gone=XYZ'); // one move, then it stays
    // What is no code at all is left out as before, and a known code is never gone.
    expect(parseQuery(new URLSearchParams('r=hello,NAM&gone=NAM')).gone).toBeUndefined();
    expect(parseQuery(new URLSearchParams('r=nam')).gone).toBeUndefined();
  });
  it('the browse page moves to that spelling and says the region is not in the reference', async () => {
    expect(await settle(browseLoad(ev('/browse?r=XYZ&f=apocynaceae')))).toMatchObject({ status: 301, location: '/browse?f=apocynaceae&gone=XYZ' }); // 9311e8b: '/browse?f=apocynaceae', said nowhere
    const r = (await settle(browseLoad(ev('/browse?f=apocynaceae&gone=XYZ')))).ok as { view: { gone?: string[]; total: number; pin: { view: string } } };
    expect(r.view.gone).toEqual(['XYZ']);
    expect(r.view.total).toBe(2); // the rest of the view: the family
    expect(r.view.pin.view).toBe('?f=apocynaceae');
  });
  it('/browse/data\'s keys name the gone codes and count the rest, with no species to compare', async () => {
    const res = await dataGet({ url: new URL('https://cultifolio.com/browse/data?part=keys&r=XYZ&f=apocynaceae'), platform: indexOnly(IDX), fetch: noStatic, getClientAddress: () => '192.0.2.9' } as never);
    expect(await res.json()).toEqual({ n: 2, keys: null, gone: ['XYZ'] }); // 9311e8b: the family's keys, the region dropped unsaid
  });
  it('a pin says the region is no longer in the reference, not that it is too wide', () => {
    expect(goneWords(['XYZ'])).toBe('its region XYZ is no longer in the reference, so the rest of the view is shown and not followed for changes');
    expect(goneWords(['XYZ', 'ABC'])).toMatch(/^its regions XYZ and ABC are no longer in the reference/);
    expect(goneWords(['XYZ'])).not.toBe(TOO_WIDE);
  });
});

describe('7. Species+ waits for the CITES table', () => {
  const read = { item: 'Q10', read: '2026-11-09', ids: [{ p: 'P2040', v: '4371' }, { p: 'P627', v: '152240' }] };
  const labels = (cites: unknown) => elsewhereView({ ids: { wikidata: 'Q10' }, links: {}, elsewhere: { wikidata: read }, cites } as never).links.map((l) => l.label);
  it('left out while the CITES line says "not asked": no CITES field, or one the build skipped', () => {
    expect(labels(undefined)).toEqual(['IUCN Red List']); // 9311e8b: Species+ (CITES) as well
    expect(labels({ status: 'skipped', read: '2026-11-09', detail: 'not asked: the Appendices were not read for this build' })).toEqual(['IUCN Red List']);
  });
  it('linked once the table is checked, listed or not', () => {
    expect(labels({ status: 'none', read: '2026-11-09', validFrom: '2026-03-05' })).toEqual(['Species+ (CITES)', 'IUCN Red List']);
    expect(labels({ status: 'ok', read: '2026-11-09', validFrom: '2026-03-05', appendix: 'II', level: 'family', listed: 'CACTACEAE spp.' })).toEqual(['Species+ (CITES)', 'IUCN Red List']);
  });
});

describe('5. At home\'s hours', () => {
  const FIXTURE = readFileSync('fixtures/dossiers/s/v3/k2735933.json', 'utf8');
  const corpus = (async (u: string | URL) => {
    const p = new URL(String(u), 'http://x').pathname;
    const f = p === '/s/v3/index.json' ? 'fixtures/dossiers/index.json' : p.startsWith('/s/v3/') ? `fixtures/dossiers${p}` : '';
    if (p === '/s/v3/k2735933.json') return new Response(FIXTURE, { headers: { 'content-type': 'application/json' } });
    try { return new Response(readFileSync(f), { headers: { 'content-type': 'application/json' } }); } catch { return new Response('{}', { status: 404 }); }
  }) as typeof fetch;
  const nothing = (r: Route) => r.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  it('the buttons\' edge is the field edge, and a change of hours is said politely', async () => {
    _forgetIndex();
    const url = new URL('http://x/species/copiapoa-cinerea');
    const data = JSON.parse(JSON.stringify(await speciesLoad({ params: { slug: 'copiapoa-cinerea' }, platform: undefined, fetch: corpus, setHeaders: () => {}, cookies: { get: () => undefined }, request: new Request(url), url, getClientAddress: () => '192.0.2.1', locals: {}, isDataRequest: true } as never)));
    const m = await mount('src/routes/species/[slug]/+page.svelte', { data }, { answer: nothing });
    try {
      const sec = m.page.locator('section#at-home');
      await sec.waitFor();
      // The theme's two tokens (the mount carries the component alone, not the layout's sheet).
      await m.page.addStyleTag({ content: ':root { --edge: #949086; --rule: #d9d6cf; }' });
      const [edge, border] = await sec.locator('.hours button').first().evaluate((b) => [getComputedStyle(document.documentElement).getPropertyValue('--edge').trim(), getComputedStyle(b).borderTopColor]);
      const rgb = (hex: string) => `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;
      expect(border).toBe(rgb(edge)); // 9311e8b: --rule, 1.45:1
      const live = sec.locator('[aria-live="polite"]');
      await expect.poll(() => live.count()).toBe(1); // 9311e8b: none
      expect((await live.textContent())?.trim()).toBe('');
      await sec.locator('.hours button', { hasText: '16 h' }).click();
      await expect.poll(async () => (await live.textContent())?.trim()).toMatch(/^Grow light, 16 h a day: [\d,]+ µmol\/m²\/s$/);
    } finally {
      await m.close();
    }
  }, 240_000);
});
