/**
 * Round eighty (S): the catalogue search at the full list's size.
 *
 * 1. Kew's older names (review-d 5: on 38 of 109 sampled pages Kew's older names found nothing; "Echinocactus
 *    chrysacanthus", Aloe framesii's "Aloe amoena", "Lavandula officinalis"). The index carries them (`kew`,
 *    `kewOlderOf`), and a query that types one as a name, its genus in full first, finds the page, after a page whose
 *    own name it is; through the key files as through the whole index; and the key files of the words are the same with
 *    them as without, only Kew's `@` files added.
 * 2. The count (review-w 2, review-p 3: "60 matches of 48,361" where 60 was the cap and Echeveria has 220): the answer
 *    says how many species answer, and the next page is asked from where the first ends, rank for rank the whole index's.
 * 3. A region of origin (review-w 6: "cape provinces" gave no list and no way forward): typed whole, every word of it
 *    too common to list, it is answered from the build's own answers with their count; typed in part or misspelt, the
 *    answer names the region and the Origin grouping's row it is part of.
 *
 * FAILS on r80f: the index has no `kew` and the search reads no such names (1); the answer has no `total` and no `at`
 * (2); "cape provinces" says only `narrow`, and names no region (3).
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { _forgetIndex, type IndexEntry } from '$lib/server/dossiers';
import { buildProducts } from '$dossier/products';
import { manifestPath, productPath } from '$dossier/manifest';
import { kewOlderOf } from '$dossier/index-entry';
import { prepare, search } from '$core/search';
import { resetRateLimits } from '$lib/server/sync';
import { countSentence, moreOf, regionSentence } from '$lib/ui/ref/searched';
import { regionsTyped } from '$core/regions';
import { GET as searchGet } from '../../src/routes/api/search/+server';
import { synthIndex, reseed } from './helpers/corpus-synth';

reseed(80);
const BASE: IndexEntry[] = (synthIndex(2300).idx as unknown as IndexEntry[]).map((e) => {
  const common = (e.common ?? '').split(', ').filter(Boolean);
  const out: IndexEntry = { ...e, origin: ['Cape Provinces', ...(e.origin ?? []).filter((o) => o !== 'Cape Provinces')] };
  delete out.common;
  if (common.length) out.common = common[0];
  if (common.length > 1) out.commons = common.slice(1);
  return out;
});
// Kew's older names on a few pages: a genus no page has (Oldgenus), a genus of the reference with another page's
// epithet (Mammillaria x), and a name that is another page's own name (which that page answers first).
const ferox = BASE.findIndex((e) => /^Ferocactus /.test(e.name));
const lith = BASE.findIndex((e) => /^Lithops /.test(e.name));
const mam = BASE.filter((e) => /^Mammillaria /.test(e.name));
const other = mam[3].name;
const KEW: Record<number, string[]> = {
  [ferox]: ['Oldgenus chrysacanthulus', 'Echinocactus zzkewonly', 'Mammillaria quuxifolia'],
  [lith]: ['Oldgenus lithopsoides', other, BASE[lith].name, ...(BASE[lith].syn ?? [])]
};
const IDX: IndexEntry[] = BASE.map((e, i) => {
  if (!KEW[i]) return e;
  const kew = kewOlderOf(e.name, [...(e.syn ?? []), ...(e.older ?? [])], KEW[i]);
  return kew.length ? { ...e, kew } : e;
});

type Built = ReturnType<typeof buildProducts>;
let withKew: Built, without: Built;
beforeAll(() => {
  withKew = buildProducts(IDX, JSON.stringify(IDX, null, 1), () => new Map(), '2026-10-22T00:00:00Z');
  without = buildProducts(BASE, JSON.stringify(BASE, null, 1), () => new Map(), '2026-10-22T00:00:00Z');
}, 240_000);

function bucket(m: Map<string, string>) {
  const obj = (k: string) => ({ text: async () => m.get(k)!, json: async () => JSON.parse(m.get(k)!), etag: `"${k}:${m.get(k)!.length}"`, body: m.get(k)! });
  return { get: async (k: string) => (m.has(k) ? obj(k) : null), head: async (k: string) => (m.has(k) ? { etag: `"${k}:${m.get(k)!.length}"` } : null) };
}
function platform(kind: 'files' | 'whole', p: Built = withKew, idx: IndexEntry[] = IDX) {
  const m = new Map<string, string>();
  if (kind === 'whole') m.set('s/v3/index.json', JSON.stringify(idx));
  else {
    m.set(manifestPath(), JSON.stringify(p.manifest));
    for (const [n, body] of p.files) m.set(productPath(p.manifest.files[n]), body);
    for (const [h, body] of p.stored) m.set(productPath(h), body);
  }
  return { env: { STORE: bucket(m) } } as unknown as App.Platform;
}
const noStatic = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;
async function ask(pl: App.Platform, q: string, extra = '&n=100&shape=2') {
  resetRateLimits();
  const url = new URL(`https://cultifolio.com/api/search?q=${encodeURIComponent(q)}${extra}`);
  const r = await searchGet({ params: {}, platform: pl, fetch: noStatic, url, request: new Request(url), getClientAddress: () => '192.0.2.80', setHeaders: () => {} } as never);
  const body = await r.text();
  return { status: r.status, body, json: JSON.parse(body) as { hits: IndexEntry[]; total?: number; kept?: number; narrow?: boolean; regions?: Array<{ name: string; row: { id: string; label: string } }> }, headers: r.headers };
}
/** An answer as the whole index and the key files both give it: `kept` (how many a heavy key's answers can list) is the files' alone. */
const same = (b: string) => { const j = JSON.parse(b); delete j.kept; return JSON.stringify(j); };

beforeEach(() => { _forgetIndex(); resetRateLimits(); vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());

describe("Kew's older names (review-d 5)", () => {
  it('the index carries the names neither `syn` nor `older` hold, once, never the page\'s own name', () => {
    expect(kewOlderOf('Ferocactus chrysacanthus', [], ['Echinocactus chrysacanthus', 'Echinocactus rubrispinus', 'Ferocactus grandiflorus'])).toEqual(['Echinocactus chrysacanthus', 'Echinocactus rubrispinus', 'Ferocactus grandiflorus']);
    expect(kewOlderOf('Aloe framesii', ['Aloe microstigma subsp. framesii'], ['Aloe amoena'])).toEqual(['Aloe amoena']);
    expect(kewOlderOf('Lavandula angustifolia', ['Lavandula vera', 'Lavandula spica'], ['Lavandula officinalis', 'Lavandula vera', 'Lavandula  Spica', 'Lavandula angustifolia'])).toEqual(['Lavandula officinalis']);
    expect(kewOlderOf('Aloe vera', [], undefined)).toEqual([]);
    expect(IDX[lith].kew).toEqual(['Oldgenus lithopsoides', other]);
  });

  it('a name typed, its genus in full, finds the page, after the page whose own name it is; a word alone does not', () => {
    const p = prepare(IDX);
    const names = (q: string) => search(p, q).map((e) => e.name);
    expect(names('Oldgenus chrysacanthulus')).toEqual([IDX[ferox].name]);
    expect(names('oldgenus chrysa')).toEqual([IDX[ferox].name]);
    expect(names('Oldgenus')).toEqual([]);
    expect(names('chrysacanthulus')).toEqual([]);
    expect(names('Echinocactus zzkewonly')).toEqual([IDX[ferox].name]);
    expect(names(other).slice(0, 2)).toEqual([other, IDX[lith].name]);
    // On the base, the field is not read: nothing answers.
    expect(search(prepare(BASE), 'Oldgenus chrysacanthulus')).toEqual([]);
  });

  it('the key files answer as the whole index, and their words\' files are those built without the names', async () => {
    const qs = ['Oldgenus chrysacanthulus', 'oldgenus chrysa', 'Oldgenus lithopsoides', 'Oldgenus', 'Echinocactus zzkewonly', 'Mammillaria quuxifolia', 'mammillaria quux', other, IDX[ferox].name, 'Ferocactus', 'Oldgenus chrysacanthulus var', 'Oldgenus chrysacanthulux'];
    const files = platform('files'), whole = platform('whole');
    for (const q of qs) {
      const f = await ask(files, q);
      _forgetIndex();
      const w = await ask(whole, q);
      _forgetIndex();
      expect([q, same(f.body)]).toEqual([q, same(w.body)]);
    }
    expect((await ask(files, 'Oldgenus chrysacanthulus')).json.hits.map((h) => h.name)).toEqual([IDX[ferox].name]);
    // Every file of the words' trees is the same with Kew's names as without: only the `@` files are new.
    const extra = [...withKew.storedHashes].filter((h) => !without.storedHashes.has(h));
    const dirs = [...withKew.files].filter(([n]) => /^search\/(?:top|\d+)\.json$/.test(n)).map(([, b]) => JSON.parse(b) as Record<string, [number, string?]>);
    const kewFiles = new Set(dirs.flatMap((d) => Object.entries(d).filter(([k]) => k.startsWith('@')).map(([, e]) => e[1]!)));
    expect(kewFiles.size).toBe(3); // @oldgenus, @echinocactus and @mammillaria (`other` is a Mammillaria too)
    for (const h of extra) expect(kewFiles.has(h) || !without.storedHashes.has(h)).toBe(true);
    expect(extra.filter((h) => !kewFiles.has(h)).length).toBeLessThanOrEqual(2); // the show and photograph blocks that hold the two entries
  }, 120_000);
});

describe('the count, and the next page (review-w 2, review-p 3)', () => {
  it('says how many answer, and the next page is the whole index\'s next, through the key files too', async () => {
    const files = platform('files'), whole = platform('whole');
    for (const q of ['mammillaria', 'aloe', 'cape', 'echev', 'zebra plant']) {
      const f1 = await ask(files, q, '&n=60&shape=2');
      const f2 = await ask(files, q, '&n=60&at=60&shape=2');
      _forgetIndex();
      const w = await ask(whole, q, '&n=100&shape=2');
      const w2 = await ask(whole, q, '&n=60&at=60&shape=2');
      _forgetIndex();
      expect(f1.json.total).toBe(w.json.total);
      expect(f1.json.total).toBe(search(prepare(IDX), q).length);
      expect(f1.headers.get('x-search-total')).toBe(String(f1.json.total));
      expect([...f1.json.hits, ...f2.json.hits].slice(0, 100).map((h) => h.key)).toEqual(w.json.hits.map((h) => h.key));
      if (!f1.json.kept) expect(f2.json.hits.map((h) => h.key)).toEqual(w2.json.hits.map((h) => h.key));
    }
    // A word too common to list keeps the whole index's first hundred, and says so.
    const cape = await ask(files, 'cape', '&n=60&at=60&shape=2');
    expect(cape.json.kept).toBe(100);
    expect(cape.json.hits.length).toBe(40);
    expect(cape.json.total).toBeGreaterThan(2000);
  }, 120_000);

  it('the page says the count, never the cap as a count', () => {
    expect(countSentence({ loaded: 60, shown: 60, total: 220, of: 48361, chip: false })).toBe('60 of 220 matches');
    expect(countSentence({ loaded: 43, shown: 43, total: 43, of: 48361, chip: false })).toBe('43 matches of 48,361');
    expect(countSentence({ loaded: 1, shown: 1, total: 1, of: 48361, chip: false })).toBe('1 match of 48,361');
    expect(countSentence({ loaded: 30, shown: 30, of: 48361, chip: false })).toBe('The first 30 matches of 48,361');
    expect(countSentence({ loaded: 30, shown: 30, total: 220, of: 48361, chip: false })).toBe('30 of 220 matches');
    expect(countSentence({ loaded: 60, shown: 12, total: 220, of: 48361, chip: true })).toBe('12 with the chip on, of the first 60 of 220 matches');
    expect(moreOf({ loaded: 30, total: 220 })).toEqual({ more: 60, narrow: null });
    expect(moreOf({ loaded: 180, total: 220 })).toEqual({ more: 40, narrow: null });
    expect(moreOf({ loaded: 220, total: 220 })).toEqual({ more: null, narrow: null });
    expect(moreOf({ loaded: 60, total: 3402, kept: 100 })).toEqual({ more: 40, narrow: null });
    expect(moreOf({ loaded: 100, total: 3402, kept: 100 })).toEqual({ more: null, narrow: 'The first 100 of 3,402 are listed: type more of the name, or another word, to narrow it.' });
  });
});

describe('a region of origin (review-w 6)', () => {
  it('typed whole, it is answered with its count; in part or misspelt, the answer names it and its row', async () => {
    const files = platform('files');
    const a = await ask(files, 'cape provinces');
    expect(a.json.narrow).toBeUndefined();
    expect(a.json.hits.length).toBe(100);
    expect(a.json.total).toBe(search(prepare(IDX), 'cape provinces').length);
    expect(a.json.regions).toEqual([{ name: 'Cape Provinces', row: { id: 'southern-africa', label: 'Southern Africa' } }]);
    _forgetIndex();
    const w = await ask(platform('whole'), 'cape provinces');
    expect(w.json.hits.map((h) => h.key)).toEqual(a.json.hits.map((h) => h.key));
    _forgetIndex();
    const typo = await ask(files, 'provinses');
    expect(typo.json.regions?.map((r) => r.name)).toEqual(['Cape Provinces', 'Northern Provinces']);
    expect(regionsTyped('cape provinses', ['Cape Provinces', 'Northern Provinces'])).toEqual(['Cape Provinces']);
    expect(regionsTyped('cape prov', ['Cape Provinces', 'Cape Verde'])).toEqual(['Cape Provinces']);
    expect(regionsTyped('provinces', ['Cape Provinces', 'Mexico Gulf', 'Northern Provinces'])).toEqual(['Cape Provinces', 'Northern Provinces']);
    expect(regionsTyped('cape', ['Cape Provinces', 'Cape Verde'])).toEqual([]);
    expect(regionsTyped('mexico gulf', ['Mexico Gulf'])).toEqual(['Mexico Gulf']);
    expect(regionsTyped('madagascr', ['Madagascar'])).toEqual(['Madagascar']);
    expect(regionSentence({ name: 'Cape Provinces' })).toBe('“Cape Provinces” is a region of origin; in the Origin grouping it is part of');
  }, 60_000);
});

describe('"Most grown" is counted over the full list (review-w 1)', () => {
  it('every genus of the species list is in the counts\' file, counted or refused with its reason, and Quercus, Pinus and Phalaenopsis are under the chip', async () => {
    const { readFileSync } = await import('node:fs');
    const { parseMostGrown, openingGenera } = await import('$lib/ui/ref/most-grown-rule');
    const { genusOf } = await import('$core/names');
    const m = parseMostGrown(readFileSync('scripts/most-grown-genera.txt', 'utf8'));
    const genera = [...new Set(readFileSync('scripts/species-list.txt', 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => genusOf(l.split('\t')[1])))];
    expect(genera.length).toBeGreaterThan(6000);
    const missing = genera.filter((g) => !m.counts.has(g) && !m.refused.has(g) && !m.notChecked.has(g));
    expect(missing).toEqual([]);
    expect(m.notChecked.size).toBe(0);
    const set = new Set(openingGenera(m, genera).genera);
    for (const g of ['Quercus', 'Pinus', 'Phalaenopsis', 'Rosa']) expect(set.has(g), g).toBe(true);
  });
});
