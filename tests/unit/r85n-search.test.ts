/**
 * Round eighty-five (N): the search (review-s S5, S6, S12; outside review A14).
 *
 * 1. "tulip": a species whose genus begins with the word and that holds it as a common name of its own is ranked among
 *    the common names' hits, not after them: Tulipa gesneriana, "Tulip", first.
 * 2. "baobab", "saffron", "houseleek": growers' counts (`grown`, the species list's) break a tie before the photographs.
 * 3. "Sulcorebutia": an older genus typed alone lists the genus most of its names went to first.
 * 4. Misspelt genera: "mamilaria" is Mammillaria, "sansevera" the Dracaenas once Sansevieria (`nearestGenus`, with the
 *    older genera of `older-genera.json`); "x Gasteraloe" gets no shorter reading.
 * 5. Growers' counts reach the Worker's search through the key files' blocks.
 * 6. English names in Icelandic letters, or ending in a stray modifier letter, are not shown (S12).
 *
 * FAILS on r85base: "tulip" put Tulipa gesneriana after every other tulip; there is no `grown`, `nearestGenus` or
 * `olderGeneraOf`; "Sulcorebutia" put Copiapoa cinerascens first; "x Gasteraloe" was read as "gasteral"; `latinName`
 * kept "Ætihvönn". Checked by running this file on a checkout of r85base.
 */
import { describe, it, expect } from 'vitest';
import { prepare, search, nearestGenus, shorterReadings, type Searchable } from '$core/search';
import { olderGeneraOf } from '$dossier/products';
import { latinName } from '$dossier/index-entry';
import { buildSearchFiles, searchFromFiles, type SearchReader, type Blocks, type Dir, type Answers, type Tables } from '$core/search-files';
import { md5 } from '$dossier/md5';

type E = Searchable & { key: string; slug: string };
const e = (name: string, x: Partial<E> = {}): E => ({ key: `k${name.length}${name.charCodeAt(1)}`, slug: name.toLowerCase().replace(/ /g, '-'), name, photos: 10, ...x });
const names = (hits: E[]) => hits.map((h) => h.name);

describe('tulip, baobab, saffron (S5, A14)', () => {
  const index = [
    e('Liriodendron tulipifera', { common: 'Tulip tree', photos: 117, grown: 14192 }),
    e('Heritiera littoralis', { common: 'Beach tulip-oak', photos: 108 }),
    e('Tulipa sylvestris', { common: 'Wild tulip', commons: ['Tulip'], photos: 105, grown: 672 }),
    e('Tulipa gesneriana', { common: 'Garden tulip', commons: ["Didier's tulip", 'Tulip'], photos: 97, grown: 27319 }),
    e('Tulipa clusiana', { common: 'Lady tulip', photos: 90, grown: 900 }),
    e('Adansonia gregorii', { common: 'Australian baobab', spellings: ['baobab'], photos: 84, grown: 120 }),
    e('Adansonia digitata', { common: 'Baobab', commons: ['African baobab'], photos: 82, grown: 1163 }),
    e('Elaeodendron croceum', { common: 'Common-saffron', commons: ['Saffron', 'Saffronwood'], photos: 103, grown: 65 }),
    e('Crocus sativus', { common: 'Saffron crocus', commons: ['Saffron', 'Autumn crocus'], photos: 44, grown: 359 })
  ];
  const p = prepare(index);
  it('"tulip" is Tulipa gesneriana first, the tulips among the common names', () => {
    expect(names(search(p, 'tulip')).slice(0, 3)).toEqual(['Tulipa gesneriana', 'Tulipa sylvestris', 'Liriodendron tulipifera']);
  });
  it('"baobab" is Adansonia digitata, "saffron" Crocus sativus', () => {
    expect(names(search(p, 'baobab'))[0]).toBe('Adansonia digitata');
    expect(names(search(p, 'saffron'))[0]).toBe('Crocus sativus');
  });
  it('without growers\' counts (an index built before) the photographs decide, as before', () => {
    const q = prepare(index.map(({ grown: _g, ...x }) => x as E));
    expect(names(search(q, 'saffron'))[0]).toBe('Elaeodendron croceum');
  });
});

describe('an older genus typed alone (A14)', () => {
  it('"Sulcorebutia" lists the Weingartia its names went to before the one Copiapoa holding a stray name', () => {
    const index = [
      e('Copiapoa cinerascens', { older: ['Sulcorebutia ambigua'], photos: 61 }),
      e('Weingartia canigueralii', { syn: ['Sulcorebutia canigueralii'], photos: 29 }),
      e('Weingartia mentosa', { syn: ['Sulcorebutia mentosa'], photos: 10 })
    ];
    expect(names(search(prepare(index), 'Sulcorebutia'))).toEqual(['Weingartia canigueralii', 'Weingartia mentosa', 'Copiapoa cinerascens']);
  });
});

describe('misspelt genera and nothogenera (S6)', () => {
  it('reads a first word two letters off as the one nearest genus', () => {
    const genera = ['Mammillaria', 'Maxillaria', 'Euphorbia', 'Haworthia', 'Dracaena', 'Sansevieria'];
    expect(nearestGenus('mamilaria', genera)).toBe('Mammillaria');
    expect(nearestGenus('euforbia', genera)).toBe('Euphorbia');
    expect(nearestGenus('sansevera', genera)).toBe('Sansevieria');
    expect(nearestGenus('sansiveria', genera)).toBe('Sansevieria');
    // A genus as typed, a short word, or a word two genera are as near to and neither by letters left out: none.
    expect(nearestGenus('Euphorbia', genera)).toBeNull();
    expect(nearestGenus('alo', genera)).toBeNull();
    expect(nearestGenus('mazillaria', ['Mammillaria', 'Maxillaria', 'Mazillarja'])).toBeNull();
  });
  it('the older genera of the reference are a product the route reads', () => {
    const index = [e('Dracaena trifasciata', { syn: ['Sansevieria trifasciata'] }), e('Dracaena hyacinthoides', { syn: ['Sansevieria hyacinthoides'] }), e('Dracaena masoniana', { older: ['Sansevieria masoniana'] }), e('Dracaena fragrans', { syn: ['Pleomele fragrans'] })];
    expect(olderGeneraOf(index)).toEqual([['Sansevieria', 3]]);
  });
  it('a nothogenus typed with its sign is not read from fewer letters', () => {
    expect(shorterReadings('x Gasteraloe')).toEqual([]);
    expect(shorterReadings('× Gasteraloe')).toEqual([]);
    expect(shorterReadings('lithops lesleyi')).toContain('lithops lesl');
  });
});

describe("growers' counts in the Worker's key files (A14)", () => {
  it('the search from files ranks "saffron" as the index does', async () => {
    const index = [
      e('Elaeodendron croceum', { common: 'Common-saffron', commons: ['Saffron'], photos: 103, grown: 65 }),
      e('Crocus sativus', { common: 'Saffron crocus', commons: ['Saffron'], photos: 44, grown: 359 })
    ];
    const whole = prepare(index);
    const built = buildSearchFiles(index, whole, md5);
    const blocks = JSON.parse(built.named.get('search/blocks.json')!) as Blocks;
    expect(Array.isArray(blocks.grown)).toBe(true);
    const text = (h: string) => built.stored.get(h)!;
    const r: SearchReader<E> = {
      dirs: [...built.named.keys()].filter((n) => /^search\/\d+\.json$/.test(n)).length,
      dir: async (n) => JSON.parse(built.named.get(`search/${n}.json`)!) as Dir,
      node: async (h) => text(h),
      answers: async (h) => JSON.parse(text(h)) as Answers,
      genera: async () => new Set(JSON.parse(built.named.get('search/genera.json')!) as string[]),
      tables: async () => JSON.parse(built.named.get('search/tables.json')!) as Tables,
      photos: async (b) => JSON.parse(text(blocks.photos[b])) as number[],
      grown: async (b) => (blocks.grown?.[b] ? (JSON.parse(text(blocks.grown[b])) as number[]) : null),
      show: async (b) => JSON.parse(text(blocks.show[b])) as E[]
    };
    const a = await searchFromFiles(r, 'saffron', 10);
    expect('hits' in a && a.hits.map((h) => h.name)[0]).toBe('Crocus sativus');
  });
});

describe('English names (S12)', () => {
  it('drops Icelandic letters and a trailing modifier letter, and keeps a Danish ø in a person\'s name', () => {
    expect(latinName('Ætihvönn')).toBeNull();
    expect(latinName('Garðabrúða')).toBeNull();
    expect(latinName('Wild Bell Appleˌ')).toBe('Wild Bell Apple');
    expect(latinName("Holbøll's Rockcress")).toBe("Holbøll's Rockcress");
    expect(latinName('ʻōhiʻa')).toBe('ʻōhiʻa');
  });
});
