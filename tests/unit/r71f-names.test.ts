/**
 * Round seventy-one, agent F (REVIEW-TRIAGE-70, pages; S-F3, S-F8, S-F11): an older name that is another species'
 * accepted name, an address resolved through a variety, and one author under two holders. Each fails on r71base unless
 * marked a guard.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { load } from '../../src/routes/species/[slug]/+page.server';
import { sharedNameMessage, cachedMatch } from '$lib/server/synonyms';
import { workerKey } from '$lib/server/worker-cache';
import type { IndexEntry, Loaded } from '$lib/server/dossiers';

const entry = (key: number, name: string, syn: string[] = []): IndexEntry => ({ key, slug: name.toLowerCase().replace(/ /g, '-'), name, photos: 0, open: 0, climate: 'ok', ...(syn.length ? { syn } : {}) });
// As the live index and dossiers hold them (2026-10-15), cut to the case.
const idx: IndexEntry[] = [entry(2, 'Annona montana', ['Annona marcgravii', 'Annona muricata']), entry(5, 'Annona muricata', ['Annona macrocarpa']), entry(3952140, 'Trichocereus macrogonus', ['Cereus macrogonus'])];
const synonyms: Record<number, string[]> = { 2: ['Annona marcgravii Mart.', 'Annona muricata Vell.', 'Annona pisonis Mart.'], 5: ['Annona macrocarpa Wercklé'], 3952140: ['Cereus macrogonus Salm-Dyck'] };
const FIXTURE = JSON.parse(readFileSync('fixtures/dossiers/s/v2/5384013.json', 'utf8')) as { key: number; slug: string; name: { scientific: string; synonyms: string[] } };
const dossierOf = (e: IndexEntry) => ({ ...FIXTURE, key: e.key, slug: e.slug, name: { ...FIXTURE.name, scientific: e.name, genus: e.name.split(' ')[0], synonyms: synonyms[e.key] ?? [] } });
const STORE = { get: async (path: string) => { const e = idx.find((x) => path.endsWith(`/${x.key}.json`)); return e ? { json: async () => dossierOf(e) } : null; } };
const corpus = { at: Date.now(), idx, bySlug: new Map(idx.map((e) => [e.slug, e.key])), corpus: 'r71f', etag: null, fromStore: true, manifest: null, buckets: 32 } as unknown as Loaded;
const noGbif = (async (u: string | URL) => { throw new Error(`asked ${String(u)}`); }) as typeof fetch;
/** A Worker cache holding GBIF's answer for "Echinopsis pachanoi", as the redirect leaves it (GBIF's match, 2026-10-15). */
function cacheWith(name: string, body: unknown) {
  const key = workerKey('match', { name: name.toLowerCase() }).url;
  return { default: { match: async (r: Request) => (r.url === key ? new Response(JSON.stringify(body)) : undefined), put: async () => {} } };
}
const PACHANOI = { usageKey: 5622352, acceptedUsageKey: 11093098, canonicalName: 'Echinopsis pachanoi', status: 'SYNONYM', matchType: 'EXACT', species: 'Trichocereus macrogonus', speciesKey: 3952140 };
const event = (slug: string, search = '', caches?: unknown) => {
  const url = new URL(`http://x/species/${slug}${search}`);
  return { params: { slug }, platform: { env: { STORE }, ...(caches ? { caches } : {}) }, fetch: noGbif, setHeaders: () => {}, cookies: { get: () => undefined }, request: new Request(url), url, getClientAddress: () => '1.2.3.4', locals: { corpus } } as never;
};
type Data = { was: string | null; wasShared?: Array<{ slug: string }>; wasAcceptedBy?: Array<{ slug: string }>; wasBelow?: boolean; namedElsewhere?: Array<{ name: string; slug: string; authors: string[] }> };

describe('S-F3: an older name that is another species\' accepted name here', () => {
  it('?was=Annona muricata on Annona montana names the soursop\'s page, never "GBIF accepts this species as"', async () => {
    const data = (await load(event('annona-montana', '?was=Annona%20muricata'))) as Data;
    expect(data.was).toBe('Annona muricata');
    expect(data.wasAcceptedBy?.map((x) => x.slug)).toEqual(['annona-muricata']);
  });
  it('the record\'s older name is said with its author, apart from "Also known as"', async () => {
    const data = (await load(event('annona-montana'))) as Data;
    expect(data.namedElsewhere).toEqual([{ name: 'Annona muricata', slug: 'annona-muricata', authors: ['Vell.'] }]);
  });
  it('guard: an older name no species here is accepted under is no one else\'s', async () => {
    const data = (await load(event('annona-montana', '?was=Annona%20marcgravii'))) as Data;
    expect(data.was).toBe('Annona marcgravii');
    expect(data.wasAcceptedBy ?? []).toEqual([]);
    expect((await load(event('annona-muricata'))) as Data).toMatchObject({ namedElsewhere: [] });
  });
});

describe('S-F8: an address resolved through a variety says why, from GBIF\'s cached answer only', () => {
  it('/species/echinopsis-pachanoi landing on Trichocereus macrogonus says so', async () => {
    const data = (await load(event('trichocereus-macrogonus', '?was=Echinopsis%20pachanoi', cacheWith('Echinopsis pachanoi', PACHANOI)))) as Data;
    expect(data.was).toBe('Echinopsis pachanoi');
    expect(data.wasBelow).toBe(true);
  });
  it('guard: with no cached answer, or one for another species, a link written by hand says nothing', async () => {
    expect(((await load(event('trichocereus-macrogonus', '?was=Echinopsis%20pachanoi'))) as Data).was).toBeNull();
    expect(((await load(event('annona-montana', '?was=Echinopsis%20pachanoi', cacheWith('Echinopsis pachanoi', PACHANOI)))) as Data).was).toBeNull();
    expect(await cachedMatch(undefined, 'Echinopsis pachanoi')).toBeNull();
  });
});

describe('S-F11: one author under two holders is one name GBIF files under both', () => {
  it('Vernonia praealta (L.) Michx.', () => {
    const m = sharedNameMessage('Vernonia praealta', [{ name: 'Vernonia gigantea', authors: ['(L.) Michx.'] }, { name: 'Vernonia noveboracensis', authors: ['(L.) Michx.'] }]);
    expect(m).toBe('Vernonia praealta is an older name of two species of the reference, so this address leads to neither: Vernonia praealta (L.) Michx., now Vernonia gigantea; Vernonia praealta (L.) Michx., now Vernonia noveboracensis. GBIF files Vernonia praealta (L.) Michx. under both Vernonia gigantea and Vernonia noveboracensis: one name, not two');
  });
  it('guard: two authors read as before', () => {
    expect(sharedNameMessage('Xx yy', [{ name: 'Aa yy', authors: ['L.'] }, { name: 'Bb zz', authors: [] }])).toBe('Xx yy is an older name of two species of the reference, so this address leads to neither: Xx yy L., now Aa yy; Xx yy, now Bb zz');
  });
});
