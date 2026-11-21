/**
 * Round 104 (docs/PLAN-104.md; the second hand-off's round 9 with the third's 15a): one search, and what its rows say.
 *
 * 1. The index's season key is the species page's own season (`seasonKey` against `seasonWords`'s head, every branch).
 * 2. `habitatYearOf` writes `rain` and `yr` from a habitat climate, and nothing without one.
 * 3. A species row says figures, never "climate known": the record low, the rain a year and the season, in the reader's
 *    units; a figure an older index lacks is left out; a page with no climate says its region and photographs.
 * 4. A genus whose species have no habitat climate says so once, on its row.
 * 5. A query nothing answers whose first word is a genus here is answered with the genus held, its count and its family,
 *    and no hits; from the cache too. A one-word query, a query that finds its species, and a first word that is no
 *    genus are not.
 *
 * On bc0883b: no season-key.ts, no row-words.ts, no habitatYearOf; suggest's genus row had no climate count; the search
 * answered "monstera albo" (here "copiapoa albo") with nothing at all. FAILED.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { seasonKey, SEASON_HEAD, SEASON_KEYS } from '$core/season-key';
import { seasonWords } from '$lib/ui/ref/season';
import { growingYear, type Year } from '$core/sheet';
import { habitatYearOf } from '$dossier/index-entry';
import { rowFigures } from '$lib/browse/row-words';
import { browseTableOf } from '$lib/browse/table';
import { prepared } from '$lib/browse/engine';
import { suggest } from '$lib/browse/suggest';
import { _forgetIndex } from '$lib/server/dossiers';
import { resetRateLimits } from '$lib/server/sync';
import { md5 } from '$dossier/md5';

const base: Year = { grow: 'summer', fog: false, frozen: false, frozenMonths: [], none: false, shiftable: true, spread: false, flat: false, growMonths: [11, 12, 1, 2], shifted: [5, 6, 7, 8], south: true, wetMm: 300, annualMm: 400, wetT: 20, meanT: 15, rangeT: 10, driest: 7, wettest: 1 };

describe('1. the season key is the species page’s season', () => {
  const years: Array<[string, Partial<Year>]> = [
    ['summer', {}], ['winter', { grow: 'winter' }], ['frozen', { grow: 'winter', frozen: true, frozenMonths: [6] }],
    ['even', { grow: 'even' }], ['spread', { grow: 'even', spread: true }], ['flat', { grow: 'even', flat: true, shiftable: false }],
    ['fog', { grow: 'cool', fog: true }], ['none', { grow: 'cool', fog: true, none: true, growMonths: [], shiftable: false }]
  ];
  for (const [k, over] of years) {
    it(k, () => {
      const y = { ...base, ...over };
      expect(seasonKey(y)).toBe(k);
      expect(SEASON_HEAD[seasonKey(y)]).toBe(seasonWords(y, -30).head);
    });
  }
  it('every key has a head', () => expect(SEASON_KEYS.every((k) => SEASON_HEAD[k])).toBe(true));
});

const months = (rain: number[], tmean: number[]) => rain.map((p, i) => ({ precipMm: p, tmean: tmean[i], tmin: tmean[i] - 6, tmax: tmean[i] + 6 }));
const cape = months([60, 70, 90, 110, 120, 110, 90, 60, 30, 15, 10, 20], [22, 22, 20, 17, 14, 12, 11, 12, 14, 17, 19, 21]);

describe('2. the index’s rain and season', () => {
  it('from a habitat climate: the cells’ median where the dossier has it, else the months added', () => {
    const y = growingYear(cape as never, null)!;
    expect(habitatYearOf({ status: 'ok', months: cape, annualRain: { p50: 941.4 } })).toEqual({ rain: 941, yr: seasonKey(y) });
    expect(habitatYearOf({ status: 'ok', months: cape }).rain).toBe(785);
    expect(habitatYearOf({ status: 'ok', months: cape }).yr).toBe('winter');
  });
  it('nothing without one', () => {
    expect(habitatYearOf({ status: 'none' })).toEqual({});
    expect(habitatYearOf({ status: 'ok', months: cape.slice(0, 11) })).toEqual({});
    expect(habitatYearOf(null)).toEqual({});
  });
});

describe('3. a species row says figures', () => {
  it('with a habitat climate, in each unit', () => {
    expect(rowFigures({ climate: 'ok', low: 4.4, rain: 941, yr: 'winter' }, 'metric')).toBe('record low 4.4 °C · 941 mm a year · wet winters');
    expect(rowFigures({ climate: 'ok', low: 4.4, rain: 941, yr: 'winter' }, 'us')).toBe('record low 39.9 °F · 37.0 in a year · wet winters');
  });
  it('an older index: only what it holds', () => {
    expect(rowFigures({ climate: 'ok', low: -2 }, 'metric')).toBe('record low -2.0 °C');
    expect(rowFigures({ climate: 'ok' }, 'metric')).toBe('');
  });
  it('no habitat climate: its first native region and its photographs, never "no habitat climate"', () => {
    const t = rowFigures({ climate: 'none', origin: ['Cape Provinces', 'Namibia', 'Free State'], photos: 36 }, 'metric');
    expect(t).toBe('Cape Provinces and 2 more · 36 photographs');
    expect(rowFigures({ climate: 'refused', origin: ['Chile North'], photos: 1 }, 'metric')).toBe('Chile North · 1 photograph');
    expect(t).not.toMatch(/climate/);
  });
});

const entry = (name: string, climate: string, i: number) => ({ key: `k${i}`, slug: name.toLowerCase().replace(/ /g, '-'), name, family: name.startsWith('Lithops') ? 'Aizoaceae' : 'Cactaceae', origin: ['Cape Provinces'], photos: 1, open: 0, climate });

describe('4. a genus with no habitat climate says so once', () => {
  const idx = [entry('Lithops lesliei', 'none', 1), entry('Lithops optica', 'none', 2), entry('Lithops aucampiae', 'pending', 3), entry('Copiapoa cinerea', 'ok', 4), entry('Copiapoa humilis', 'none', 5)];
  const p = prepared(browseTableOf(idx as never));
  it('Lithops: 3 species, 0 with a habitat climate; Copiapoa: its count alone', () => {
    expect(suggest(p, 'lithops').find((r) => r.kind === 'genus')?.sub).toBe('genus · Aizoaceae · 3 species, 0 with a habitat climate');
    expect(suggest(p, 'copiapoa').find((r) => r.kind === 'genus')?.sub).toBe('genus · Cactaceae · 2 species');
  });
});

describe('5. the genus that is held', () => {
  const IDX = ['Copiapoa cinerea', 'Copiapoa humilis', 'Copiapoa dealbata', 'Aloe vera'].map((n, i) => ({ ...entry(n, 'ok', i), key: 1000 + i, family: n.startsWith('Aloe') ? 'Asphodelaceae' : 'Cactaceae' }));
  const noStatic = (async () => new Response('', { status: 404 })) as typeof fetch;
  function platform() {
    const m = new Map([['s/v3/index.json', JSON.stringify(IDX)]]);
    const store = {
      get: async (k: string) => (m.has(k) ? { text: async () => m.get(k)!, json: async () => JSON.parse(m.get(k)!), etag: md5(m.get(k)!) } : null),
      head: async (k: string) => (m.has(k) ? { etag: md5(m.get(k)!) } : null)
    };
    const kept = new Map<string, Response>();
    const caches = { default: { match: async (r: Request) => kept.get(r.url)?.clone(), put: async (r: Request, res: Response) => void kept.set(r.url, res) } };
    return { env: { STORE: store }, caches } as unknown as App.Platform;
  }
  beforeEach(() => { _forgetIndex(); resetRateLimits(); vi.spyOn(console, 'warn').mockImplementation(() => {}); });
  afterEach(() => vi.restoreAllMocks());
  const held = (r: Response) => { const h = r.headers.get('x-search-held'); return h ? JSON.parse(decodeURIComponent(h)) : null; };

  it('"copiapoa albo": no hits, the genus held with its count and family, and the same from the cache and shaped', async () => {
    const { GET } = await import('../../src/routes/api/search/+server');
    const plat = platform();
    const call = (qs: string) => GET({ url: new URL(`https://x/api/search?${qs}`), platform: plat, fetch: noStatic, getClientAddress: () => '1.2.3.4' } as never);
    const r = await call('q=copiapoa%20albo');
    expect(await r.json()).toEqual([]);
    expect(held(r)).toEqual({ genus: 'Copiapoa', n: 3, slug: 'copiapoa', family: 'Cactaceae' });
    expect(held(await call('q=copiapoa%20albo'))).toEqual({ genus: 'Copiapoa', n: 3, slug: 'copiapoa', family: 'Cactaceae' });
    expect(((await (await call('q=copiapoa%20albo&shape=2')).json()) as { held?: unknown }).held).toEqual({ genus: 'Copiapoa', n: 3, slug: 'copiapoa', family: 'Cactaceae' });
  });
  it('not for one word, a species found, nor a first word that is no genus', async () => {
    const { GET } = await import('../../src/routes/api/search/+server');
    const plat = platform();
    const call = (q: string) => GET({ url: new URL(`https://x/api/search?q=${encodeURIComponent(q)}`), platform: plat, fetch: noStatic, getClientAddress: () => '1.2.3.4' } as never);
    for (const q of ['qzxwvk', 'copiapoa cinerea', 'qzxwvk albo']) expect(held(await call(q)), q).toBeNull();
  });
});
