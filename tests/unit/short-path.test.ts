/**
 * Round fifty-nine (the harness review, 3; the corpus reviews): the first keystrokes are answered from `short.json` and
 * from no posting file, for every spelling the ranking reads as one short word ("f a" and "a a" are "a"), and a query
 * whose exact candidates are most of the index is charged as a whole-index search. The answers equal the whole index's
 * either way (search-generations.test.ts), so what is checked here is which files were read.
 */
import { describe, it, expect } from 'vitest';
import { searchAnswer, _forgetIndex, WHOLE_LIKE } from '$lib/server/dossiers';
import { buildProducts } from '$dossier/products';
import { manifestPath, productPath } from '$dossier/manifest';
import { prepare, search } from '$core/search';

let seed = 11;
const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
const pick = <T>(xs: T[]) => xs[rnd(xs.length)];
const syl = ['a', 'lo', 'e', 'ha', 'wor', 'thi', 'co', 'pi', 'a', 'po', 'li', 'thops', 'ma', 'mil', 'la', 'ri', 'echi', 'no', 'cac', 'tus', 'gas', 'te', 'ria', 'ka', 'lan', 'cho', 'é', 'ö', 'x', 'yu', 'ca', 'agave', 'cras', 'su', 'la', 'f', 'b', 'z'];
const word = (k: number) => Array.from({ length: k }, () => pick(syl)).join('');
function corpus(n: number) {
  const fams = ['Cactaceae', 'Aizoaceae', 'Asphodelaceae', 'Crassulaceae', 'Amaryllidaceae', 'Apocynaceae', 'Euphorbiaceae'];
  const origins = ['Cape Provinces', 'Mexico Northeast', 'Chile North', 'Namibia', 'Madagascar', 'Peru', 'Arizona', 'Bolivia', 'Northern Provinces', 'Brazil Southeast'];
  const genera = Array.from({ length: 400 }, () => word(2 + rnd(2)));
  return Array.from({ length: n }, (_, i) => {
    const g = pick(genera); const g1 = g[0].toUpperCase() + g.slice(1);
    const name = `${g1} ${word(2 + rnd(2))}${rnd(6) ? '' : ` ${pick(['var.', 'subsp.', 'f.'])} ${word(2)}`}`;
    return { key: i + 1, slug: `s-${i + 1}`, name, family: pick(fams), common: rnd(3) ? undefined : `${word(2)} ${pick(['aloe', 'cactus', 'plant', 'lily', 'stone'])}`, origin: [pick(origins), ...(rnd(2) ? [pick(origins)] : [])], syn: rnd(3) ? undefined : [`${pick(genera)} ${word(2)}`], open: 0 };
  });
}
function platformFor(idx: object[]) {
  const text = JSON.stringify(idx);
  const { manifest, files } = buildProducts(idx as never, text, () => new Map());
  const blobs = new Map<string, string>();
  blobs.set(manifestPath(), JSON.stringify(manifest));
  for (const [name, body] of files) blobs.set(productPath(manifest.files[name]), body);
  const obj = (body: string, etag: string) => ({ text: async () => body, json: async () => JSON.parse(body), etag });
  const reads: string[] = [];
  const store = { get: async (k: string) => { reads.push(k); return blobs.has(k) ? obj(blobs.get(k)!, `"${k}"`) : null; }, head: async (k: string) => (blobs.has(k) ? { etag: `"${k}"` } : null) };
  return { platform: { env: { STORE: store } } as unknown as App.Platform, manifest, files, reads };
}
const noStatic = (async () => new Response('', { status: 404 })) as typeof fetch;

describe('the short path is the path the first keystrokes take (round fifty-nine)', () => {
  it('one short word as the ranking reads it: short.json, no posting file, and the whole index\'s answer', async () => {
    _forgetIndex();
    const idx = corpus(3000);
    const { platform, manifest, reads } = platformFor(idx);
    const whole = prepare(idx);
    for (const q of ['a', 'co', 'f a', 'a a', 'var co', 'A']) {
      _forgetIndex();
      reads.length = 0;
      const a = await searchAnswer(platform, noStatic, q, 60, async () => { throw new Error('charged as whole'); });
      if ('stop' in a) throw new Error('stopped');
      expect(a.hits.map((h) => h.key), q).toEqual(search(whole, q, 60).map((h) => h.key));
      expect(reads, q).toContain(productPath(manifest.files['short.json']!));
      expect(reads.filter((k) => Object.entries(manifest.files).some(([name, h]) => name.startsWith('postings/') && productPath(h) === k)), q).toEqual([]);
    }
  });
  it('two short words that narrow almost nothing are charged as a whole-index search', async () => {
    _forgetIndex();
    const idx = corpus(9000);
    const { platform } = platformFor(idx);
    let charged = 0;
    const a = await searchAnswer(platform, noStatic, 'a e', 60, async () => { charged++; return null; });
    expect('stop' in a).toBe(false);
    expect(charged).toBe(1);
    const refused = await searchAnswer(platform, noStatic, 'a e', 60, async () => new Response('slow down', { status: 429 }));
    expect('stop' in refused && refused.stop.status).toBe(429);
    expect(WHOLE_LIKE).toBeGreaterThan(100);
  });
});
