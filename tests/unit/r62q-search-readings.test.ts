/**
 * Round sixty-two, decision 3: the order of readings, as /api/search answers it. Each answer goes through the route's
 * own handler over the postings of a small index (as the live site answers), so the "Showing results for" label is the
 * `x-search-relaxed` header the page reads. Adopted from docs/review-61/tests/corpus--search-grower-shapes.test.ts
 * (the self-review's corpus 1, 4, 5, 6 and 10), with the outside reviews' B2 and A7 shapes added. Each `it` outside
 * "guard" FAILED on the base (shown before the fix). Two of the review's guards changed with the decision: "Aloe vera
 * L." and "Begonia rex Putz." drop a word, so they are now labelled with the words used (B2: "whenever words were
 * dropped, the answer carries X-Search-Relaxed naming the words used").
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { _forgetIndex } from '$lib/server/dossiers';
import { buildProducts } from '$dossier/products';
import { manifestPath, productPath } from '$dossier/manifest';
import { resetRateLimits } from '$lib/server/sync';
import { GET } from '../../src/routes/api/search/+server';

let k = 7_000_000;
const E = (name: string, extra: Record<string, unknown> = {}) => ({ key: k++, slug: name.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, ''), name, open: 1, photos: 1, climate: 'ok', ...extra });
const IDX = [
  E('Aloe vera', { common: 'Barbados aloe' }), E('Aloe speciosa'), E('Aloe spicata'), E('Aloe × spinosissima'),
  E('× Gasteraloe beguinii'), E('Gasteria batesiana'), E('Gasteria disticha', { syn: ['Aloe disticha'] }),
  E('Copiapoa cinerea'), E('Copiapoa humilis'), E('Echeveria elegans'), E('Echeveria lilacina'), E('Echinopsis oxygona'),
  E('Agapanthus africanus', { common: 'Lily of the Nile' }), E('Alstroemeria aurea', { common: 'Lily of the Incas' }),
  E('Sprekelia formosissima', { common: 'Aztec lily', commons: ['Lily of St. James'] }), E('Haworthia cooperi'), E('Begonia rex'),
  // B2's live answer: the three black-eyed Susans, and a Vigna whose "Black-eyed pea" took the query once "Susan" was read as an author.
  E('Rudbeckia hirta', { common: 'Black-eyed Susan' }), E('Rudbeckia subtomentosa', { common: 'Sweet black-eyed Susan' }),
  E('Thunbergia alata', { common: 'Black-eyed Susan vine' }), E('Vigna unguiculata', { common: 'Black-eyed pea' }),
  E('Curio rowleyanus', { common: 'String-of-Pearls' }), E('Crassula ovata', { common: 'Jade plant' }), E('Crassula perforata', { common: 'String of buttons' }),
  E('Haworthia attenuata'), E('Kalanchoe daigremontiana', { common: 'Mother of thousands' })
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
});
beforeEach(() => resetRateLimits());
const noStatic = (async () => new Response('', { status: 404 })) as typeof fetch;
/** The route's answer: the hits' names, the words the header names (or null), and whether the hits are similar spellings. */
async function ask(raw: string) {
  const r = await GET({ url: new URL(`http://x/api/search?n=5&shape=2&q=${encodeURIComponent(raw)}`), platform, fetch: noStatic, getClientAddress: () => '1.2.3.4' } as never);
  if (r.status !== 200) throw new Error(`status ${r.status}`);
  const body = (await r.json()) as { hits: Array<{ name: string }>; relaxed?: { query: string }; near?: boolean };
  const h = r.headers.get('x-search-relaxed');
  const header = h ? decodeURIComponent(h) : null;
  expect(header).toBe(body.relaxed?.query ?? null); // the header and the body name the same words
  return { names: body.hits.map((x) => x.name), relaxed: header, near: r.headers.get('x-search-near') === '1' };
}
/** Answered as something other than what was typed, with no "Showing results for". */
const silentlyOther = (a: { names: string[]; relaxed: string | null }) => a.names.length > 0 && a.relaxed === null;

describe('the order of readings (B2, A7)', () => {
  it('a common name is tried whole first: "Black eyed Susan" and "black eyed susan" answer the same, without the Vigna', async () => {
    const a = await ask('Black eyed Susan');
    expect(a).toEqual(await ask('black eyed susan'));
    expect(a.names).toEqual(['Rudbeckia hirta', 'Rudbeckia subtomentosa', 'Thunbergia alata']); // base: the Vigna too, as "black eyed"
    expect(a.relaxed).toBeNull();
  });
  it('an author citation is dropped only when the whole query is no common name, and the answer names the words used', async () => {
    expect(await ask('Copiapoa cinerea (Phil.) Britton & Rose')).toMatchObject({ names: ['Copiapoa cinerea'], relaxed: 'Copiapoa cinerea' }); // base: no label
    expect(await ask('Aloe vera L.')).toMatchObject({ names: ['Aloe vera'], relaxed: 'Aloe vera' });
  });
  it('a genus followed by capitalised words (an unquoted cultivar) answers the genus, labelled', async () => {
    for (const q of ['Haworthia Big Band', 'Crassula Gollum', 'Echeveria Perle von Nurnberg', 'Echeveria Lola']) {
      const a = await ask(q);
      expect(a.relaxed, q).toBe(q.split(' ')[0]); // base: nothing, or E. lilacina by a similar spelling, unlabelled
      expect(a.names.every((n) => n.startsWith(q.split(' ')[0] + ' ')), q).toBe(true);
      expect(a.names.length, q).toBeGreaterThan(0);
    }
  });
  it('a quoted cultivar is a dropped word too: "Echeveria \'Lola\'" says it shows Echeveria', async () => {
    expect(await ask("Echeveria 'Lola'")).toMatchObject({ names: ['Echeveria elegans', 'Echeveria lilacina'], relaxed: 'Echeveria' });
  });
  it('a similar spelling says so (x-search-near), and an exact one does not', async () => {
    expect((await ask('Copiapoa cinereaa')).near).toBe(true);
    expect((await ask('Copiapoa cinerea')).near).toBe(false);
  });
});

describe('quotes (corpus 1): quotes around the whole query search the text inside', () => {
  for (const q of ['"Aloe vera"', '“Copiapoa cinerea”', "'Copiapoa cinerea'"]) it(q, async () => {
    const a = await ask(q);
    expect(a.names[0]).toBe(q.includes('Aloe') ? 'Aloe vera' : 'Copiapoa cinerea'); // base: [] (the page: "Nothing in the reference matches")
    expect(a.relaxed).toBeNull();
  });
});

describe('hybrids (corpus 4, A7): the token after "x" starts a name again; the retry stops at the sign', () => {
  it('an abbreviated second parent is not an author', async () => {
    expect(await ask('Aloe vera x G. batesiana')).toMatchObject({ names: ['Aloe vera'], relaxed: 'Aloe vera' }); // base: Aloe vera, unlabelled
    expect(await ask('Gasteria batesiana × A. vera')).toMatchObject({ names: ['Gasteria batesiana'], relaxed: 'Gasteria batesiana' });
    expect(await ask('Copiapoa cinerea × C. humilis')).toMatchObject({ names: ['Copiapoa cinerea'], relaxed: 'Copiapoa cinerea' });
  });
  it('an intergeneric formula is not a Gasteria through its Aloe synonym', async () => {
    const a = await ask('Gasteria x Aloe');
    expect(silentlyOther(a)).toBe(false); // base: Gasteria disticha, unlabelled
    expect(a.relaxed).toBe('Gasteria');
  });
});

describe('dotted words (corpus 5, A7)', () => {
  it('"St." inside a common name is no author', async () => {
    expect((await ask('lily of st. james')).names[0]).toBe('Sprekelia formosissima'); // base: Agapanthus africanus (searched as "lily of")
    expect((await ask('Lily of St. James')).names[0]).toBe('Sprekelia formosissima');
  });
  it('a trailing full stop on a common name is punctuation', async () => {
    expect(await ask('String of pearls.')).toEqual(await ask('String of pearls')); // base: "String of", four species, unlabelled
    expect((await ask('String of pearls.')).names).toEqual(['Curio rowleyanus']);
  });
  it('a trailing full stop after an epithet answers as the word without it is labelled', async () => {
    const plain = await ask('Copiapoa cinerea columna-alba');
    const stop = await ask('Copiapoa cinerea columna-alba.');
    expect(stop.relaxed).toBe(plain.relaxed); // base: "Copiapoa cinerea" vs null
    expect(stop.relaxed).toBe('Copiapoa cinerea');
  });
});

describe('label qualifiers (corpus 6)', () => {
  it('"cf." and "aff." are skipped like "x"', async () => {
    expect((await ask('Copiapoa cf. cinerea')).names[0]).toBe('Copiapoa cinerea'); // base: nothing
    expect((await ask('Copiapoa aff. cinerea')).names[0]).toBe('Copiapoa cinerea');
  });
  it('"sp." and "spp." end the name: "Aloe sp." is not Aloe speciosa unlabelled', async () => {
    const a = await ask('Aloe sp.');
    expect(silentlyOther(a)).toBe(false); // base: Aloe speciosa, Aloe spicata, Aloe × spinosissima
    expect(a.relaxed).toBe('Aloe');
    expect((await ask('Aloe spp.')).relaxed).toBe('Aloe'); // base: nothing
    expect((await ask('Gymnocalycium sp. LB 123')).relaxed).not.toBe('Gymnocalycium sp');
  });
  it('a quoted cultivar after a genus initial answers what "cv." answers (nothing), not every E genus', async () => {
    expect((await ask("E. 'Perle von Nürnberg'")).names).toEqual((await ask('E. cv. Perle von Nürnberg')).names); // base: [Echeveria…, Echinopsis…] vs []
  });
});

describe('characters (A7): NFKC, and no format characters', () => {
  it('a zero-width space or a soft hyphen inside a word, and full-width letters, do not break the word', async () => {
    expect((await ask('Copia​poa cinerea')).names[0]).toBe('Copiapoa cinerea'); // base: nothing
    expect((await ask('Copia­poa cinerea')).names[0]).toBe('Copiapoa cinerea');
    expect((await ask('Ｃｏｐｉａｐｏａ ｃｉｎｅｒｅａ')).names[0]).toBe('Copiapoa cinerea');
  });
});

describe('guard: what the round fixed stays fixed', () => {
  it.each([
    ['Aloe x spinosissima', 'Aloe × spinosissima'], ['Aloe ×spinosissima', 'Aloe × spinosissima'], ['×Gasteraloe', '× Gasteraloe beguinii'],
    ['x Gasteraloe beguinii', '× Gasteraloe beguinii'], ['Copiapoa ’cinerea’', 'Copiapoa cinerea'], ['Lily of St James', 'Sprekelia formosissima'],
    ['String of Pearls', 'Curio rowleyanus'], ['Mother of Thousands', 'Kalanchoe daigremontiana'], ['Aloe Vera', 'Aloe vera']
  ])('%s', async (q, want) => {
    const a = await ask(q);
    expect(a.names[0]).toBe(want);
    expect(a.relaxed).toBeNull();
  });
  it.each([
    // Changed by the decision (B2): a dropped author is named in the label.
    ['Aloe vera (L.) Burm.f.', 'Aloe vera', 'Aloe vera'], ['Haworthia cooperi hort.', 'Haworthia cooperi', 'Haworthia cooperi'], ['Begonia rex Putz.', 'Begonia rex', 'Begonia rex']
  ])('%s is answered and labelled', async (q, want, words) => {
    const a = await ask(q);
    expect(a.names[0]).toBe(want);
    expect(a.relaxed).toBe(words);
  });
  it('a hybrid with a full second parent is a labelled retry', async () => expect((await ask('Aloe vera x Gasteria batesiana')).relaxed).toBe('Aloe vera'));
  it('a typo is still forgiven, and a misspelt genus with a cultivar still finds the genus', async () => {
    expect((await ask('Copiapoa cinera')).names[0]).toBe('Copiapoa cinerea');
    expect((await ask('Echeverai Lola')).names[0]).toMatch(/^Echeveria /);
  });
});
