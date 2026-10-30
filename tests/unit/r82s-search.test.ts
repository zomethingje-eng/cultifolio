/**
 * Round eighty-two (S): the search's order for a species' own headline and for a genus word (review 1's 2).
 *
 * 1. A species whose headline common name is exactly the query comes first: "peppermint" put Mentha × piperita, headed
 *    "Peppermint", 18th of 19 on the live site, after eleven Eucalyptus, because one Eucalyptus is called "Peppermint" among
 *    its other names and round eighty-one's rule then set every one-word "Peppermint" back. So too "rosemary" (Salvia
 *    rosmarinus 28th, after a Strumpfia called "Rosemary" among its names). The shared name that is no headline is still
 *    set back ("rose", round eighty-one's case, below).
 * 2. A genus word alone lists the species of that genus by how many English names the sources give them, then by their
 *    photographs, then the alphabet, where it was the alphabet alone ("echeveria" put E. elegans past the first thirty);
 *    the same for the genus still being typed or misspelt when one genus answers; another genus that begins with the word
 *    after it ("aloe" is Aloe before Aloestrela); several genera begun and none typed whole keep the alphabet ("e").
 * 3. The key files answer every one of these as the whole index does.
 *
 * FAILS on r82base: Mentha × piperita and Salvia rosmarinus are not first (1); Echeveria acutifolia, the alphabet's
 * first, leads "echeveria", "echev" and "echevaria", and Aloestrela's species sit where the alphabet puts them (2).
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { _forgetIndex, type IndexEntry } from '$lib/server/dossiers';
import { buildProducts } from '$dossier/products';
import { manifestPath, productPath } from '$dossier/manifest';
import { prepare, search } from '$core/search';
import { resetRateLimits } from '$lib/server/sync';
import { gbifPage } from '$core/page-id';
import { GET as searchGet } from '../../src/routes/api/search/+server';
import { synthIndex, reseed } from './helpers/corpus-synth';

reseed(82);
let n = 0;
const sp = (name: string, family: string, o: Partial<IndexEntry> = {}): IndexEntry => {
  n++;
  return { key: gbifPage(9_100_000 + n), gbif: 9_100_000 + n, slug: name.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, ''), name, family, origin: ['Mexico Central'], photos: 10, open: 3, climate: 'ok', ...o } as IndexEntry;
};
// The live index's names for "peppermint" and "rosemary", cut to what decides the order.
const OWN: IndexEntry[] = [
  sp('Mentha × piperita', 'Lamiaceae', { common: 'Peppermint', commons: ['Black peppermint', 'Curly mint'], photos: 24 }),
  sp('Eucalyptus dives', 'Myrtaceae', { common: 'Broad-leaved peppermint', commons: ['Peppermint'], photos: 60 }),
  sp('Eucalyptus exserta', 'Myrtaceae', { common: 'Queensland peppermint', photos: 70 }),
  sp('Eucalyptus radiata', 'Myrtaceae', { common: 'Narrow-leaf peppermint gum', photos: 80 }),
  sp('Eucalyptus amygdalina', 'Myrtaceae', { common: 'Black peppermint', photos: 50 }),
  sp('Agonis flexuosa', 'Myrtaceae', { common: 'Western Australian myrtle', commons: ['Willow-peppermint'], photos: 40 }),
  sp('Salvia rosmarinus', 'Lamiaceae', { common: 'Rosemary', commons: ['Common rosemary'], photos: 30 }),
  sp('Strumpfia maritima', 'Rubiaceae', { common: 'Pride-of-Big-Pine', commons: ['Rosemary'], photos: 20 }),
  sp('Westringia rigida', 'Lamiaceae', { common: 'Stiff westringia', commons: ['Native rosemary'], photos: 90 }),
  // "Rose" alone, a name of a Cotoneaster and of a rose, a headline of neither (round eighty-one's case).
  sp('Rosa canina', 'Rosaceae', { common: 'Dog rose', photos: 73 }),
  sp('Cotoneaster sylvestrii', 'Rosaceae', { common: 'Hubei Cotoneaster', commons: ['Rose'], photos: 90 }),
  sp('Rosa mollis', 'Rosaceae', { common: 'Soft downy-rose', commons: ['Rose'], photos: 50 }),
  // A genus whose grown species have English names, and obscure ones photographed more.
  sp('Echeveria acutifolia', 'Crassulaceae', { photos: 40 }),
  sp('Echeveria affinis', 'Crassulaceae', { photos: 17 }),
  sp('Echeveria agavoides', 'Crassulaceae', { common: 'Molded-wax', commons: ['Lipstick echeveria'], photos: 37 }),
  sp('Echeveria elegans', 'Crassulaceae', { common: 'Mexican snowball', commons: ['Mexican gem', 'White Mexican rose', 'Hen and chicks'], photos: 26 }),
  sp('Echeveria nodulosa', 'Crassulaceae', { photos: 101 }),
  sp('Echeveria setosa', 'Crassulaceae', { common: 'Mexican firecracker', photos: 14 }),
  sp('Aloe vera', 'Asphodelaceae', { common: 'Barbados aloe', commons: ['True aloe', 'Medicinal aloe'], photos: 90 }),
  sp('Aloe divaricata', 'Asphodelaceae', { photos: 105 }),
  sp('Aloe abyssicola', 'Asphodelaceae', { photos: 3 }),
  sp('Aloestrela suzannae', 'Asphodelaceae', { common: "Suzanne's aloe", syn: ['Aloe suzannae'], photos: 20 }),
  sp('Eriosyce senilis', 'Cactaceae', { photos: 99 }),
  sp('Espostoa lanata', 'Cactaceae', { common: 'Peruvian old man cactus', photos: 99 })
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
  const r = await searchGet({ params: {}, platform: pl, fetch: noStatic, url, request: new Request(url), getClientAddress: () => '192.0.2.82', setHeaders: () => {} } as never);
  const body = await r.text();
  return { status: r.status, body, json: JSON.parse(body) as { hits: IndexEntry[]; kept?: number } };
}
const same = (b: string) => { const j = JSON.parse(b); delete j.kept; return JSON.stringify(j); };
const names = (hs: IndexEntry[]) => hs.map((h) => h.name);
const OWNED = new Set(OWN.map((e) => e.name));
/** The test's own species of an answer, in its order (the synthetic six hundred hold Aloes and Echeverias of their own). */
const own = (xs: string[]) => xs.filter((x) => OWNED.has(x));

beforeEach(() => { _forgetIndex(); resetRateLimits(); vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());

describe("a species' own headline typed (review 1's 2)", () => {
  it('"peppermint" is Mentha × piperita first, whose headline it is, though a Eucalyptus is called "Peppermint" too', () => {
    const hits = names(search(prepare(IDX), 'peppermint'));
    expect(hits[0]).toBe('Mentha × piperita'); // base: after every "… peppermint" headline
    // The Eucalyptus that holds "Peppermint" among its other names, and whose headline holds the word, is a peppermint
    // (round eighty-four, review-s S2: `headlineHolds`), after Mentha × piperita and before the headlines merely holding it.
    expect(hits.indexOf('Eucalyptus dives')).toBeLessThan(hits.indexOf('Eucalyptus amygdalina'));
  });

  it('"rosemary" is Salvia rosmarinus first; "Rose", a headline of neither species, is still set back', () => {
    const p = prepare(IDX);
    expect(names(search(p, 'rosemary'))[0]).toBe('Salvia rosmarinus'); // base: Westringia rigida first
    const rose = names(search(p, 'rose'));
    expect(rose.indexOf('Rosa canina')).toBeLessThan(rose.indexOf('Cotoneaster sylvestrii'));
    // Rosa mollis, "Soft downy-rose", which a source also calls "Rose", is a rose: since round eighty-four (review-s S2) its
    // exact name counts, its headline holding the word; the Cotoneaster's does not.
    expect(rose.indexOf('Rosa mollis')).toBeLessThan(rose.indexOf('Rosa canina'));
  });
});

describe('a genus word alone (review 1\'s 2)', () => {
  const ech = ['Echeveria elegans', 'Echeveria agavoides', 'Echeveria setosa', 'Echeveria nodulosa', 'Echeveria acutifolia', 'Echeveria affinis'];
  it('lists the genus by its species\' English names, then their photographs, then the alphabet', () => {
    const p = prepare(IDX);
    // elegans 4 names, agavoides 2, setosa 1; then nodulosa 101 photographs, acutifolia 40, affinis 17.
    expect(own(names(search(p, 'echeveria')))).toEqual(ech); // base: the alphabet
    // The genus still being typed, typed with a capital, or misspelt, where one genus answers: the same order.
    for (const q of ['echev', 'Echeveria', 'echevaria']) expect(own(names(search(p, q))), q).toEqual(ech);
  });

  it('a genus that begins with the word comes after the genus typed; several genera begun keep the alphabet', () => {
    const p = prepare(IDX);
    const aloe = own(names(search(p, 'aloe')));
    expect(aloe.slice(0, 3)).toEqual(['Aloe vera', 'Aloe divaricata', 'Aloe abyssicola']); // base: abyssicola, divaricata, vera
    expect(aloe.indexOf('Aloestrela suzannae')).toBeGreaterThan(aloe.indexOf('Aloe abyssicola'));
    // "e": Echeveria, Eriosyce, Espostoa, Eucalyptus … begun, none typed whole: genus by genus in the alphabet, as before.
    const e = names(search(p, 'e')).filter((x) => /^(?:Echeveria|Eriosyce|Espostoa|Eucalyptus) /.test(x));
    expect(e).toEqual([...e].sort((a, b) => a.localeCompare(b)));
    // Two words are no genus word: the alphabet's order among the species of the name typed is untouched.
    expect(own(names(search(p, 'echeveria a'))).slice(0, 3)).toEqual(['Echeveria acutifolia', 'Echeveria affinis', 'Echeveria agavoides']);
  });

  it('the key files answer each as the whole index does', async () => {
    for (const q of ['peppermint', 'rosemary', 'rose', 'echeveria', 'echev', 'echevaria', 'aloe', 'Echeveria elegans']) {
      const files = await ask(platform('files'), q);
      const w = await ask(platform('whole'), q);
      expect(files.status, q).toBe(200);
      expect(names(files.json.hits), q).toEqual(names(search(prepare(IDX), q)).slice(0, 100));
      expect(same(files.body), q).toBe(same(w.body));
    }
  });
});
