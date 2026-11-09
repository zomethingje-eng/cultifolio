/**
 * Round eighty-seven (pages): /about/data and the not-found page's species of the day (plan D6, D7).
 *
 * 1. `downloadsOf` reads the GBIF downloads a page's record of sources cites, in the build's own words, and nothing else.
 * 2. `pickOf` is the front page's first tile of the day, by the front page's own formula.
 * 3. `citeOf` and `citation`: the manifest's id and the day it was built, read as served; the corpus id alone without one.
 * 4. The derived dataset's section is drawn only once its DOI is set, and it is not set.
 * 5. `today()` over the fixture corpus: the front page's first species, its lead photograph credited in full, and the day.
 * 6. The endpoint and the page's load: their answers and their lifetimes.
 *
 * On the base (r85m head) none of these modules existed: every test fails.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { downloadsOf, pickOf, dayNumber, citeOf, citation, doiOf, GBIF_DERIVED_DOI } from '../../src/routes/about/data/reference';
import { today } from '../../src/routes/about/data/today.server';
import { GET as todayGet } from '../../src/routes/about/data/today/+server';
import { load as dataLoad } from '../../src/routes/about/data/+page.server';
import { _forgetIndex, corpusNow } from '$lib/server/dossiers';
import { featuredOfCorpus } from '$lib/server/catalogue';
import { load as homeLoad } from '../../src/routes/+page.server';

const noStatic = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;

describe('r87p data 1: the downloads a record cites', () => {
  it('the build\'s words for a page read from a download, with its day', () => {
    expect(downloadsOf('GBIF occurrence download https://doi.org/10.15468/dl.hbdw64, of 2026-10-21')).toEqual([{ doi: '10.15468/dl.hbdw64', day: '2026-10-21' }]);
  });
  it('a page without a GBIF key: Kew\'s keys first, the download among the parts', () => {
    expect(downloadsOf("GBIF's records under 2 keys Kew's synonymy gives; GBIF occurrence download https://doi.org/10.15468/dl.3h4zam; key 123 (Aloe x): download")).toEqual([{ doi: '10.15468/dl.3h4zam', day: null }]);
  });
  it('two downloads each once, in the order cited', () => {
    const d = 'GBIF occurrence download https://doi.org/10.15468/dl.aaaaaa, of 2026-10-20; GBIF occurrence download https://doi.org/10.15468/dl.bbbbbb, of 2026-10-21; GBIF occurrence download https://doi.org/10.15468/dl.aaaaaa, of 2026-10-20';
    expect(downloadsOf(d).map((x) => x.doi)).toEqual(['10.15468/dl.aaaaaa', '10.15468/dl.bbbbbb']);
  });
  it('none from the search API, a page with no record, a photograph\'s file, or nothing', () => {
    expect(downloadsOf('GBIF occurrence search API')).toEqual([]);
    expect(downloadsOf("no record under GBIF's key 5")).toEqual([]);
    expect(downloadsOf('from the GBIF download https://doi.org/10.15468/dl.hbdw64, of 2026-10-21')).toEqual([]);
    expect(downloadsOf('a paper https://doi.org/10.1093/x.y')).toEqual([]);
    expect(downloadsOf(undefined)).toEqual([]);
  });
  it('a DOI read with or without its resolver', () => {
    expect(doiOf('https://doi.org/10.15468/dd.abc123')).toBe('10.15468/dd.abc123');
    expect(doiOf('10.15468/dd.abc123')).toBe('10.15468/dd.abc123');
    expect(doiOf('not a doi')).toBeNull();
    expect(doiOf(null)).toBeNull();
  });
});

describe('r87p data 2: the species of the day is the front page\'s first', () => {
  it('the front page\'s own formula, its first tile', () => {
    const pool = Array.from({ length: 48 }, (_, i) => i);
    const front = (day: number) => Array.from({ length: Math.min(12, pool.length) }, (_, i) => pool[(day * 12 + i) % pool.length]);
    for (const day of [0, 1, 3, 4, 20_400, 20_765]) expect(pickOf(pool, day)).toBe(front(day)[0]);
  });
  it('a pool of other sizes, and none', () => {
    expect(pickOf(['a', 'b', 'c', 'd', 'e'], 1)).toBe('c');
    expect(pickOf([], 7)).toBeNull();
  });
  it('the day turns at midnight UTC', () => {
    expect(dayNumber(Date.UTC(2026, 10, 8, 23, 59))).toBe(dayNumber(Date.UTC(2026, 10, 8, 0, 0)));
    expect(dayNumber(Date.UTC(2026, 10, 9, 0, 0))).toBe(dayNumber(Date.UTC(2026, 10, 8)) + 1);
  });
  it('the front page\'s own first tile today is the species of the day (its load, run)', async () => {
    _forgetIndex();
    const url = new URL('https://cultifolio.com/');
    const home = (await homeLoad({ platform: undefined, fetch: noStatic, setHeaders: () => {}, url, cookies: { get: () => undefined }, request: new Request(url), locals: {} } as never)) as { featured: Array<{ slug: string }> };
    const t = await today(undefined, noStatic);
    expect(home.featured.length).toBeGreaterThan(0);
    expect(t?.slug).toBe(home.featured[0].slug);
  });
});

describe('r87p data 3: how to cite it', () => {
  it('the manifest\'s id and the day it was built', () => {
    const c = citeOf({ corpus: 'etag', manifest: { id: '41e65994323067ef', built: '2026-11-08T14:02:11.000Z' } });
    expect(c).toEqual({ id: '41e65994323067ef', built: '2026-11-08' });
    expect(citation(c!)).toBe('Cultifolio species reference, corpus 41e65994323067ef, built 2026-11-08. https://cultifolio.com');
  });
  it('the corpus id alone where no manifest is served, the day not known', () => {
    const c = citeOf({ corpus: 'fixture', manifest: null });
    expect(c).toEqual({ id: 'fixture', built: null });
    expect(citation(c!)).toBe('Cultifolio species reference, corpus fixture. https://cultifolio.com');
  });
  it('nothing when nothing names the corpus', () => {
    expect(citeOf(null)).toBeNull();
    expect(citeOf({ corpus: '', manifest: null })).toBeNull();
    expect(citeOf({ corpus: 'x', manifest: { id: 5, built: 'yesterday' } })).toEqual({ id: 'x', built: null });
  });
});

describe('r87p data 4: the derived dataset', () => {
  it('no DOI is set: none is registered', () => expect(GBIF_DERIVED_DOI).toBeNull());
  it('its section is drawn only with the DOI', () => {
    const src = readFileSync('src/routes/about/data/+page.svelte', 'utf8');
    const at = src.indexOf('id="derived"');
    expect(at).toBeGreaterThan(0);
    const before = src.slice(0, at);
    expect(before.lastIndexOf('{#if GBIF_DERIVED_DOI}')).toBeGreaterThan(before.lastIndexOf('{/if}'));
    // Nothing outside that section speaks of a derived dataset.
    const outside = src.replace(/\{#if GBIF_DERIVED_DOI\}[\s\S]*?\{\/if\}/, '').replace(/<script[\s\S]*?<\/script>/, '');
    expect(outside).not.toMatch(/derived dataset/i);
  });
});

describe('r87p data 5: today over the fixture corpus', () => {
  beforeEach(() => _forgetIndex());
  it('the front page\'s first species of the day, its lead photograph with author, licence and day', async () => {
    const c = await corpusNow(undefined, noStatic);
    const pool = await featuredOfCorpus(c, undefined, noStatic);
    expect(pool.length).toBeGreaterThan(0);
    const now = Date.UTC(2026, 10, 8, 12);
    const t = await today(undefined, noStatic, c, now);
    expect(t).not.toBeNull();
    expect(t!.slug).toBe(pickOf(pool, dayNumber(now))!.slug);
    expect(t!.day).toBe('2026-11-08');
    if (t!.photo) {
      expect(t!.photo.credit.length).toBeGreaterThan(0);
      expect(t!.photo.read).toMatch(/^Credits as read from .+ on \d{4}-\d{2}-\d{2}/);
      expect(t!.photo.read).not.toContain('not recorded');
      expect(t!.photo.src).toMatch(/^https:\/\//);
    }
  });
  it('none with no pool', async () => {
    const c = await corpusNow(undefined, noStatic);
    // A corpus whose strip is empty: the pick is null, and so is the day's species.
    const empty = { ...c, idx: [], manifest: null } as typeof c;
    expect(await today(undefined, noStatic, empty)).toBeNull();
  });
});

describe('r87p data 6: the endpoint and the load', () => {
  beforeEach(() => _forgetIndex());
  it('the endpoint answers the day\'s species, public for five minutes, and never the downloads', async () => {
    const r = await todayGet({ platform: undefined, fetch: noStatic, getClientAddress: () => '192.0.2.87' } as never);
    const j = (await r.json()) as { today: Record<string, unknown> | null };
    if (j.today) {
      expect(r.headers.get('cache-control')).toBe('public, max-age=300');
      expect(j.today).not.toHaveProperty('downloads');
      expect(typeof j.today.slug).toBe('string');
    } else expect(r.headers.get('cache-control')).toBe('no-store');
  });
  it('the page reads the corpus it is served, privately and for a minute', async () => {
    const headers: Record<string, string> = {};
    const d = (await dataLoad({ platform: undefined, fetch: noStatic, getClientAddress: () => '192.0.2.87', setHeaders: (h: Record<string, string>) => Object.assign(headers, h) } as never)) as { cite: { id: string; built: string | null } | null; downloads: unknown[] | null };
    expect(headers['cache-control']).toBe('private, max-age=60');
    expect(d.cite).toEqual({ id: 'fixture', built: null });
    expect(Array.isArray(d.downloads) || d.downloads === null).toBe(true);
  });
});
