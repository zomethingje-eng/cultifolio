/**
 * Round eighty-two (S): an older name spelt as another page's accepted name, by another author, is never shown as an
 * older name in the index or the search's rows (review 1's 3; rule 3).
 *
 * The live index carried "Sempervivum montanum" in Sempervivum tectorum's `syn`, and the search's row said "Sempervivum
 * tectorum · older name: Sempervivum montanum", where the record's name is S. montanum Sibth. & Sm. and the page S.
 * montanum is Linnaeus's: 1,691 pages carried such a name in `syn` (1,802 pairs) and 1,413 in `older`. The index now
 * keeps them apart (`hom`, with the authors the record writes, `homBy`; `homonymEntries`):
 *
 * 1. Moved: a name the record writes by another author, or with none. Kept as an older name: one the record writes by
 *    the other page's own author (the one name, which GBIF files under both). Left to its own rule: a name the record
 *    holds only as the first parent of a hybrid formula (review 1's 27, agent F's).
 * 2. What reads the index's names besides the search reads every name it read before: the photograph rules
 *    (`heldNamesOf`) and the addresses and `?was=` (`indexMaps`).
 * 3. The search reaches the species by such a name only as the name typed, after the page of that name and after every
 *    species holding it as an older name of its own, and the row says it as another author's name; "montanum" alone no
 *    longer finds S. tectorum. The key files answer as the whole index does, and read a file built before as before.
 *
 * FAILS on r82base: `homonymEntries`, `homTyped` and `homonymOf` do not exist (and on the base's index "montanum" alone
 * answers Sempervivum tectorum, by the name in its `syn`).
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { _forgetIndex, type IndexEntry } from '$lib/server/dossiers';
import { buildProducts } from '$dossier/products';
import { manifestPath, productPath } from '$dossier/manifest';
import { olderNamesOf, homonymEntries } from '$dossier/index-entry';
import { heldNamesOf } from '$dossier/photo-kind';
import { indexMaps } from '$dossier/lookups';
import { prepare, search, homTyped } from '$core/search';
import { buildSearchFiles } from '$core/search-files';
import { olderNameOf, homonymOf } from '$lib/ui/ref/searched';
import { resetRateLimits } from '$lib/server/sync';
import { gbifPage, type PageId } from '$core/page-id';
import { GET as searchGet } from '../../src/routes/api/search/+server';
import { synthIndex, reseed } from './helpers/corpus-synth';

reseed(821);
type Rec = { authorship: string; synonyms: string[] };
const records = new Map<PageId, Rec>();
let n = 0;
/** A page as `indexEntry` makes it: its `syn` and `older` from its record by `olderNamesOf`. */
const page = (name: string, authorship: string, synonyms: string[] = [], o: Partial<IndexEntry> = {}): IndexEntry => {
  n++;
  const key = gbifPage(9_200_000 + n);
  records.set(key, { authorship, synonyms });
  const { syn, older } = olderNamesOf(name, synonyms);
  return { key, gbif: 9_200_000 + n, slug: name.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, ''), name, family: 'Crassulaceae', origin: ['Alps'], photos: 10, open: 3, climate: 'ok', ...(syn.length ? { syn } : {}), ...(older.length ? { older } : {}), ...o } as IndexEntry;
};
const OWN: IndexEntry[] = [
  page('Sempervivum tectorum', 'L.', ['Sempervivum montanum Sibth. & Sm.', 'Sempervivum requienii Hort.', 'Sempervivum tectorium Ser.'], { common: 'House-leek', photos: 64 }),
  page('Sempervivum montanum', 'L.', [], { common: 'Mountain houseleek', photos: 57 }),
  // Another species holding "Sempervivum montanum" as an older name of its own, by Linnaeus (an invented case): it
  // comes before the species that holds Sibthorp and Smith's name.
  page('Sempervivum alpinum', 'Griseb. & Schenk', ['Sempervivum montanum L.'], { photos: 3 }),
  // GBIF writes the name by the other page's own author, loosely ("DeBoer", "de Boer"): the one name, kept.
  page('Lithops bromfieldii', 'L.Bolus', ['Lithops glaudinae DeBoer']),
  page('Lithops glaudinae', 'de Boer'),
  // The record writes it with no author: moved, and said so.
  page('Abies amabilis', '(Douglas ex Loudon) J.Forbes', ['Abies grandis', 'Pinus amabilis Douglas ex Loudon']),
  page('Abies grandis', '(Douglas ex D.Don) Lindl.'),
  // A hybrid formula cut to its first parent (review 1's 27): left as it is, for its own rule.
  page('Mentha piperita', 'L.', ['Mentha aquatica × spicata', 'Mentha officinalis Hull']),
  page('Mentha aquatica', 'L.')
];
const BASE: IndexEntry[] = [...(synthIndex(300).idx as unknown as IndexEntry[]), ...OWN].sort((a, b) => a.name.localeCompare(b.name));
const H = homonymEntries(BASE, (k) => records.get(k));
const IDX = H.index;
const by = (name: string) => IDX.find((e) => e.name === name)!;

type Built = ReturnType<typeof buildProducts>;
let built: Built;
beforeAll(() => { built = buildProducts(IDX, JSON.stringify(IDX, null, 1), () => new Map(), '2026-10-23T00:00:00Z'); }, 240_000);
function bucket(m: Map<string, string>) {
  const obj = (k: string) => ({ text: async () => m.get(k)!, json: async () => JSON.parse(m.get(k)!), etag: `"${k}:${m.get(k)!.length}"`, body: m.get(k)! });
  return { get: async (k: string) => (m.has(k) ? obj(k) : null), head: async (k: string) => (m.has(k) ? { etag: `"${k}:${m.get(k)!.length}"` } : null) };
}
function platform(kind: 'files' | 'whole') {
  const m = new Map<string, string>();
  if (kind === 'whole') m.set('s/v3/index.json', JSON.stringify(IDX));
  else {
    m.set(manifestPath(), JSON.stringify(built.manifest));
    for (const [nm, body] of built.files) m.set(productPath(built.manifest.files[nm]), body);
    for (const [h, body] of built.stored) m.set(productPath(h), body);
  }
  return { env: { STORE: bucket(m) } } as unknown as App.Platform;
}
const noStatic = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;
async function ask(pl: App.Platform, q: string) {
  resetRateLimits();
  _forgetIndex();
  const url = new URL(`https://cultifolio.com/api/search?q=${encodeURIComponent(q)}&n=100&shape=2`);
  const r = await searchGet({ params: {}, platform: pl, fetch: noStatic, url, request: new Request(url), getClientAddress: () => '192.0.2.82', setHeaders: () => {} } as never);
  const body = await r.text();
  return { status: r.status, body, json: JSON.parse(body) as { hits: IndexEntry[] } };
}
const names = (hs: IndexEntry[]) => hs.map((h) => h.name);

beforeEach(() => { _forgetIndex(); resetRateLimits(); vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());

describe('the index keeps a name by another author apart (review 1\'s 3)', () => {
  it('moves a name by another author or by none, keeps the other page\'s own, and leaves a cut formula', () => {
    expect(BASE.find((e) => e.name === 'Sempervivum tectorum')!.syn).toContain('Sempervivum montanum'); // as the live index has it
    const st = by('Sempervivum tectorum');
    expect(st.syn).toEqual(['Sempervivum requienii', 'Sempervivum tectorium']);
    expect(st.hom).toEqual(['Sempervivum montanum']);
    expect(st.homBy).toEqual([['Sibth. & Sm.']]);
    // By the other page's own author: the one name, kept as an older name (Linnaeus's; "DeBoer" read as "de Boer").
    expect(by('Sempervivum alpinum').syn).toEqual(['Sempervivum montanum']);
    expect(by('Sempervivum alpinum').hom).toBeUndefined();
    expect(by('Lithops bromfieldii').syn).toEqual(['Lithops glaudinae']);
    // With no author in the record: moved, with no author given.
    expect(by('Abies amabilis').hom).toEqual(['Abies grandis']);
    expect(by('Abies amabilis').homBy).toBeUndefined();
    expect(by('Abies amabilis').syn).toEqual(['Pinus amabilis']);
    // A hybrid formula's first parent: left to the formula's own rule, which since the merge of round eighty-two (F's
    // review 1's 27) takes it out of the index's older names; never moved to `hom`.
    expect(by('Mentha piperita').syn ?? []).not.toContain('Mentha aquatica');
    expect(by('Mentha piperita').syn).toEqual(['Mentha officinalis']);
    expect(by('Mentha piperita').hom).toBeUndefined();
    const mine = new Set(OWN.map((e) => e.name));
    expect(IDX.filter((e) => mine.has(e.name) && e.hom).map((e) => e.name)).toEqual(['Abies amabilis', 'Sempervivum tectorum']);
    expect(H.kept).toBeGreaterThanOrEqual(2);
    expect(H.names).toBe(IDX.reduce((x, e) => x + (e.hom?.length ?? 0), 0));
    // The index given is not changed (the photograph judgement reads it), and an entry with nothing to move is the same object.
    expect(BASE.find((e) => e.name === 'Sempervivum tectorum')!.hom).toBeUndefined();
    expect(IDX.find((e) => e.name === 'Lithops glaudinae')).toBe(BASE.find((e) => e.name === 'Lithops glaudinae'));
    // `hom` and `homBy` together, after `older` (here at the end: no `older`, `kew`, `changed` or `near` follows).
    expect(Object.keys(st).slice(-2)).toEqual(['hom', 'homBy']);
  });

  it('the photograph rules, the addresses and `?was=` read every name they read before', () => {
    const before = heldNamesOf(BASE), after = heldNamesOf(IDX);
    for (const [g, e] of [['Sempervivum', 'montanum'], ['Abies', 'grandis'], ['Sempervivum', 'requienii'], ['Lithops', 'glaudinae']]) {
      expect([...after.holders(g, e)].sort(), `${g} ${e}`).toEqual([...before.holders(g, e)].sort());
      expect(after.accepted(g, e)).toBe(before.accepted(g, e));
    }
    expect([...after.epithets('Sempervivum')].sort()).toEqual([...before.epithets('Sempervivum')].sort());
    const mb = indexMaps(BASE), ma = indexMaps(IDX);
    for (const k of ['sempervivum montanum', 'abies grandis', 'sempervivum-montanum', 'sempervivum requienii']) {
      expect(ma.bySynonym.get(k)?.entry.key, k).toBe(mb.bySynonym.get(k)?.entry.key);
      expect(ma.ambiguous.get(k)?.map((e) => e.key), k).toEqual(mb.ambiguous.get(k)?.map((e) => e.key));
    }
  });
});

describe('the search reaches it only as the name typed, and says whose name it is', () => {
  it('"Sempervivum montanum": the page of that name, the species that holds it as its own, then S. tectorum', () => {
    const p = prepare(IDX);
    expect(names(search(p, 'Sempervivum montanum'))).toEqual(['Sempervivum montanum', 'Sempervivum alpinum', 'Sempervivum tectorum']);
    expect(names(search(p, 'Sempervivum mont'))).toContain('Sempervivum tectorum'); // still being typed
    // Never by a word alone, nor by a similar spelling: "montanum" is the mountain houseleek and Linnaeus's older name.
    expect(names(search(p, 'montanum'))).not.toContain('Sempervivum tectorum'); // base's index: S. tectorum, by its `syn`
    expect(names(search(p, 'Sempervivum montanim'))).not.toContain('Sempervivum tectorum');
    // An older name of its own still finds it, said as before.
    expect(names(search(p, 'Sempervivum requienii'))[0]).toBe('Sempervivum tectorum');
    expect(homTyped(p.find((x) => x.item.name === 'Sempervivum tectorum')!, ['sempervivum', 'montanum'])).toEqual([0]);
  });

  it('the row says "older name under another author", with the record\'s author, never "older name"', () => {
    const st = by('Sempervivum tectorum');
    expect(olderNameOf('Sempervivum montanum', st)).toBeNull(); // base: "Sempervivum montanum"
    expect(homonymOf('Sempervivum montanum', st)).toEqual({ name: 'Sempervivum montanum', text: 'Sempervivum montanum Sibth. & Sm.' });
    expect(homonymOf('Sempervivum montanum', by('Abies amabilis'))).toBeNull();
    expect(homonymOf('Abies grandis', by('Abies amabilis'))).toEqual({ name: 'Abies grandis', text: 'Abies grandis, with no author in the record' });
    expect(homonymOf('Sempervivum requienii', st)).toBeNull(); // an older name of its own: `olderNameOf` says it
    expect(olderNameOf('Sempervivum requienii', st)).toBe('Sempervivum requienii');
    expect(homonymOf('Sempervivum montanum', by('Sempervivum montanum'))).toBeNull();
    expect(olderNameOf('Sempervivum montanum', by('Sempervivum alpinum'))).toBe('Sempervivum montanum');
  });

  it('the key files answer as the whole index does, and a file built before reads as before', async () => {
    for (const q of ['Sempervivum montanum', 'Sempervivum mont', 'montanum', 'Abies grandis', 'Sempervivum requienii', 'sempervivum']) {
      const files = await ask(platform('files'), q);
      const w = await ask(platform('whole'), q);
      expect(names(files.json.hits), q).toEqual(names(search(prepare(IDX), q)).slice(0, 100));
      expect(files.body, q).toBe(w.body);
    }
    // A key file's species with nothing apart is written as before: no field past those it had.
    const b = buildSearchFiles(BASE, prepare(BASE), (s) => String(s.length) + ':' + s.slice(0, 40) + s.length);
    const b2 = buildSearchFiles(IDX, prepare(IDX), (s) => String(s.length) + ':' + s.slice(0, 40) + s.length);
    const docs = (x: typeof b) => [...x.stored.values()].filter((t) => t.startsWith('[[')).flatMap((t) => JSON.parse(t) as Array<[number, unknown[]]>);
    const glaudinae = (x: typeof b) => docs(x).find(([, d]) => d[0] === 'Lithops glaudinae')![1];
    expect(glaudinae(b2)).toEqual(glaudinae(b));
    expect(docs(b2).find(([, d]) => d[0] === 'Sempervivum tectorum')![1][9]).toEqual(['Sempervivum montanum']);
    // The keys hold the species they held: the trees are the same, only the species' files differ.
    const keys = (x: typeof b) => Object.keys(Object.assign({}, ...[...x.named].filter(([k]) => /^search\/(?:top|\d+)\.json$/.test(k)).map(([, v]) => JSON.parse(v)))).sort();
    expect(keys(b2)).toEqual(keys(b));
  });
});
