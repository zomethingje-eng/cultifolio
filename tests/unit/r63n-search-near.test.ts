/**
 * Round sixty-three, N3: "Aloe Verra" answered Drimia noctiflora. The cause, found in `rank` (src/lib/core/search.ts):
 * the similar-spelling pass read every field with one typing error allowed, the places a species grows included, so
 * "aloe" was one letter from the start of "Algeria" (Drimia noctiflora's range) and "verra" one letter from "vera" (the
 * first half of its older name Vera-duthiea noctiflora); every word was accounted for, by words of no name. A similar
 * spelling is now read against names only (the species' name, its common names, its older names); a family or a place
 * is still matched as typed, in both passes. Through the route's own handler over the postings of a small index (as the
 * live site answers), and over the whole index (`search`), which must agree (round sixty-one's agreement). Each `it`
 * FAILED on the base unless its describe says guard.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { _forgetIndex } from '$lib/server/dossiers';
import { buildProducts } from '$dossier/products';
import { manifestPath, productPath } from '$dossier/manifest';
import { resetRateLimits } from '$lib/server/sync';
import { prepare, search } from '$core/search';
import { GET } from '../../src/routes/api/search/+server';

let k = 8_300_000;
type E = { key: number; slug: string; name: string; family?: string; common?: string; commons?: string[]; origin?: string[]; syn?: string[]; open: number; photos: number; climate: string };
const E = (name: string, o: { common?: string[]; origin?: string[]; syn?: string[]; family?: string } = {}): E => ({
  key: k++, slug: name.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, ''), name, ...(o.family ? { family: o.family } : {}),
  ...(o.common?.length ? { common: o.common[0] } : {}), ...(o.common && o.common.length > 1 ? { commons: o.common.slice(1) } : {}),
  ...(o.origin ? { origin: o.origin } : {}), ...(o.syn ? { syn: o.syn } : {}), open: 1, photos: 1, climate: 'ok'
});
const IDX = [
  E('Aloe vera', { family: 'Asphodelaceae', common: ['Barbados aloe', 'True aloe', 'Aloe vera', 'Aloe'], origin: ['Oman'] }),
  E('Aloe ferox', { family: 'Asphodelaceae', common: ['Cape aloe'], origin: ['Cape Provinces'] }),
  E('Aloe verecunda', { family: 'Asphodelaceae', origin: ['Northern Provinces'] }),
  E('Aloe arborescens', { family: 'Asphodelaceae', common: ['Krantz aloe'] }),
  // As the live index has it: its range and its older names, as binomials.
  E('Drimia noctiflora', { family: 'Asparagaceae', origin: ['Algeria', 'Morocco', 'Tunisia', 'Mauritania'], syn: ['Urginea noctiflora', 'Vera-duthiea noctiflora'] }),
  E('Drimia maritima', { family: 'Asparagaceae', common: ['Sea squill'], origin: ['Algeria', 'Spain'] }),
  E('Mammillaria plumosa', { family: 'Cactaceae', common: ['Feather cactus'], origin: ['Mexico Northeast'] }),
  E('Mammillaria elongata', { family: 'Cactaceae', common: ['Ladyfinger cactus'], origin: ['Mexico Central'] }),
  E('Copiapoa cinerea', { family: 'Cactaceae', origin: ['Chile North'] })
].sort((a, b) => a.name.localeCompare(b.name));

let platform: App.Platform;
const kv = () => { const m = new Map<string, string>(); return { get: async (x: string) => m.get(x) ?? null, put: async (x: string, v: string) => void m.set(x, v) }; };
beforeAll(() => {
  _forgetIndex();
  const { manifest, files } = buildProducts(IDX as never, JSON.stringify(IDX), () => new Map());
  const blobs = new Map<string, string>([[manifestPath(), JSON.stringify(manifest)]]);
  for (const [name, body] of files) blobs.set(productPath(manifest.files[name]), body);
  const obj = (body: string, etag: string) => ({ text: async () => body, json: async () => JSON.parse(body), etag });
  platform = { env: { QUEUE: kv(), STORE: { get: async (x: string) => (blobs.has(x) ? obj(blobs.get(x)!, `"${x}"`) : null), head: async (x: string) => (blobs.has(x) ? { etag: `"${x}"` } : null) } } } as unknown as App.Platform;
}, 60_000);
beforeEach(() => resetRateLimits());
const noStatic = (async () => new Response('', { status: 404 })) as typeof fetch;
async function ask(raw: string, n = 3) {
  const r = await GET({ url: new URL(`http://x/api/search?n=${n}&shape=2&q=${encodeURIComponent(raw)}`), platform, fetch: noStatic, getClientAddress: () => '1.2.3.4' } as never);
  const body = (await r.json()) as { hits: Array<{ name: string }>; relaxed?: { query: string }; near?: boolean };
  return { names: body.hits.map((x) => x.name), relaxed: body.relaxed?.query ?? null, near: body.near === true };
}
const whole = (q: string, n = 3) => search(prepare(IDX), q, n).map((e) => e.name);

describe('N3: a similar spelling is read against names, never against a place or a family', () => {
  it('"Aloe Verra" answers Aloe vera, and no Drimia (the owner\'s query, n=3)', async () => {
    const a = await ask('Aloe Verra');
    expect(a.names).toEqual(['Aloe vera']); // base: ['Aloe vera', 'Drimia noctiflora'], near
    expect(a.near).toBe(true);
    expect(whole('Aloe Verra')).toEqual(a.names);
  });
  it('in lower case too, and with the capital on the genus only', async () => {
    for (const q of ['aloe verra', 'Aloe verra']) {
      const a = await ask(q);
      expect(a.names).not.toContain('Drimia noctiflora'); // base: Drimia noctiflora ("aloe" ≈ "Algeria")
      expect(a.names[0]).toBe('Aloe vera');
      expect(whole(q)).toEqual(a.names);
    }
  });
  it('a place spelt with a typing error stands in for no word: "Algerai maritima" is not Drimia maritima', async () => {
    const a = await ask('Algerai maritima');
    expect(a.names).toEqual([]); // base: Drimia maritima ("algerai" ≈ "Algeria", a place, "maritima" its epithet)
    expect(whole('Algerai maritima')).toEqual([]);
  });
});

describe('N3 guard: what still answers', () => {
  it('a typing error in a name word still finds it, with a place matched as typed', async () => {
    expect((await ask('Mamillaria mexico')).names).toEqual(['Mammillaria elongata', 'Mammillaria plumosa']);
    expect(whole('Mamillaria mexico')).toEqual(['Mammillaria elongata', 'Mammillaria plumosa']);
    expect((await ask('Copiapoa cinera')).names).toEqual(['Copiapoa cinerea']);
    expect((await ask('feather cactis')).names).toEqual(['Mammillaria plumosa']);
  });
  it('a place or a family typed correctly still answers, in the exact pass', async () => {
    expect((await ask('drimia algeria')).names).toEqual(['Drimia maritima', 'Drimia noctiflora']);
    expect((await ask('cactaceae chile', 5)).names).toEqual(['Copiapoa cinerea']);
  });
  it('an older name still answers by a similar spelling: "Urginia noctiflora" is Drimia noctiflora', async () => {
    expect((await ask('Urginia noctiflora')).names).toEqual(['Drimia noctiflora']);
    expect(whole('Urginia noctiflora')).toEqual(['Drimia noctiflora']);
  });
});
