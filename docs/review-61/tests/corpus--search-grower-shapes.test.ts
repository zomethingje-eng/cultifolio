// Self-review of round sixty-one, corpus area: grower queries the round's author, hybrid and cultivar rules get wrong.
// REPRODUCTIONS: the "repro" tests FAIL on f4ab4f8 (11 of them); the "guard" tests PASS and should stay so.
// Every answer is taken through `searchAnswer` over the postings of a small index, as /api/search gives it.
// Run: npx vitest run tests/unit/corpus--search-grower-shapes.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { searchAnswer, _forgetIndex } from '$lib/server/dossiers';
import { buildProducts } from '$dossier/products';
import { manifestPath, productPath } from '$dossier/manifest';
import { _clean } from '../../src/routes/api/search/+server';

let k = 7_000_000;
const E = (name: string, extra: Record<string, unknown> = {}) => ({ key: k++, slug: name.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, ''), name, open: 1, photos: 1, climate: 'ok', ...extra });
const IDX = [
  E('Aloe vera', { common: 'Barbados aloe' }), E('Aloe speciosa'), E('Aloe spicata'), E('Aloe × spinosissima'),
  E('× Gasteraloe beguinii'), E('Gasteria batesiana'), E('Gasteria disticha', { syn: ['Aloe disticha'] }),
  E('Copiapoa cinerea'), E('Copiapoa humilis'), E('Echeveria elegans'), E('Echeveria lilacina'), E('Echinopsis oxygona'),
  E('Agapanthus africanus', { common: 'Lily of the Nile' }), E('Alstroemeria aurea', { common: 'Lily of the Incas' }),
  E('Sprekelia formosissima', { common: 'Aztec lily', commons: ['Lily of St. James'] }), E('Haworthia cooperi'), E('Begonia rex')
].sort((a, b) => a.name.localeCompare(b.name));

let platform: App.Platform;
beforeAll(() => {
  _forgetIndex();
  const { manifest, files } = buildProducts(IDX as never, JSON.stringify(IDX), () => new Map());
  const blobs = new Map<string, string>([[manifestPath(), JSON.stringify(manifest)]]);
  for (const [name, body] of files) blobs.set(productPath(manifest.files[name]), body);
  const obj = (body: string, etag: string) => ({ text: async () => body, json: async () => JSON.parse(body), etag });
  platform = { env: { STORE: { get: async (x: string) => (blobs.has(x) ? obj(blobs.get(x)!, `"${x}"`) : null), head: async (x: string) => (blobs.has(x) ? { etag: `"${x}"` } : null) } } } as unknown as App.Platform;
});
const noStatic = (async () => new Response('', { status: 404 })) as typeof fetch;
async function ask(raw: string) {
  const a = await searchAnswer(platform, noStatic, _clean(raw), 5, async () => null);
  if ('stop' in a) throw new Error('stopped');
  return { names: a.hits.map((h) => h.name), relaxed: a.relaxed?.query ?? null };
}
/** Answered as something other than what was typed, with no "Showing results for": the failure the round fixed for "Aloe vera x Gasteria". */
const silentlyOther = (a: { names: string[]; relaxed: string | null }) => a.names.length > 0 && a.relaxed === null;

describe('repro: a whole name in quotes is dropped as a cultivar (new in round sixty-one)', () => {
  for (const q of ['"Aloe vera"', '“Copiapoa cinerea”', "'Copiapoa cinerea'"]) it(q, async () => {
    expect((await ask(q)).names[0]).toBe(q.includes('Aloe') ? 'Aloe vera' : 'Copiapoa cinerea'); // f4ab4f8: [] (the page: "Nothing in the reference matches")
  });
});

describe('repro: a hybrid formula is answered as one species with no label', () => {
  it('an abbreviated second parent ("Aloe vera x G. batesiana") is read as an author', async () => {
    expect(silentlyOther(await ask('Aloe vera x G. batesiana'))).toBe(false); // f4ab4f8: Aloe vera, unlabelled
    expect(silentlyOther(await ask('Gasteria batesiana × A. vera'))).toBe(false);
  });
  it('an intergeneric formula ("Gasteria x Aloe") matches a Gasteria through its Aloe synonym', async () => {
    expect(silentlyOther(await ask('Gasteria x Aloe'))).toBe(false); // f4ab4f8: Gasteria disticha, unlabelled
  });
});

describe('repro: "St." in a common name is read as an author once two words precede it', () => {
  it('lower case (new in round sixty-one: DOTTED)', async () => expect((await ask('lily of st. james')).names[0]).toBe('Sprekelia formosissima')) // f4ab4f8: Agapanthus africanus (searched as "lily of");
  it('as written', async () => expect((await ask('Lily of St. James')).names[0]).toBe('Sprekelia formosissima')) // f4ab4f8 and r60: Agapanthus africanus;
});

describe('repro: label qualifiers', () => {
  it('"cf." and "aff." find nothing', async () => {
    expect((await ask('Copiapoa cf. cinerea')).names[0]).toBe('Copiapoa cinerea');
    expect((await ask('Copiapoa aff. cinerea')).names[0]).toBe('Copiapoa cinerea');
  });
  it('"Aloe sp." is answered as the species whose epithet begins "sp", unlabelled', async () => {
    expect(silentlyOther(await ask('Aloe sp.'))).toBe(false); // f4ab4f8: Aloe speciosa, Aloe spicata, Aloe × spinosissima
  });
});

describe('repro: one name, two answers by punctuation', () => {
  it('a trailing full stop turns a labelled retry into a silent answer', async () => {
    const plain = await ask('Copiapoa cinerea columna-alba');
    const stop = await ask('Copiapoa cinerea columna-alba.');
    expect(stop.relaxed).toBe(plain.relaxed); // f4ab4f8: "Copiapoa cinerea" vs null
  });
  it('a quoted cultivar after a genus initial answers every E genus; "cv." answers nothing', async () => {
    const q = await ask("E. 'Perle von Nürnberg'");
    const cv = await ask('E. cv. Perle von Nürnberg');
    expect(q.names).toEqual(cv.names); // f4ab4f8: [Echeveria…, Echinopsis…] vs []
  });
});

describe('guard: what the round fixed stays fixed', () => {
  it.each([
    ['Aloe x spinosissima', 'Aloe × spinosissima'], ['Aloe ×spinosissima', 'Aloe × spinosissima'], ['×Gasteraloe', '× Gasteraloe beguinii'],
    ['x Gasteraloe beguinii', '× Gasteraloe beguinii'], ['Aloe vera L.', 'Aloe vera'], ['Aloe vera (L.) Burm.f.', 'Aloe vera'],
    ['Haworthia cooperi hort.', 'Haworthia cooperi'], ['Begonia rex Putz.', 'Begonia rex'], ['Copiapoa ’cinerea’', 'Copiapoa cinerea'],
    ['Lily of St James', 'Sprekelia formosissima']
  ])('%s', async (q, want) => {
    const a = await ask(q);
    expect(a.names[0]).toBe(want);
    expect(a.relaxed).toBeNull();
  });
  it('a hybrid with a full second parent is a labelled retry', async () => expect((await ask('Aloe vera x Gasteria batesiana')).relaxed).toBe('Aloe vera'));
});
