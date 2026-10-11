/**
 * Round sixty-nine, triage-68 N1 (S-F1, R46-3), the species route: an address under an older name two species of the
 * reference hold answers neither, and its 404 names both, without asking GBIF; an address under a name one species
 * shows goes there. FAILED on the base (Cotyledon mammillaris went to Adromischus filicaulis, Aloe variegata to Aloe vera).
 */
import { describe, it, expect } from 'vitest';
import { load } from '../../src/routes/species/[slug]/+page.server';
import type { IndexEntry, Loaded } from '$lib/server/dossiers';

const entry = (key: number, name: string, syn: string[] = [], older: string[] = []): IndexEntry => ({ key, slug: name.toLowerCase().replace(/ /g, '-'), name, photos: 0, open: 0, climate: 'ok', ...(syn.length ? { syn } : {}), ...(older.length ? { older } : {}) });
const idx: IndexEntry[] = [
  entry(2, 'Adromischus filicaulis', ['Cotyledon mammillaris']),
  entry(3, 'Adromischus mammillaris', ['Cotyledon mammillaris']),
  entry(5, 'Aloe vera', ['Aloe a', 'Aloe b', 'Aloe c', 'Aloe d', 'Aloe e', 'Aloe f'], ['Aloe variegata']),
  entry(8, 'Gonialoe variegata', ['Aloe variegata'])
];
const corpus = { at: Date.now(), idx, bySlug: new Map(idx.map((e) => [e.slug, e.key])), corpus: 'r69n', etag: null, fromStore: false, manifest: null, buckets: 32 } as unknown as Loaded;
const noGbif = (async (u: string | URL) => { throw new Error(`asked ${String(u)}`); }) as typeof fetch;
const event = (slug: string) => {
  const url = new URL(`http://x/species/${slug}`);
  return { params: { slug }, platform: undefined, fetch: noGbif, setHeaders: () => {}, cookies: { get: () => undefined }, request: new Request(url), url, getClientAddress: () => '1.2.3.4', locals: { corpus } } as never;
};
const caught = async (p: unknown) => { try { await p; } catch (e) { return e as { status: number; body?: { message: string; species?: { suggest?: Array<{ slug: string }> } }; location?: string }; } throw new Error('no error'); };

describe('N1: the species route under an older name', () => {
  it('Cotyledon mammillaris is a 404 that names both Adromischus, and GBIF is not asked', async () => {
    const e = await caught(load(event('cotyledon-mammillaris')));
    expect(e.status).toBe(404);
    expect(e.body?.message).toBe('Cotyledon mammillaris is an older name of two species of the reference, Adromischus filicaulis and Adromischus mammillaris, so this address leads to neither');
    expect(e.body?.species?.suggest?.map((s) => s.slug)).toEqual(['adromischus-filicaulis', 'adromischus-mammillaris']);
  });
  it('Aloe variegata goes to Gonialoe variegata, which shows it', async () => {
    const e = await caught(load(event('aloe-variegata')));
    expect(e.status).toBe(302);
    expect(e.location).toBe('/species/gonialoe-variegata?was=Aloe%20variegata');
  });
});
