/**
 * Round sixty-seven (triage-66 N1, N2, N8): the real `GET /api/search` handler over the real corpus, its index and
 * products rebuilt from the dossiers with this checkout's rules, as `--index` would write them, and served as static
 * files (adopted from reviewer B's harness of round sixty-six, `rev66b-probe.test.ts`). Skipped where the corpus is not
 * on disk (`/tmp/rev66/corpus/v2`, read-only).
 *
 * It checks the label names past the sixth older name (Ferocactus glaucescens, Mammillaria conoidea, Neolloydia
 * conoidea, Opuntia longispina), the common names read whole against one name ("snake plant", "cape aloe", "natal
 * plum"), the order within a reading ("fig", "onion", "kiwi"), the retry that never ends on a small word ("Lily of St.
 * James"), and that the route's answer through the postings is the whole index's answer.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { englishNames, generaOf, olderNamesOf, type IndexEntry } from '$dossier/index-entry';
import { buildProducts } from '$dossier/products';
import { manifestPath, productPath, type Manifest } from '$dossier/manifest';
import { prepare, search } from '$core/search';
import { _forgetIndex } from '$lib/server/dossiers';
import { resetRateLimits } from '$lib/server/sync';
import { GET as searchGET } from '../../src/routes/api/search/+server';

const C = '/tmp/rev66/corpus/v2';
const have = existsSync(`${C}/index.json`);

let index: IndexEntry[] = [];
let text = '';
let manifest: Manifest;
let files: Map<string, string>;
const byPath = new Map<string, string>();

beforeAll(() => {
  if (!have) return;
  const idx = JSON.parse(readFileSync(`${C}/index.json`, 'utf8')) as IndexEntry[];
  const genera = generaOf(idx.map((e) => e.name));
  index = idx.map((e) => {
    const d = JSON.parse(readFileSync(`${C}/${e.key}.json`, 'utf8')) as { name: { scientific: string; vernacular?: Parameters<typeof englishNames>[0]; synonyms?: string[] } };
    const { syn, older } = olderNamesOf(d.name.scientific, d.name.synonyms ?? []);
    const { common: _c, commons: _cs, syn: _s, ...rest } = e;
    return { ...rest, ...englishNames(d.name.vernacular ?? [], { genus: e.name, genera }), ...(syn.length ? { syn } : {}), ...(older.length ? { older } : {}) } as IndexEntry;
  });
  text = JSON.stringify(index);
  ({ manifest, files } = buildProducts(index, text, () => new Map()));
  byPath.set(`s/v2/index.json`, text);
  byPath.set(manifestPath(), JSON.stringify(manifest));
  for (const [name, body] of files) byPath.set(productPath(manifest.files[name]), body);
}, 600_000);

const staticFetch = (async (u: string | URL) => {
  const p = String(u).replace(/^https?:\/\/[^/]+/, '').replace(/^\//, '');
  const body = byPath.get(p);
  return body != null ? new Response(body) : new Response('', { status: 404 });
}) as typeof fetch;

type Answer = { hits: Array<{ name: string; common?: string }>; relaxed?: { query: string; left?: string }; near?: boolean };
async function ask(q: string, n = 5): Promise<Answer> {
  resetRateLimits();
  const r = await searchGET({ url: new URL(`http://x/api/search?shape=2&n=${n}&q=${encodeURIComponent(q)}`), platform: undefined, fetch: staticFetch, getClientAddress: () => '1.2.3.4' } as never);
  expect(r.status).toBe(200);
  return (await r.json()) as Answer;
}
const first = async (q: string) => (await ask(q)).hits[0]?.name;

describe.skipIf(!have)('the search route over the real corpus, rebuilt with this round\'s rules', () => {
  beforeAll(() => _forgetIndex());

  it('finds a species by an older name past the sixth (N1)', async () => {
    expect(await first('Ferocactus glaucescens')).toBe('Bisnaga glaucescens');
    expect(await first('Mammillaria conoidea')).toBe('Cochemiea conoidea');
    expect(await first('Neolloydia conoidea')).toBe('Cochemiea conoidea');
    expect(await first('Opuntia longispina')).toBe('Airampoa corrugata');
    // Still searched and never shown: the entry shows six.
    const e = index.find((x) => x.name === 'Bisnaga glaucescens')!;
    expect(e.syn!.length).toBeLessThanOrEqual(6);
    expect([...(e.syn ?? []), ...(e.older ?? [])]).toContain('Ferocactus glaucescens');
  }, 120_000);

  it('reads a common name whole against one name, never words of two names or a place (N2)', async () => {
    expect(await first('snake plant')).toBe('Dracaena trifasciata');
    expect(await first('cape aloe')).toBe('Aloe ferox');
    expect(await first('natal plum')).toBe('Carissa macrocarpa');
    expect(await first('rainbow cactus')).toBe('Echinocereus pectinatus');
    const snake = await ask('snake plant', 20);
    expect(snake.hits.map((h) => h.name)).not.toContain('Achillea millefolium');
  }, 120_000);

  it('puts a whole-word match and the headline first within a reading (N8)', async () => {
    expect(await first('fig')).toBe('Ficus carica');
    expect(await first('onion')).toBe('Allium cepa');
    expect(await first('kiwi')).toBe('Actinidia chinensis');
    // A name typed as a name still comes first.
    expect(await first('aloe vera')).toBe('Aloe vera');
    expect(await first('cop')).toMatch(/^Cop/); // a genus beginning "cop" (Copernicia, Copiapoa), never a common name's word
  }, 120_000);

  it('orders near hits by their distance from what was typed (N8)', async () => {
    const a = await ask('Ceropegia pica');
    expect(a.near).toBe(true);
    expect(a.hits[0].name).toBe('Ceropegia picta');
    expect(await first('Aloe verra')).toBe('Aloe vera');
  }, 120_000);

  it('never retries a common name on its first two words when the second is a small word (N8)', async () => {
    const a = await ask('Lily of St. James');
    expect(a.relaxed?.query ?? '').not.toBe('Lily of');
    const b = await ask('Rose of Jericho');
    expect(b.relaxed?.query ?? '').not.toBe('Rose of');
  }, 120_000);

  it('answers through the postings what the whole index answers', async () => {
    const whole = prepare(index);
    for (const q of ['Ferocactus glaucescens', 'snake plant', 'fig', 'cape aloe', 'Neolloydia conoidea', 'haworthia attenuata', 'string of pearls', 'Ceropegia pica', 'mam', 'echeveria']) {
      const a = await ask(q, 20);
      expect(a.hits.map((h) => h.name), q).toEqual(search(whole, q, 20).map((h) => h.name));
    }
  }, 300_000);
});
