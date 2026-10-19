/**
 * Round seventy-eight (I): the Worker finds a page by its id, and by its own GBIF key as an alias. The card files hold
 * `@<GBIF key>` beside each page's address and card; the API answers a page's id, and moves a GBIF key to it; a GBIF
 * answer (an older name GBIF resolves) finds its page by the alias. Each case FAILED on the base, where a page's key was
 * its GBIF key and nothing held an id.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { corpusNow, _forgetIndex, getDossier, resolveSlug, type IndexEntry } from '$lib/server/dossiers';
import { buildProducts } from '$dossier/products';
import { manifestPath, productPath } from '$dossier/manifest';
import { buildCardFiles, indexMaps } from '$dossier/lookups';
import { dossierPath } from '$dossier/schema';
import { filesLookup, indexLookup, lookupOf } from '$lib/server/lookup';
import { synonymAsk } from '$lib/server/synonyms';
import { resetRateLimits } from '$lib/server/sync';
import { GET as dossierGet } from '../../src/routes/api/dossier/[key]/+server';

const template = JSON.parse(readFileSync('fixtures/dossiers/s/v3/k2735933.json', 'utf8'));
const e = (key: IndexEntry['key'], gbif: number, name: string, o: Partial<IndexEntry> = {}): IndexEntry => ({ key, gbif, slug: name.toLowerCase().replace(/ /g, '-'), name, family: 'Cactaceae', origin: ['Chile North'], photos: 1, open: 1, climate: 'ok', ...o });
const IDX: IndexEntry[] = [
  e('k326701', 2746231, 'Babiana geniculata', { family: 'Iridaceae' }),
  e('g3574112', 3574112, 'Ceropegia nigra', { family: 'Apocynaceae', syn: ['Ceropegia melanops'] }),
  e('k2735933', 5384013, 'Copiapoa cinerea', { near: ['k326701'] })
];
const doc = (x: IndexEntry) => JSON.stringify({ ...template, key: x.key, slug: x.slug, ids: { ...template.ids, gbif: x.gbif }, name: { ...template.name, scientific: x.name } });
function platform() {
  const p = buildProducts(IDX, JSON.stringify(IDX, null, 1), () => new Map(), '2026-10-19T00:00:00Z');
  const m = new Map<string, string>([[manifestPath(), JSON.stringify(p.manifest)], ...[...p.files].map(([n, b]) => [productPath(p.manifest.files[n]), b] as [string, string]), ...[...p.stored].map(([h, b]) => [productPath(h), b] as [string, string]), ...IDX.map((x) => [dossierPath(x.key), doc(x)] as [string, string])]);
  const store = { get: async (k: string) => (m.has(k) ? { text: async () => m.get(k)!, json: async () => JSON.parse(m.get(k)!), etag: `"${k}"` } : null), head: async (k: string) => (m.has(k) ? { etag: `"${k}"` } : null) };
  return { env: { STORE: store } } as unknown as App.Platform;
}
const noStatic = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;
const api = async (p: App.Platform, key: string) => {
  resetRateLimits();
  const url = new URL(`https://cultifolio.com/api/dossier/${key}`);
  try { return await dossierGet({ params: { key }, platform: p, fetch: noStatic, url, request: new Request(url), getClientAddress: () => '192.0.2.78', setHeaders: () => {} } as never); } catch (x) { return new Response(null, { status: (x as { status: number }).status }); }
};
beforeEach(() => _forgetIndex());

describe('the card files', () => {
  it('hold each page\'s own GBIF key as `@<key>` → its id, beside its address and its card', () => {
    const files = [...buildCardFiles(IDX).values()];
    const all = Object.assign({}, ...files) as Record<string, unknown>;
    expect(all['@2746231']).toBe('k326701');
    expect(all['@3574112']).toBe('g3574112');
    expect(all['babiana-geniculata']).toBe('k326701');
    expect(all['#k2735933']).toMatchObject({ key: 'k2735933', gbif: 5384013, near: ['k326701'] });
    expect(Object.keys(all).filter((k) => k.startsWith('@')).length).toBe(3);
  });
});

describe('the lookups, through the files and through the index alike', () => {
  it('a GBIF key finds its page; an id is not a GBIF key and an address is not an alias', async () => {
    const p = platform();
    const c = await corpusNow(p, noStatic);
    for (const look of [filesLookup(c, p, noStatic), indexLookup(IDX)]) {
      expect((await look.gbif(2746231))?.key).toBe('k326701');
      expect((await look.gbif(3574112))?.slug).toBe('ceropegia-nigra');
      expect(await look.gbif(326701)).toBeNull(); // Kew's number is not GBIF's
      expect(await look.gbif(1)).toBeNull();
      expect(await look.slug('@2746231')).toBeNull();
      expect(await look.slug('copiapoa-cinerea')).toBe('k2735933');
      expect((await look.species('k2735933'))?.gbif).toBe(5384013);
    }
    expect(indexMaps(IDX).byGbif.get(5384013)?.key).toBe('k2735933');
  });
  it('a dossier is read under its id; a slug resolves to the id', async () => {
    const p = platform();
    expect(await resolveSlug(p, noStatic, 'babiana-geniculata')).toBe('k326701');
    expect((await getDossier(p, noStatic, 'k326701'))?.ids.gbif).toBe(2746231);
  });
});

describe('/api/dossier/<key>', () => {
  it('answers a page\'s id with its dossier, kept by no cache', async () => {
    const r = await api(platform(), 'k326701');
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(((await r.json()) as { key: string }).key).toBe('k326701');
  });
  it('moves a page\'s own GBIF key to its id, for a moment only (an id can move by the rule); the query goes with it', async () => {
    const p = platform();
    const r = await dossierGet({ params: { key: '2746231' }, platform: p, fetch: noStatic, url: new URL('https://cultifolio.com/api/dossier/2746231?c=abc'), request: new Request('https://cultifolio.com/api/dossier/2746231?c=abc'), getClientAddress: () => '192.0.2.79', setHeaders: () => {} } as never);
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe('/api/dossier/k326701?c=abc');
    expect(r.headers.get('cache-control')).toBe('no-store');
  });
  it('a GBIF key no page holds, or an id no page has, is no page; anything else is a malformed key', async () => {
    const p = platform();
    expect((await api(p, '326701')).status).toBe(404);
    expect((await api(p, 'k2746231')).status).toBe(404);
    expect((await api(p, 'g2746231')).status).toBe(404);
    expect((await api(p, 'x12')).status).toBe(400);
    expect((await api(p, 'K326701')).status).toBe(400);
  });
});

describe('an older name GBIF resolves finds its page by the GBIF key GBIF answers with', () => {
  it('"Ceropegia melanopsis" (no older name here) is GBIF\'s synonym of key 3574112: the page g3574112', async () => {
    const p = platform();
    const c = await corpusNow(p, noStatic);
    const gbif = (async () => new Response(JSON.stringify({ synonym: true, status: 'SYNONYM', matchType: 'EXACT', acceptedUsageKey: 3574112, speciesKey: 3574112, species: 'Ceropegia nigra', canonicalName: 'Ceropegia melanopsis' }))) as unknown as typeof fetch;
    const a = await synonymAsk(p, gbif, 'ceropegia-melanopsis', c, null);
    expect(a).toMatchObject({ slug: 'ceropegia-nigra', acceptedKey: 3574112 });
    // Kew's number for the same plant is not a GBIF key: GBIF answering 326701 finds no page.
    const other = (async () => new Response(JSON.stringify({ synonym: true, status: 'SYNONYM', matchType: 'EXACT', acceptedUsageKey: 326701, species: 'Babiana geniculata' }))) as unknown as typeof fetch;
    expect(await synonymAsk(p, other, 'babiana-geniculatus', c, null)).toMatchObject({ slug: null });
    expect(lookupOf(c, p, noStatic)).toBeTruthy();
  });
});
