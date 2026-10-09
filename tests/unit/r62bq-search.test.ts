/**
 * Round sixty-two, second pass, agent Q: the search's readings, the picker's names, the name parser and the common-name
 * rule, after the verification review (/tmp/r62rev/out/search.md, by number) and the self-review's triage (N2, N4, N10).
 * The review's own reproductions are r62bq-rev-*.test.ts; these are the cases the fixes add. Each FAILED on the base
 * unless its describe says guard.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { _forgetIndex, searchAnswer } from '$lib/server/dossiers';
import { buildProducts } from '$dossier/products';
import { manifestPath, productPath } from '$dossier/manifest';
import { resetRateLimits } from '$lib/server/sync';
import { prepare, search, relaxedQuery } from '$core/search';
import { parseName, speciesSlug } from '$core/names';
import { pickedName, filesKey, requestName, searchText, droppedByPick, cultivarRest } from '$lib/ui/picked-name';
import { plantNumberShaped } from '$lib/ui/index.svelte';
import { englishNames, generaOf } from '$dossier/index-entry';
import { vernacularMark } from '../../scripts/names-step';
import { auditArgs, diffCommonNames } from '../../scripts/audit-common-names';
import { GET } from '../../src/routes/api/search/+server';

let k = 8_200_000;
const E = (name: string, common: string[] = [], syn?: string[]) => ({ key: k++, slug: name.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, ''), name, ...(common.length ? { common: common[0] } : {}), ...(common.length > 1 ? { commons: common.slice(1) } : {}), ...(syn ? { syn } : {}), open: 1, photos: 1, climate: 'ok' });
const IDX = [
  E('Aloe vera', ['Barbados aloe', 'Lily of the desert']), E('Aloe ferox', ['Cape aloe']), E('Aloe polyphylla', ['Spiral aloe']),
  E('Echeveria elegans', ['Mexican snowball']), E('Echeveria lilacina', ['Ghost echeveria']), E('Echeveria lozanoi'),
  E('Haworthia cooperi'), E('Haworthia truncata'), E('Haworthiopsis attenuata', ['Zebra haworthia'], ['Haworthia attenuata']),
  E('Copiapoa cinerea'), E('Copiapoa humilis'), E('Crassula ovata', ['Jade plant']),
  E('Dracaena trifasciata', ['Snake plant', "Mother-in-law's tongue"]), E('Hypericum perforatum', ["St. John's wort"]),
  E('Rudbeckia hirta', ['Black-eyed Susan']), E('Purpurea dummy')
].sort((a, b) => a.name.localeCompare(b.name));

let platform: App.Platform;
let plain: App.Platform;
const kv = () => { const m = new Map<string, string>(); return { get: async (x: string) => m.get(x) ?? null, put: async (x: string, v: string) => void m.set(x, v) }; };
const obj = (body: string, etag: string) => ({ text: async () => body, json: async () => JSON.parse(body), etag });
const store = (blobs: Map<string, string>) => ({ get: async (x: string) => (blobs.has(x) ? obj(blobs.get(x)!, `"${x}"`) : null), head: async (x: string) => (blobs.has(x) ? { etag: `"${x}"` } : null) });
beforeAll(() => {
  _forgetIndex();
  const { manifest, files } = buildProducts(IDX as never, JSON.stringify(IDX), () => new Map());
  const blobs = new Map<string, string>([[manifestPath(), JSON.stringify(manifest)]]);
  for (const [name, body] of files) blobs.set(productPath(manifest.files[name]), body);
  platform = { env: { QUEUE: kv(), STORE: store(blobs) } } as unknown as App.Platform;
  plain = { env: { QUEUE: kv(), STORE: store(new Map([['s/v2/index.json', JSON.stringify(IDX)]])) } } as unknown as App.Platform;
}, 60_000);
beforeEach(() => { resetRateLimits(); _forgetIndex(); });
const noStatic = (async () => new Response('', { status: 404 })) as typeof fetch;
async function ask(raw: string, on = platform) {
  const r = await GET({ url: new URL(`http://x/api/search?n=6&shape=2&q=${encodeURIComponent(raw)}`), platform: on, fetch: noStatic, getClientAddress: () => '1.2.3.4' } as never);
  const body = (await r.json()) as { hits: Array<{ name: string }>; relaxed?: { query: string; left?: string }; near?: boolean };
  return { names: body.hits.map((x) => x.name), relaxed: body.relaxed?.query ?? null, left: body.relaxed?.left ?? null, near: body.near === true, header: r.headers.get('x-search-left') };
}

describe('the genus reading comes last, and only for a genus of the reference (search 1, 2, 5)', () => {
  it('"Echeveria Lola" and "Haworthia Big Band" answer their genus, labelled as a retry, never by a similar spelling', async () => {
    const a = await ask('Echeveria Lola');
    expect(a).toMatchObject({ names: ['Echeveria elegans', 'Echeveria lilacina', 'Echeveria lozanoi'], relaxed: 'Echeveria', left: null, near: false });
    const b = await ask('Haworthia Big Band');
    expect(b.relaxed).toBe('Haworthia');
    expect(b.names).toEqual(['Haworthia cooperi', 'Haworthia truncata']); // the genus's own species, not Haworthiopsis
  });
  it('a misspelt genus with a cultivar answers the genus by a similar spelling: "Echeverai Lola"', async () => {
    const a = await ask('Echeverai Lola');
    expect(a.names[0]).toMatch(/^Echeveria /);
    expect(a.near).toBe(true);
  });
  it('a title-case phrase whose first word is no genus never shrinks to its first word', async () => {
    expect(await ask('Purple Haze Thing')).toMatchObject({ names: [], relaxed: null });
    expect(await ask('Snake Plnat')).toMatchObject({ names: ['Dracaena trifasciata'], relaxed: null, near: true });
  });
  it('a capitalised typo of an epithet answers the species, by a similar spelling: "Copiapoa Cinereaa"', async () => {
    expect(await ask('Copiapoa Cinereaa')).toMatchObject({ names: ['Copiapoa cinerea'], relaxed: null, near: true });
  });
  it('the postings and the whole index answer each alike', async () => {
    for (const q of ['Echeveria Lola', 'Haworthia Big Band', 'Echeverai Lola', 'Purple Haze Thing', 'Snake Plnat', 'Copiapoa Cinereaa', 'Aloe Verra', 'St Johns Wort', 'Copiapoa near cinerea', 'Copiapoa vel aff. cinerea', 'Echeveria cv. Lola', 'Aloe вера', 'Aloe vera L.', 'sp. Black eyed Susan']) {
      expect({ q, ...(await ask(q, plain)) }).toEqual({ q, ...(await ask(q)) });
    }
  });
});

describe('a reading that matched says what it left out; a retry does not (search 3)', () => {
  it('an author pasted after the name', async () => {
    expect(await ask('Copiapoa cinerea Phil.')).toMatchObject({ names: ['Copiapoa cinerea'], relaxed: 'Copiapoa cinerea', left: 'Phil.', header: 'Phil.' });
    expect((await ask('Copiapoa cinerea (Phil.) Britton & Rose')).left).toBe('(Phil.) Britton & Rose');
  });
  it('a cultivar after "cv." and a word the search cannot read (search 8, 9)', async () => {
    expect(await ask('Echeveria cv. Lola')).toMatchObject({ relaxed: 'Echeveria', left: 'cv. Lola', near: false });
    expect(await ask('Aloe вера')).toMatchObject({ relaxed: 'Aloe', left: 'вера' });
  });
  it('a retry carries no "left": nothing matched as written', async () => {
    expect(await ask('Copiapoa cinerea var. inventa')).toMatchObject({ names: ['Copiapoa cinerea'], relaxed: 'Copiapoa cinerea', left: null });
  });
  it('"Aloe vera L." is labelled whatever its English names (search 18)', async () => {
    expect(await ask('Aloe vera L.')).toMatchObject({ names: ['Aloe vera'], relaxed: 'Aloe vera', left: 'L.' });
  });
});

describe('the qualifiers "near" and "vel aff." are words elsewhere (guard, search 7)', () => {
  it('"near" first, or last, is a word; the qualifier is never said as left out', async () => {
    expect(relaxedQuery('Copiapoa near cinerea')).toBeNull();
    expect((await ask('Copiapoa near cinerea')).relaxed).toBeNull();
    expect(search(prepare(IDX as never[]), 'vel')).toEqual([]);
  });
});

describe('the name parser (search 13; triage N10)', () => {
  it.each([
    ['Aloe ×spinosissima', 'Aloe × spinosissima'],
    ["St. John's wort", "St. John's wort"],
    ['Gymnocalycium LB 123', 'Gymnocalycium LB 123'],
    ['Lithops C 036', 'Lithops C 036'],
    ['Lithops lesliei C036', 'Lithops lesliei C036'],
    ['× Gasteraloe beguinii', '× Gasteraloe beguinii'],
    ["x Gasteraloe 'Green Ice'", '× Gasteraloe'],
    ['Ｃｏｐｉａｐｏａ ｃｉｎｅｒｅａ', 'Copiapoa cinerea'],
    ['Copia​poa cinerea', 'Copiapoa cinerea'],
    ['Copiapoa cinerea fo. columna-alba', 'Copiapoa cinerea f. columna-alba'],
    ['Copiapoa cinerea variety columna-alba', 'Copiapoa cinerea var. columna-alba'],
    ['Copiapoa cinerea subspecies columna-alba', 'Copiapoa cinerea subsp. columna-alba'],
    ['copiapoa CINEREA', 'Copiapoa cinerea']
  ])('%j is filed as %j', (typed, want) => expect(parseName(typed).scientific).toBe(want));
  it('the nothogenus keeps its sign and its species address', () => {
    expect(parseName('× Gasteraloe beguinii')).toMatchObject({ genus: 'Gasteraloe', epithet: 'beguinii', kind: 'hybrid' });
    expect(speciesSlug('× Gasteraloe beguinii')).toBe('gasteraloe-beguinii');
  });
});

describe('the picker (search 4, 5, 6, 10, 11, 12, 14; the grower review, 9)', () => {
  it('asks the name service about a capitalised epithet in lower case, and a cultivar of several words by its genus', () => {
    expect(requestName('Copiapoa Tenuissima')).toBe('Copiapoa tenuissima');
    expect(requestName('Echeveria Lola')).toBe('Echeveria lola');
    expect(requestName('Mammillaria Spinosissima Un Pico')).toBe('Mammillaria');
    expect(requestName('× Gasteraloe beguinii')).toBe('Gasteraloe beguinii');
    expect(requestName("× Gasteraloe 'Green Ice'")).toBe('Gasteraloe');
  });
  it('sends the catalogue the text whole, cleaned', () => {
    expect(searchText('  Black eyed​  Susan ')).toBe('Black eyed Susan');
    expect(searchText('Ｃｏｐｉａｐｏａ ｃｉｎｅｒｅａ Phil.')).toBe('Copiapoa cinerea Phil.');
  });
  it('a field number is no cultivar shape', () => {
    expect(cultivarRest('Gymnocalycium LB 123')).toBeNull();
    expect(cultivarRest('Echeveria Lola')).toEqual({ genus: 'Echeveria', rest: 'Lola' });
  });
  it('a nothovariety, and a variety typed with a capital, are kept with no key', () => {
    const sp = { name: 'Copiapoa cinerea', rank: 'SPECIES' };
    expect(pickedName('Copiapoa cinerea nothovar. columna-alba', sp)).toBe('Copiapoa cinerea nothovar. columna-alba');
    expect(pickedName('Copiapoa cinerea var. Columna-alba', sp)).toBe('Copiapoa cinerea var. columna-alba');
    expect(filesKey('Copiapoa cinerea nothovar. columna-alba', sp)).toBe(false);
  });
  it('the genus picked for a name with no epithet keeps the rest: a field number, a nothogenus', () => {
    expect(pickedName('Gymnocalycium LB 123', { name: 'Gymnocalycium', rank: 'GENUS' })).toBe('Gymnocalycium LB 123');
    expect(filesKey('Gymnocalycium LB 123', { name: 'Gymnocalycium', rank: 'GENUS' })).toBe(false);
    expect(pickedName("x Gasteraloe 'Green Ice'", { name: 'Gasteraloe', rank: 'GENUS' })).toBe("× Gasteraloe 'Green Ice'");
    expect(filesKey("x Gasteraloe 'Green Ice'", { name: 'Gasteraloe', rank: 'GENUS' })).toBe(true);
  });
  it('a pick that leaves typed words out gives the typed text, to be filed as the name as received', () => {
    const sp = { name: 'Copiapoa cinerea', rank: 'SPECIES' };
    expect(droppedByPick('Copiapoa cinerea Pan de Azucar', pickedName('Copiapoa cinerea Pan de Azucar', sp))).toBe('Copiapoa cinerea Pan de Azucar');
    expect(droppedByPick('Copiapoa cinerea Phil.', pickedName('Copiapoa cinerea Phil.', sp))).toBe('Copiapoa cinerea Phil.');
    expect(droppedByPick('Copiapoa cinerea var. columna-alba', pickedName('Copiapoa cinerea var. columna-alba', { name: 'Lithops lesliei' }))).toBe('Copiapoa cinerea var. columna-alba');
  });
  it('guard: a pick that only corrects a spelling, a case or a rank\'s spelling leaves nothing out', () => {
    const sp = { name: 'Copiapoa cinerea', rank: 'SPECIES' };
    for (const t of ['copiapoa cinera', 'Copiapoa Cinerea', 'Copiapoa cinerea fo. columna-alba', 'Copiapoa cf. cinerea', 'Copiapoa cinerea']) expect(droppedByPick(t, pickedName(t, sp))).toBeNull();
  });
});

describe('the common-name set-back reads no capitals (search 16)', () => {
  const GENERA = generaOf(['Colchicum autumnale', 'Crocus sativus', 'Curio rowleyanus', 'Senecio vulgaris', 'Moraea villosa', 'Iris germanica', 'Aristaloe aristata', 'Aloe vera', 'Gonialoe variegata', 'Haworthiopsis fasciata', 'Haworthia cooperi', 'Zantedeschia aethiopica', 'Arum italicum', 'Selenicereus grandiflorus', 'Cereus jamacaru', 'Hylotelephium spectabile', 'Sedum acre']);
  const shown = (names: string[], genus: string) => englishNames(names.map((name) => ({ name, lang: 'eng' })), { genus, genera: GENERA }).common;
  it.each([
    ['Aristaloe aristata', 'Lace Aloe'], ['Colchicum autumnale', 'Autumn Crocus'], ['Haworthiopsis fasciata', 'Zebra Haworthia'], ['Zantedeschia aethiopica', 'Arum Lily'],
    ['Selenicereus grandiflorus', 'Night-Blooming Cereus'], ['Moraea villosa', 'Peacock Iris'], ['Aristaloe aristata', 'lace aloe']
  ])('%s keeps %j in any case', (species, name) => expect(shown([name, 'Other name'], species)).toBe(name.charAt(0).toUpperCase() + name.slice(1)));
  it.each([
    ['Curio rowleyanus', 'String-Of-Beads Senecio'], ['Curio rowleyanus', 'string-of-beads senecio'], ['Curio rowleyanus', 'FLATLEAF SENECIO'],
    ['Hylotelephium spectabile', 'Showy Sedum'], ['Gonialoe variegata', 'Aloe Variegata']
  ])('%s sets %j back', (species, name) => expect(shown([name, 'Other name'], species)).toBe('Other name'));
});

describe('the names mark survives a build, and the audit can say what the step changed (search 17, 18)', () => {
  it('a build that asked GBIF writes the mark; an offline re-derivation carries it; any other record keeps its detail', () => {
    expect(vernacularMark({ status: 'ok', at: '2026-10-09T10:00:00Z' }, null)).toBe('names fetched 2026-10-09');
    expect(vernacularMark({ status: 'ok', at: '2026-10-09T10:00:00Z', detail: 'truncated: the first 4000 rows only' }, null)).toBe('names fetched 2026-10-09; truncated: the first 4000 rows only');
    const carried = vernacularMark({ status: 'ok', at: '2026-10-12T10:00:00Z', detail: 'carried from build of 2026-10-09 (offline re-derivation; the backbone was not asked)' }, { detail: 'names fetched 2026-10-01; truncated: the first 4000 rows only' });
    expect(carried).toBe('names fetched 2026-10-01; truncated: the first 4000 rows only; carried by an offline re-derivation of 2026-10-12');
    expect(vernacularMark({ status: 'ok', at: '2026-10-13T10:00:00Z' }, { detail: carried })).toBe('names fetched 2026-10-01; truncated: the first 4000 rows only; carried by an offline re-derivation of 2026-10-13');
    expect(vernacularMark({ status: 'refused', at: '2026-10-09T10:00:00Z', detail: '429' }, null)).toBe('429');
    expect(vernacularMark({ status: 'ok', at: '2026-10-12T10:00:00Z', detail: 'carried from build of 2026-10-09' }, { detail: undefined })).toBe('carried from build of 2026-10-09');
  });
  it('diffs the shown common name between two indexes', () => {
    const d = diffCommonNames([{ name: 'Curio rowleyanus', common: 'String-Of-Beads Senecio' }, { name: 'Aloe vera', common: 'Barbados aloe' }, { name: 'Gone one', common: 'x' }], [{ name: 'Curio rowleyanus', common: 'String-of-Pearls' }, { name: 'Aloe vera', common: 'Barbados aloe' }, { name: 'New one' }]);
    expect(d).toEqual({ species: 2, changed: 1, sample: ['Curio rowleyanus: "String-Of-Beads Senecio" -> "String-of-Pearls"'] });
    expect(auditArgs(['new.json', '--before', 'old.json', '--sample=5'])).toEqual({ src: 'new.json', before: 'old.json', sample: 5, json: false });
  });
});

describe('a plant number under the collection\'s own scheme stays on the device (triage N4)', () => {
  it.each([
    ['2026-0013', null, true], ['ACC-0013', { mode: 'prefix', prefix: 'ACC' }, true], ['acc 13', { mode: 'prefix', prefix: 'ACC' }, true], ['ACC-', { mode: 'prefix', prefix: 'ACC' }, true],
    ['S2026-001', { mode: 'year' }, true], ['ACC-0013', { mode: 'year' }, false], ['Sedum acre', null, false], ['Aloe vera', { mode: 'prefix', prefix: 'ALOE' }, false], ['Accra', { mode: 'prefix', prefix: 'ACC' }, false]
  ] as const)('%s under %j: %s', (t, scheme, want) => expect(plantNumberShaped(t, scheme as never)).toBe(want));
});
