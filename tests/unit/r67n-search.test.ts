/**
 * Round sixty-seven, search (triage-66 N1, N2, N8) over small indexes: older names past the six shown, a common name
 * read whole against one name, the order within a reading, near hits by distance, and no retry cut after a small word.
 * Each case FAILED on the base unless it says "guard". The same over the real corpus: r67n-search-route.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { prepare, search, relaxedQuery, droppedLabel, type Searchable } from '$core/search';
import { buildPostings, entryWords, queryPlan, candidates, postingFileOf } from '$core/postings';

const idx: Searchable[] = [
  { name: 'Bisnaga glaucescens', syn: ['Cactus a', 'Cactus b', 'Echinocactus c', 'Echinocactus d', 'Echinocactus e', 'Echinocactus f'], older: ['Ferocactus glaucescens'] },
  { name: 'Ferocactus histrix' },
  { name: 'Cochemiea conoidea', syn: ['Mammillaria aa', 'Mammillaria bb', 'Mammillaria cc', 'Mammillaria dd', 'Mammillaria ee', 'Mammillaria ff'], older: ['Neolloydia conoidea', 'Mammillaria conoidea'] },
  { name: 'Cochemiea matehualensis', syn: ['Neolloydia conoidea var. matehualensis'] },
  { name: 'Airampoa corrugata', syn: ['Opuntia longispina'] },
  { name: 'Opuntia orbiculata', syn: ['Opuntia longispina var. intermedia'] },
  { name: 'Achillea millefolium', common: 'Yarrow', commons: ["Snake's grass", 'Nosebleed plant'] },
  { name: 'Dracaena trifasciata', common: "Mother-in-law's tongue", commons: ['Snake plant'] },
  { name: 'Aloe arborescens', common: 'Candelabra aloe', origin: ['Cape Provinces'] },
  { name: 'Aloe ferox', common: 'Cape aloe', origin: ['Cape Provinces'] },
  { name: 'Plumbago auriculata', common: 'Cape leadwort', origin: ['KwaZulu-Natal'] },
  { name: 'Carissa macrocarpa', common: 'Natal plum' },
  { name: 'Colchicum figlalii' },
  { name: 'Magnolia figo' },
  { name: 'Ficus carica', common: 'Fig', commons: ['Common fig'] },
  { name: 'Carpobrotus edulis', common: 'Hottentot fig' },
  { name: 'Albuca bracteata', common: 'Sea-onion' },
  { name: 'Allium cepa', common: 'Onion' },
  { name: 'Ceropegia dicapuae' },
  { name: 'Ceropegia picta' },
  { name: 'Copiapoa cinerea', common: 'Silver cactus' },
  { name: 'Syagrus romanzoffiana', common: 'Queen palm', syn: ['Cocos plumosa'] },
  { name: 'Chrysobalanus icaco', common: 'Coco plum' },
  { name: 'Garcinia mangostana', common: 'Mangosteen', syn: ['Mangostana garcinia'] },
  { name: 'Mangifera indica', common: 'Mango' }
];
const P = prepare(idx);
const names = (q: string, n = 20) => search(P, q, n).map((x) => x.name);

describe('N1: an older name past the six shown is searched', () => {
  it('in the ranking', () => {
    expect(names('Ferocactus glaucescens')).toEqual(['Bisnaga glaucescens']); // base: nothing
    expect(names('Mammillaria conoidea')[0]).toBe('Cochemiea conoidea');
    expect(names('Neolloydia conoidea')).toEqual(['Cochemiea conoidea', 'Cochemiea matehualensis']); // base: matehualensis alone
  });
  it('in the postings', () => {
    expect(entryWords(idx[0] as never)).toContain('ferocactus');
    const posted = buildPostings(idx as never, 4);
    const posting = (k: string) => posted.get(postingFileOf(k, 4))?.[k];
    const ix = candidates(queryPlan('Ferocactus glaucescens').exact, posting);
    expect(ix).toContain(0);
  });
});

describe('N2: a common name is read whole against one name', () => {
  it('never words of two names, nor a place and a name', () => {
    expect(names('snake plant')).toEqual(['Dracaena trifasciata']); // base: Yarrow too, first
    expect(names('cape aloe')[0]).toBe('Aloe ferox'); // base: Aloe arborescens first, by its range
    expect(names('natal plum')[0]).toBe('Carissa macrocarpa'); // base: Plumbago auriculata first
  });
  it('guard: words of one name, and a name with a place, still match', () => {
    expect(names('silver cactus')).toEqual(['Copiapoa cinerea']);
    expect(names('aloe cape')).toContain('Aloe arborescens');
  });
  it('the whole reading, when the botanical one drops words, holds every word in one name', () => {
    expect(droppedLabel('snake plant L.', search(P, 'snake plant L.'))).toBe('snake plant');
  });
});

describe('N8: the order within a reading', () => {
  it('an older name typed as one comes before a variety of that name', () => {
    expect(names('Opuntia longispina')[0]).toBe('Airampoa corrugata'); // base: Opuntia orbiculata first
  });
  it('an older name is typed as one only when its words but the last are written in full', () => {
    expect(names('coco plum')[0]).toBe('Chrysobalanus icaco');
    expect(names('Cocos plumosa')[0]).toBe('Syagrus romanzoffiana'); // guard
    expect(names('Cocos plum')[0]).toBe('Syagrus romanzoffiana'); // guard: the last word on its way
    expect(names('mango')[0]).toBe('Mangifera indica'); // one word is no older name typed
  });
  it('a common name equal to the query, the headline first, before a name it only begins', () => {
    expect(names('fig')[0]).toBe('Ficus carica'); // base: Colchicum figlalii first
    expect(names('onion')[0]).toBe('Allium cepa'); // base: Albuca bracteata first
  });
  it('guard: a name typed as a name still comes first', () => {
    expect(names('cop')[0]).toBe('Copiapoa cinerea');
    expect(names('aloe')).toEqual(['Aloe arborescens', 'Aloe ferox']);
  });
  it('near hits by their distance from what was typed', () => {
    expect(names('Ceropegia pica')).toEqual(['Ceropegia picta', 'Ceropegia dicapuae']); // base: dicapuae first
  });
  it('no retry on the first two words when the second is a small word', () => {
    expect(relaxedQuery('Lily of St. James')).toBeNull(); // base: "Lily of"
    expect(relaxedQuery('Rose of Jericho')).toBeNull();
    expect(relaxedQuery('Copiapoa cinerea var. columna-alba')).toBe('Copiapoa cinerea'); // guard
  });
});
