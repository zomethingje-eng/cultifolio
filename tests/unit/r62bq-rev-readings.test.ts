/**
 * Review of round sixty-two (search): reproductions for the order of readings, through the route's own handler over
 * the postings of a small index, as the live site answers. Every `it` FAILS on the merged code.
 * Run from the repository root: cp /tmp/r62rev/out/tests/search--readings.test.ts tests/unit/ && npx vitest run tests/unit/search--readings.test.ts
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { _forgetIndex, searchAnswer } from '$lib/server/dossiers';
import { buildProducts } from '$dossier/products';
import { manifestPath, productPath } from '$dossier/manifest';
import { resetRateLimits } from '$lib/server/sync';
import { prepare, search, relaxedQuery } from '$core/search';
import { GET } from '../../src/routes/api/search/+server';

let k = 8_100_000;
const E = (name: string, common: string[] = [], syn?: string[]) => ({ key: k++, slug: name.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, ''), name, ...(common.length ? { common: common[0] } : {}), ...(common.length > 1 ? { commons: common.slice(1) } : {}), ...(syn ? { syn } : {}), open: 1, photos: 1, climate: 'ok' });
const IDX = [
  E('Aloe vera', ['Barbados aloe', 'Medicinal aloe']), E('Aloe ferox', ['Cape aloe']), E('Aloe arborescens', ['Krantz aloe']), E('Aloe polyphylla', ['Spiral aloe']),
  E('Aloe juvenna'), E('Aloe peglerae'), E('Aloe marlothii'), E('Aloe striata', ['Coral aloe']),
  E('Crassula ovata', ['Jade plant', 'Money plant']), E('Crassula muscosa', ['Watch chain']), E('Crassula perforata', ['String of buttons']),
  E('Echeveria elegans', ['Mexican snowball']), E('Echeveria lilacina', ['Ghost echeveria']), E('Echeveria lozanoi'), E('Echeveria agavoides'),
  E('Mammillaria spinosissima', ['Spiny pincushion cactus']), E('Mammillaria bombycina'), E('Mammillaria plumosa', ['Feather cactus']),
  E('Copiapoa cinerea'), E('Copiapoa humilis'),
  E('Hypericum perforatum', ["St. John's wort"]), E('Stapelia gigantea', ['Starfish flower']), E('Astrophytum asterias', ['Star cactus']), E('Ceropegia woodii', ['String of hearts']),
  E('Rudbeckia hirta', ['Black-eyed Susan']), E('Vigna unguiculata', ['Black-eyed pea']),
  E('Dracaena trifasciata', ['Snake plant', "Mother-in-law's tongue"]), E('Kalanchoe daigremontiana', ['Mother of thousands']), E('Graptopetalum paraguayense', ['Mother-of-pearl plant'])
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
async function ask(raw: string) {
  const r = await GET({ url: new URL(`http://x/api/search?n=6&shape=2&q=${encodeURIComponent(raw)}`), platform, fetch: noStatic, getClientAddress: () => '1.2.3.4' } as never);
  const body = (await r.json()) as { hits: Array<{ name: string }>; relaxed?: { query: string }; near?: boolean };
  return { names: body.hits.map((x) => x.name), relaxed: body.relaxed?.query ?? null, near: body.near === true };
}

describe('a capital on the second word changes the answer (the reading order, A7, B2)', () => {
  it.each([['Aloe Verra', 'Aloe vera'], ['Aloe Polyphyla', 'Aloe polyphylla'], ['Crassula Ovatta', 'Crassula ovata'], ['Echeveria Elegens', 'Echeveria elegans']])(
    '%s answers %s, as its lower-case spelling does', async (q, want) => {
      const lower = await ask(q.toLowerCase());
      expect(lower.names[0]).toBe(want); // the lower-case spelling: the species, by a similar spelling
      const a = await ask(q);
      expect(a.names[0]).toBe(want); // merged: the whole genus, "Showing results for Aloe" (base: the species)
    }
  );
  it('a capitalised epithet with an author or a cultivar keeps its species: "Mammillaria Spinosissima Un Pico"', async () => {
    expect((await ask('Mammillaria Spinosissima Un Pico')).names).toEqual(['Mammillaria spinosissima']); // merged: the whole genus (base: the species, labelled)
  });
  it.each([['St Johns Wort', 'Hypericum perforatum'], ['String Of Hearst', 'Ceropegia woodii'], ['Mother In Laws Tongue', 'Dracaena trifasciata']])(
    'a title-case common name with a slip answers as in lower case: %s', async (q, want) => {
      expect((await ask(q.toLowerCase())).names).toEqual([want]);
      expect((await ask(q)).names).toEqual([want]); // merged: "Showing results for St" (Stapelia, Star cactus, String of …), "String", "Mother"
    }
  );
});

describe('the qualifiers the name reader knows are qualifiers to the search too (decision 4: nr., near, cfr., vel aff.)', () => {
  it.each(['Copiapoa nr. cinerea', 'Copiapoa near cinerea', 'Copiapoa cfr. cinerea', 'Copiapoa vel aff. cinerea'])('%s finds Copiapoa cinerea, as "cf." does', async (q) => {
    expect((await ask('Copiapoa cf. cinerea')).names[0]).toBe('Copiapoa cinerea');
    expect((await ask(q)).names[0]).toBe('Copiapoa cinerea'); // merged: nothing matches
  });
});

describe('"cv." marks a cultivar, which is never read as an epithet by a similar spelling (A7)', () => {
  it('"Echeveria cv. Lola" is not Echeveria lilacina', async () => {
    // Changed from the review's assertion (round sixty-two, second pass, agent Q): the review's own fix answers the genus,
    // and E. lilacina is an Echeveria, so it is in that answer as one of the genus, labelled, never by a similar spelling.
    const a = await ask('Echeveria cv. Lola');
    expect(a.relaxed).toBe('Echeveria'); // merged: E. lilacina and E. lozanoi, near, no "Showing results for"
    expect(a.near).toBe(false);
    expect(a.names).toEqual(['Echeveria agavoides', 'Echeveria elegans', 'Echeveria lilacina', 'Echeveria lozanoi']);
  });
});

describe('the postings answer what the whole index answers', () => {
  it('"sp. Black eyed Susan"', async () => {
    const q = 'sp. Black eyed Susan';
    const a = await searchAnswer(platform, noStatic, q, 6, async () => null);
    if ('stop' in a) throw new Error('stopped');
    let want = search(prepare(IDX as never[]), q, 6) as Array<{ name: string }>;
    const rq = want.length ? null : relaxedQuery(q);
    if (rq) want = search(prepare(IDX as never[]), rq, 6) as never;
    expect(a.hits.map((h) => h.name)).toEqual(want.map((h) => h.name)); // merged: [] from the postings, Rudbeckia hirta from the whole index
  });
});

describe('a word in another script is a word: dropping it is said (B2: "whenever words were dropped")', () => {
  it('"Aloe вера" does not answer every Aloe as if it matched', async () => {
    const a = await ask('Aloe вера');
    expect(a.names.length === 0 || a.relaxed !== null).toBe(true); // merged: every Aloe, no "Showing results for"
  });
});
