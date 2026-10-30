/**
 * Round eighty-one (S): names growers type, in the catalogue search.
 *
 * 1. A plural in a phrase (review-c 2: "hens and chicks", the usual American name of Sempervivum, answered two Echeverias
 *    and no Sempervivum, whose names are "Hen-and-chicks"): read as its singular too, in common names only, and the key
 *    files answer what the whole index answers, the plural word's key holding none of the singular's species.
 * 2. A word typed whole that is a whole word of a common name before a genus that merely begins with it (review-c 2:
 *    "rose" answered Rosenbergiodendron, Roseodendron and Rosettea first); a genus typed whole keeps its place; and a
 *    one-word common name that species of two genera share ("Rose", on two Cotoneasters) is no evidence, as a generic
 *    noun is not.
 * 3. A hybrid's name as Kew writes it, with the sign, as agent H's index entries carry it ("Mentha × piperita", "× Astrolista
 *    bicarinata"): typed with "×", with "x" or with nothing, the search reads the same words and the hybrid comes first.
 *
 * FAILS on r81base: "hens and chicks" finds no Sempervivum (1); "rose" answers Rosenbergiodendron first, and the shared
 * "Rose" first among the common names (2). Part 3 holds on the base too: it is the reading agent H's sign relies on.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { _forgetIndex, type IndexEntry } from '$lib/server/dossiers';
import { buildProducts } from '$dossier/products';
import { manifestPath, productPath } from '$dossier/manifest';
import { prepare, search, singularStart, readStart, rankedWords } from '$core/search';
import { resetRateLimits } from '$lib/server/sync';
import { gbifPage } from '$core/page-id';
import { GET as searchGet } from '../../src/routes/api/search/+server';
import { synthIndex, reseed } from './helpers/corpus-synth';

reseed(81);
let n = 0;
const sp = (name: string, family: string, o: Partial<IndexEntry> = {}): IndexEntry => {
  n++;
  return { key: gbifPage(9_000_000 + n), gbif: 9_000_000 + n, slug: name.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, ''), name, family, origin: ['Mexico Central'], photos: 10, open: 3, climate: 'ok', ...o } as IndexEntry;
};
const OWN: IndexEntry[] = [
  sp('Echeveria lilacina', 'Crassulaceae', { common: 'Mexican hens-and-chicks', photos: 40 }),
  sp('Sempervivum tectorum', 'Crassulaceae', { common: 'House-leek', commons: ['Hen-and-chickens', 'Common houseleek', 'Hen-and-chicks'], photos: 60 }),
  sp('Sempervivum marmoreum', 'Crassulaceae', { common: 'Houseleek', commons: ['Hen-and-chicks'], photos: 30 }),
  sp('Rosenbergiodendron formosum', 'Rubiaceae', { photos: 8 }),
  sp('Roseodendron chryseum', 'Bignoniaceae', { photos: 5 }),
  sp('Rosa canina', 'Rosaceae', { common: 'Dog rose', commons: ['Canker rose'], photos: 73 }),
  sp('Rosa gallica', 'Rosaceae', { common: 'French rose', photos: 85 }),
  sp('Cotoneaster sylvestrii', 'Rosaceae', { common: 'Hubei Cotoneaster', commons: ['Rose'], photos: 90 }),
  sp('Rosa mollis', 'Rosaceae', { common: 'Soft downy-rose', commons: ['Rose'], photos: 50 }),
  sp('Mentha × piperita', 'Lamiaceae', { common: 'Peppermint', photos: 24 }),
  sp('Mentha aquatica', 'Lamiaceae', { common: 'Water mint', syn: ['Mentha piperita var. aquatica'], photos: 40 }),
  sp('× Astrolista bicarinata', 'Asphodelaceae', { photos: 2 }),
  sp('Astroloba foliolosa', 'Asphodelaceae', { photos: 3 })
];
const IDX: IndexEntry[] = [...(synthIndex(600).idx as unknown as IndexEntry[]).map((e) => { const c = (e.common ?? '').split(', ').filter(Boolean); const out = { ...e } as IndexEntry; delete out.common; if (c.length) out.common = c[0]; if (c.length > 1) out.commons = c.slice(1); return out; }), ...OWN].sort((a, b) => a.name.replace(/×\s*/g, '').localeCompare(b.name.replace(/×\s*/g, '')));

type Built = ReturnType<typeof buildProducts>;
let built: Built;
beforeAll(() => { built = buildProducts(IDX, JSON.stringify(IDX, null, 1), () => new Map(), '2026-10-23T00:00:00Z'); }, 240_000);

function bucket(m: Map<string, string>) {
  const obj = (k: string) => ({ text: async () => m.get(k)!, json: async () => JSON.parse(m.get(k)!), etag: `"${k}:${m.get(k)!.length}"`, body: m.get(k)! });
  return { get: async (k: string) => (m.has(k) ? obj(k) : null), head: async (k: string) => (m.has(k) ? { etag: `"${k}:${m.get(k)!.length}"` } : null) };
}
function platform(kind: 'files' | 'whole') {
  const m = new Map<string, string>();
  if (kind === 'whole') m.set('s/v3/index.json', JSON.stringify(IDX));
  else {
    m.set(manifestPath(), JSON.stringify(built.manifest));
    for (const [nm, body] of built.files) m.set(productPath(built.manifest.files[nm]), body);
    for (const [h, body] of built.stored) m.set(productPath(h), body);
  }
  return { env: { STORE: bucket(m) } } as unknown as App.Platform;
}
const noStatic = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;
async function ask(pl: App.Platform, q: string) {
  resetRateLimits();
  _forgetIndex();
  const url = new URL(`https://cultifolio.com/api/search?q=${encodeURIComponent(q)}&n=100&shape=2`);
  const r = await searchGet({ params: {}, platform: pl, fetch: noStatic, url, request: new Request(url), getClientAddress: () => '192.0.2.81', setHeaders: () => {} } as never);
  const body = await r.text();
  return { status: r.status, body, json: JSON.parse(body) as { hits: IndexEntry[]; kept?: number } };
}
const same = (b: string) => { const j = JSON.parse(b); delete j.kept; return JSON.stringify(j); };
const names = (hs: IndexEntry[]) => hs.map((h) => h.name);

beforeEach(() => { _forgetIndex(); resetRateLimits(); vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());

describe('a plural in a phrase (review-c 2)', () => {
  it('reads as its singular, as the start of a word, and never a word that is no plural', () => {
    expect(singularStart('hens')).toBe('hen');
    expect(singularStart('chicks')).toBe('chick');
    expect(singularStart('bushes')).toBe('bush');
    expect(singularStart('lilies')).toBe('lil');
    expect(singularStart('roses')).toBe('rose');
    expect(singularStart('glasses')).toBe('glass');
    for (const w of ['moss', 'cactus', 'iris', 'and', 'ears'.slice(0, 3)]) expect(singularStart(w)).toBeNull();
    // Always a start of the word typed, so the singular's key files hold every species the word's own hold.
    for (const w of ['hens', 'chicks', 'bushes', 'lilies', 'tomatoes', 'boxes', 'pearls']) expect(w.startsWith(singularStart(w)!)).toBe(true);
    expect(readStart('hens', ['hens', 'and', 'chicks'])).toBe('hen');
    expect(readStart('hens', ['hens'])).toBe('hens'); // one word alone is answered as typed
  });

  it('"hens and chicks" finds the Sempervivums, through the key files as through the whole index', async () => {
    const whole = search(prepare(IDX), 'hens and chicks');
    expect(names(whole)).toEqual(expect.arrayContaining(['Sempervivum tectorum', 'Sempervivum marmoreum', 'Echeveria lilacina'])); // base: Echeveria lilacina alone
    // The plural's own key holds no Sempervivum: the files must be read under the singular's.
    expect(IDX.filter((e) => [e.common, ...(e.commons ?? [])].some((c) => /\bhens/i.test(c ?? ''))).map((e) => e.name)).toEqual(['Echeveria lilacina']);
    const files = await ask(platform('files'), 'hens and chicks');
    const w = await ask(platform('whole'), 'hens and chicks');
    expect(files.status).toBe(200);
    expect(names(files.json.hits)).toEqual(names(whole));
    expect(same(files.body)).toBe(same(w.body));
  });

  it('a scientific name is never read as a plural, and one word alone is as typed', () => {
    const p = prepare(IDX);
    expect(search(p, 'hens').map((h) => h.name)).toEqual(['Echeveria lilacina']);
    expect(rankedWords('Lithops lesliei')).toEqual(['lithops', 'lesliei']);
  });
});

describe('a word typed whole before a genus that only begins with it (review-c 2)', () => {
  it('"rose" lists the roses before Rosenbergiodendron and Roseodendron, and the shared "Rose" after the headlines', () => {
    const hits = names(search(prepare(IDX), 'rose'));
    const at = (x: string) => hits.indexOf(x);
    expect(at('Rosa canina')).toBeGreaterThanOrEqual(0);
    expect(at('Rosa canina')).toBeLessThan(at('Rosenbergiodendron formosum')); // base: Rosenbergiodendron first
    expect(at('Rosa gallica')).toBeLessThan(at('Roseodendron chryseum'));
    // "Rose" alone, a name of a Cotoneaster and of a rose: the Cotoneaster's after the roses headed "… rose". The rose's,
    // whose headline holds the word ("Soft downy-rose"), counts since round eighty-four (review-s S2): a rose a source calls
    // plain "Rose" is a rose.
    expect(at('Rosa canina')).toBeLessThan(at('Cotoneaster sylvestrii')); // base: the Cotoneaster first of the common names
    expect(at('Rosa mollis')).toBeLessThan(at('Cotoneaster sylvestrii'));
  });

  it('a genus typed whole, or still being typed with no such common name, keeps its place', () => {
    const p = prepare(IDX);
    expect(names(search(p, 'rosa'))[0]).toMatch(/^Rosa /);
    expect(names(search(p, 'rosen'))[0]).toBe('Rosenbergiodendron formosum');
    expect(names(search(p, 'sempervivum'))[0]).toMatch(/^Sempervivum /);
  });

  it('the key files answer "rose" as the whole index does', async () => {
    const files = await ask(platform('files'), 'rose');
    const w = await ask(platform('whole'), 'rose');
    expect(same(files.body)).toBe(same(w.body));
  });
});

describe("a hybrid's sign, typed or not (agent H's names)", () => {
  it('"×", "x" and nothing read the same words, and the hybrid comes first', async () => {
    const p = prepare(IDX);
    for (const q of ['Mentha × piperita', 'Mentha x piperita', 'Mentha piperita', 'mentha ×piperita', 'Mentha X piperita']) {
      expect(rankedWords(q)).toEqual(['mentha', 'piperita']);
      expect(names(search(p, q))[0]).toBe('Mentha × piperita');
    }
    for (const q of ['× Astrolista bicarinata', 'x Astrolista bicarinata', 'Astrolista bicarinata', '×Astrolista', 'astrolista']) expect(names(search(p, q))[0]).toBe('× Astrolista bicarinata');
    for (const q of ['Mentha x piperita', '× Astrolista bicarinata']) {
      const files = await ask(platform('files'), q);
      expect(names(files.json.hits)[0]).toBe(q.startsWith('Mentha') ? 'Mentha × piperita' : '× Astrolista bicarinata');
    }
  });
});
