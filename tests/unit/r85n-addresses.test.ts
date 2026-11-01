/**
 * Round eighty-five (N): every old address resolves (review-d D5, review-s S10, outside review A15), and a one-word name
 * another genus's species is given more often and grown more is that species' (review-d D13).
 *
 * 1. An address two pages hold as an older name is the page whose own heading it was until Kew's name headed it
 *    (`mergedHolder` reads `name.gbif.slug` and `name.formerly`): /species/ceropegia-edulis is Caudanthera edulis, though
 *    Ceropegia bulbosa holds the name too; /species/dypsis-lutescens has one holder once Kew's file is read.
 * 2. A former heading the index makes an older name of the page is an address of it (`indexMaps`).
 * 3. "Beet" heads Beta vulgaris and not Patellifolia procumbens (`sharedHeadlines` across genera, both counts agreeing).
 * 4. A Kew older name spelt as another page's accepted name is another author's name (`hom`), not "older name" (A9c).
 *
 * FAILS on r85base: `mergedHolder` reads only merged keys, so both addresses answered 404; `sharedHeadlines` compared one
 * genus at a time. Checked by running this file on a checkout of r85base.
 */
import { describe, it, expect } from 'vitest';
import { mergedHolder } from '$lib/server/lookup';
import { indexMaps, type Ref } from '$dossier/lookups';
import { sharedHeadlines, homonymEntries } from '$dossier/index-entry';
import type { IndexEntry } from '$dossier/index-entry';

describe("a page's former heading is its address (D5, S10, A15)", () => {
  const holders: Ref[] = [['k502451', 'caudanthera-edulis', 'Caudanthera edulis'], ['k502573', 'ceropegia-bulbosa', 'Ceropegia bulbosa']];
  it('/species/ceropegia-edulis is Caudanthera edulis, whose heading it was', () => {
    const records = [{ name: { gbif: { slug: 'ceropegia-edulis' } } }, { name: {} }];
    expect(mergedHolder('ceropegia-edulis', holders, records)).toEqual(holders[0]);
    // A former heading of the page's Kew entry counts the same.
    expect(mergedHolder('stapelia-hirsuta-var-hirsuta', [['k512033', 'stapelia-hirsuta', 'Stapelia hirsuta'], holders[1]], [{ name: { formerly: ['Stapelia hirsuta var. hirsuta'] } }, null])).toEqual(['k512033', 'stapelia-hirsuta', 'Stapelia hirsuta']);
    // Two such pages, or none: neither (the 404 names them).
    expect(mergedHolder('ceropegia-edulis', holders, [{ name: { gbif: { slug: 'ceropegia-edulis' } } }, { name: { gbif: { slug: 'ceropegia-edulis' } } }])).toBeNull();
    expect(mergedHolder('ceropegia-edulis', holders, [null, null])).toBeNull();
    // A merge's old address still wins.
    expect(mergedHolder('ceropegia-edulis', holders, [{ name: { gbif: { slug: 'ceropegia-edulis' } } }, { occurrences: { keys: [{ slug: 'ceropegia-edulis' }] } }])).toEqual(holders[1]);
  });
  it('a former heading the index holds as an older name moves to the page', () => {
    const idx = [
      { key: 'k2734813', slug: 'conophytum-calculus-subsp-vanzylii', name: 'Conophytum calculus subsp. vanzylii', origin: [], photos: 0, open: 0, climate: 'none', older: ['Conophytum calculus vanzylii'] },
      { key: 'k39866', slug: 'chrysalidocarpus-lutescens', name: 'Chrysalidocarpus lutescens', origin: [], photos: 0, open: 0, climate: 'none', syn: ['Dypsis lutescens'] },
      // Hyophorbe indica no longer holds Dypsis lutescens: Kew's file places it in Chrysalidocarpus lutescens alone.
      { key: 'k101290', slug: 'hyophorbe-indica', name: 'Hyophorbe indica', origin: [], photos: 0, open: 0, climate: 'none', syn: ['Hyophorbe amaricaulis'] }
    ] as unknown as IndexEntry[];
    const m = indexMaps(idx);
    expect(m.bySynonym.get('conophytum-calculus-vanzylii')?.entry.key).toBe('k2734813');
    expect(m.bySynonym.get('dypsis-lutescens')?.entry.key).toBe('k39866');
    expect(m.ambiguous.has('dypsis-lutescens')).toBe(false);
  });
});

describe('a one-word name across genera (D13)', () => {
  it('"Beet" is Beta vulgaris\'s; a name each genus has a claim to is taken from neither on one count', () => {
    const pages = [
      { key: 'k2675613', genus: 'Beta', names: new Map([['beet', 5]]), grown: 4854 },
      { key: 'k2409103', genus: 'Patellifolia', names: new Map([['beet', 1]]), grown: 4 },
      // More sources but fewer growers: no name taken.
      { key: 'k1', genus: 'Acer', names: new Map([['sycamore', 4]]), grown: 100 },
      { key: 'k2', genus: 'Platanus', names: new Map([['sycamore', 2]]), grown: 500 },
      // A page the species list does not count loses nothing across genera.
      { key: 'k3', genus: 'Prunus', names: new Map([['almond', 1]]) },
      { key: 'k4', genus: 'Terminalia', names: new Map([['almond', 3]]), grown: 900 }
    ];
    const s = sharedHeadlines(pages);
    expect(s.get('k2409103')).toEqual(['beet']);
    expect(s.get('k2675613')).toBeUndefined();
    expect(s.get('k1')).toBeUndefined();
    expect(s.get('k2')).toBeUndefined();
    expect(s.get('k3')).toBeUndefined();
  });
});

describe("Kew's homonym of another page's name (A9c)", () => {
  it('Acacia linearifolia holds Kew\'s Acacia adunca Maiden as another author\'s name, not as an older name', () => {
    const idx = [
      { key: 'k2611144', name: 'Acacia adunca', syn: ['Racosperma aduncum'] },
      { key: 'k3226011', name: 'Acacia linearifolia', syn: ['Racosperma linearifolium'], kew: ['Acacia adunca', 'Acacia linearis'] }
    ];
    const h = homonymEntries(idx as never, () => ({ authorship: '', synonyms: [] }));
    const e = h.index.find((x) => x.key === 'k3226011') as { kew?: string[]; hom?: string[] };
    expect(e.kew).toEqual(['Acacia linearis']);
    expect(e.hom).toEqual(['Acacia adunca']);
    expect(h.index.find((x) => x.key === 'k2611144')).toEqual(idx[0]);
  });
});
