/**
 * Round seventy, triage-69 F1, N2 (the 404's "none of them") and N3 (S-F1, S-F3, S-F7): an older name two species or
 * more of the reference hold never redirects, whichever of them shows it, and its 404 names each holder with the author
 * under which its record holds the name; a hyphenated older name is found by its address's slug; the `?was=` line says
 * "the GBIF backbone accepts this species as" only of a name one species holds. The cases are the live index's and the
 * live dossiers' (cultifolio.com, 12 October 2026). Each case FAILED on the base unless it says "guard".
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { load } from '../../src/routes/species/[slug]/+page.server';
import { indexMaps, ambiguousSynonym, type IndexEntry, type Loaded } from '$lib/server/dossiers';
import { synonymInIndex, authorsOf, sharedNameMessage } from '$lib/server/synonyms';
import { gbifPage } from '../../src/lib/core/page-id';

const entry = (key: number, name: string, syn: string[] = [], older: string[] = []): IndexEntry => ({ key: gbifPage(key), gbif: key, slug: name.toLowerCase().replace(/ /g, '-'), name, photos: 0, open: 0, climate: 'ok', ...(syn.length ? { syn } : {}), ...(older.length ? { older } : {}) });
// As the live index holds them (other names cut to what the cases need).
const idx: IndexEntry[] = [
  entry(2777724, 'Aloe vera', ['Aloe barbadensis', 'Aloe chinensis', 'Aloe elongata', 'Aloe flava', 'Aloe indica', 'Aloe lanzae'], ['Aloe variegata', 'Aloe vulgaris']),
  entry(2882580, 'Arctostaphylos uva-ursi', ['Arbutus uva-ursi', 'Daphnidostaphylis fendleriana', 'Mairania uva-ursi', 'Uva-ursi buxifolia', 'Uva-ursi procumbens', 'Arctostaphylos officinalis']),
  entry(2985888, 'Dudleya farinosa', ['Cotyledon compacta', 'Cotyledon eastwoodiae', 'Cotyledon farinosa', 'Cotyledon farinulenta', 'Cotyledon lingula', 'Cotyledon septentrionalis'], ['Echeveria compacta', 'Echeveria farinosa']),
  entry(2985894, 'Dudleya pulverulenta', ['Cotyledon peacockii', 'Cotyledon pulverulenta', 'Echeveria argentea', 'Echeveria farinosa', 'Echeveria peacockii', 'Echeveria pulverulenta'], ['Sedum pulverulentum']),
  entry(3183335, 'Syzygium aqueum', ['Eugenia aquea', 'Eugenia malaccensis']),
  entry(3183534, 'Syzygium jambos', ['Caryophyllus jambos', 'Eugenia jambos', 'Eugenia malaccensis']),
  entry(3184509, 'Syzygium malaccense', ['Caryophyllus malaccensis', 'Eugenia malaccensis']),
  entry(9528502, 'Gonialoe variegata', ['Aloe variegata', 'Aloe punctata'])
];
/** Each holder's stored synonyms as its live dossier gives them (the name's own records). */
const synonyms: Record<number, string[]> = {
  2777724: ['Aloe barbadensis Mill.', 'Aloe variegata Forssk.'],
  2882580: ['Arbutus uva-ursi L.'],
  2985888: ['Cotyledon farinosa (Lindl.) Baker', 'Echeveria farinosa Lindl.'],
  2985894: ['Echeveria argentea Lem.', 'Echeveria farinosa VanHoutte', 'Dudleya pulverulenta subsp. typica Moran'],
  3183335: ['Eugenia malaccensis Lour.'],
  // Syzygium jambos' record holds the name only below species and once with no author: named without one.
  3183534: ['Eugenia malaccensis f. cericarpa (O.Deg.) H.St.John', 'Eugenia malaccensis'],
  3184509: ['Eugenia malaccensis L.'],
  9528502: ['Aloe variegata L.', 'Aloe variegata var. haworthii A.Berger']
};
const FIXTURE = JSON.parse(readFileSync('fixtures/dossiers/s/v3/k2735933.json', 'utf8')) as { key: string; slug: string; name: { scientific: string; synonyms: string[] } };
const dossierOf = (e: IndexEntry) => ({ ...FIXTURE, key: e.key, ids: { ...(FIXTURE as { ids?: object }).ids, gbif: e.gbif }, slug: e.slug, name: { ...FIXTURE.name, scientific: e.name, genus: e.name.split(' ')[0], synonyms: synonyms[e.gbif!] ?? [] } });
const STORE = { get: async (path: string) => { const e = idx.find((x) => path.endsWith(`/${x.key}.json`)); return e ? { json: async () => dossierOf(e) } : null; } };
const corpus = { at: Date.now(), idx, bySlug: new Map(idx.map((e) => [e.slug, e.key])), corpus: 'r70n', etag: null, fromStore: true, manifest: null, buckets: 32 } as unknown as Loaded;
const noGbif = (async (u: string | URL) => { throw new Error(`asked ${String(u)}`); }) as typeof fetch;
const event = (slug: string, search = '', store: unknown = STORE) => {
  const url = new URL(`http://x/species/${slug}${search}`);
  return { params: { slug }, platform: { env: { STORE: store } }, fetch: noGbif, setHeaders: () => {}, cookies: { get: () => undefined }, request: new Request(url), url, getClientAddress: () => '1.2.3.4', locals: { corpus } } as never;
};
const caught = async (p: unknown) => { try { await p; } catch (e) { return e as { status: number; body?: { message: string; species?: { suggest?: Array<{ slug: string }> } }; location?: string }; } throw new Error('no error'); };

describe('F1: an older name two species hold never redirects, whichever shows it', () => {
  it('Echeveria farinosa (shown by Dudleya pulverulenta, held for the search by D. farinosa) is a 404 naming each holder with its author', async () => {
    const e = await caught(load(event('echeveria-farinosa')));
    expect(e.status).toBe(404); // base: 302 to /species/dudleya-pulverulenta?was=Echeveria%20farinosa
    expect(e.body?.message).toBe('Echeveria farinosa is an older name of two species of the reference, so this address leads to neither: Echeveria farinosa Lindl., now Dudleya farinosa; Echeveria farinosa VanHoutte, now Dudleya pulverulenta');
    // The search's order: the species that keeps the epithet first.
    expect(e.body?.species?.suggest?.map((s) => s.slug)).toEqual(['dudleya-farinosa', 'dudleya-pulverulenta']);
  });
  it('Aloe variegata (shown by Gonialoe variegata, held for the search by Aloe vera) is a 404 naming both', async () => {
    const e = await caught(load(event('aloe-variegata')));
    expect(e.status).toBe(404); // base: 302 to /species/gonialoe-variegata
    expect(e.body?.message).toBe('Aloe variegata is an older name of two species of the reference, so this address leads to neither: Aloe variegata L., now Gonialoe variegata; Aloe variegata Forssk., now Aloe vera');
  });
  it('the maps: no shared name in bySynonym, every holder in ambiguous', () => {
    const m = indexMaps(idx);
    expect(m.bySynonym.has('echeveria farinosa')).toBe(false);
    expect(m.bySynonym.has('aloe variegata')).toBe(false);
    expect(ambiguousSynonym(idx, 'Echeveria farinosa')?.map((e) => e.name)).toEqual(['Dudleya farinosa', 'Dudleya pulverulenta']);
  });
  it('guard: a name one species holds still redirects (Echeveria argentea to Dudleya pulverulenta)', async () => {
    const e = await caught(load(event('echeveria-argentea')));
    expect(e.status).toBe(302);
    expect(e.location).toBe('/species/dudleya-pulverulenta?was=Echeveria%20argentea');
  });
  it('a record that cannot be read names its holder without an author, and the 404 is kept by no one', async () => {
    const headers: Record<string, string> = {};
    const half = { get: async (path: string) => (path.endsWith('/g2985894.json') ? null : STORE.get(path)) };
    const ev = event('echeveria-farinosa', '', half) as unknown as { setHeaders: (h: Record<string, string>) => void };
    ev.setHeaders = (h) => Object.assign(headers, h);
    const e = await caught(load(ev as never));
    expect(e.body?.message).toBe('Echeveria farinosa is an older name of two species of the reference, so this address leads to neither: Echeveria farinosa Lindl., now Dudleya farinosa; Echeveria farinosa, now Dudleya pulverulenta');
    expect(headers['cache-control']).toBe('no-store');
  });
});

describe('N2 (S-F7): three holders or more are "none of them", never "neither"', () => {
  it('Eugenia malaccensis names its three Syzygium, each with the author its record gives, and none for the one without', async () => {
    const e = await caught(load(event('eugenia-malaccensis')));
    expect(e.status).toBe(404);
    // base: "… Syzygium aqueum, Syzygium jambos and Syzygium malaccense, so this address leads to neither"
    expect(e.body?.message).toBe('Eugenia malaccensis is an older name of three species of the reference, so this address leads to none of them: Eugenia malaccensis L., now Syzygium malaccense; Eugenia malaccensis Lour., now Syzygium aqueum; Eugenia malaccensis, now Syzygium jambos');
  });
  it('the sentence alone: two is "neither", three "none of them", two authors of one holder both said', () => {
    expect(sharedNameMessage('Xx yy', [{ name: 'Aa yy', authors: ['L.'] }, { name: 'Bb zz', authors: [] }])).toBe('Xx yy is an older name of two species of the reference, so this address leads to neither: Xx yy L., now Aa yy; Xx yy, now Bb zz');
    expect(sharedNameMessage('Xx yy', [{ name: 'Aa yy', authors: ['DC.', 'L.'] }, { name: 'Bb zz', authors: [] }, { name: 'Cc ww', authors: [] }])).toMatch(/^Xx yy is an older name of three species of the reference, so this address leads to none of them: Xx yy DC\. and Xx yy L\., now Aa yy; /);
  });
});

describe('F1: authors come from the record, never guessed', () => {
  it('the text after the name in the record, once; a variety record is not the binomial\'s', () => {
    expect(authorsOf('Echeveria farinosa', ['Echeveria farinosa Lindl.'])).toEqual(['Lindl.']);
    expect(authorsOf('Eugenia malaccensis', ['Eugenia malaccensis f. cericarpa (O.Deg.) H.St.John', 'Eugenia malaccensis'])).toEqual([]);
    expect(authorsOf('Albuca exuviata', ['Albuca exuviata (Jacq.) Ker Gawl.', 'Albuca exuviata (Jacq.) KerGawl.'])).toEqual(['(Jacq.) Ker Gawl.']);
    expect(authorsOf('Murraya exotica', ['Murraya exotica L.', 'Murraya exotica DC.'])).toEqual(['L.', 'DC.']);
    expect(authorsOf('Aloe variegata', ['Aloe variegatissima Haw.'])).toEqual([]);
  });
});

describe('N3 (S-F3): a hyphenated older name is found by its slug', () => {
  it('arbutus-uva-ursi goes to Arctostaphylos uva-ursi, saying the name as the index writes it', async () => {
    expect((await synonymInIndex(undefined, noGbif, 'arbutus-uva-ursi', corpus))?.slug).toBe('arctostaphylos-uva-ursi'); // base: null
    const e = await caught(load(event('arbutus-uva-ursi')));
    expect(e.status).toBe(302); // base: a 404 after asking GBIF for "Arbutus uva ursi"
    expect(e.location).toBe('/species/arctostaphylos-uva-ursi?was=Arbutus%20uva-ursi');
  });
  it('a shared hyphenated name is found by its slug too, and named as written', () => {
    const two = [entry(1, 'Aa one', ['Xx uva-ursi']), entry(2, 'Bb two', [], ['Xx uva-ursi'])];
    expect(ambiguousSynonym(two, 'xx-uva-ursi')?.map((e) => e.gbif).sort()).toEqual([1, 2]);
    expect(indexMaps(two).sharedName.get('xx-uva-ursi')).toBe('Xx uva-ursi');
  });
});

describe('F1: the ?was= line says "the GBIF backbone accepts this species as" only of a name one species holds', () => {
  it('Echeveria farinosa on Dudleya pulverulenta names Dudleya farinosa as another holder', async () => {
    const data = (await load(event('dudleya-pulverulenta', '?was=Echeveria%20farinosa'))) as { was: string | null; wasShared?: Array<{ slug: string }> };
    expect(data.was).toBe('Echeveria farinosa');
    expect(data.wasShared?.map((x) => x.slug)).toEqual(['dudleya-farinosa']); // base: no such field
  });
  it('guard: Echeveria argentea, which only this species holds, names no other', async () => {
    const data = (await load(event('dudleya-pulverulenta', '?was=Echeveria%20argentea'))) as { was: string | null; wasShared?: unknown[] };
    expect(data.was).toBe('Echeveria argentea');
    expect(data.wasShared ?? []).toEqual([]);
  });
});
