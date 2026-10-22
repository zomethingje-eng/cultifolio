/**
 * Round eighty (X): a listed species whose page keeps GBIF's key (Kew's file did not settle which taxon it is; ids-gbif.txt)
 * is held by that page. On the owner's build the about-how script counted eight such species as missing, Crocus
 * nudiflorus among them, and the paragraph would have said they were not there. Failed on r80base, which held only the page under Kew's id.
 */
import { describe, it, expect } from 'vitest';
import { held } from '../../scripts/about-how-r79.mjs';

describe('held: a page under GBIF\'s key holds its listed species', () => {
  const list = [
    { kew: '327378', name: 'Crocus nudiflorus', gbif: 2747305 },
    { kew: '100', name: 'Aloe vera', gbif: 2777724 },
    { kew: '-', name: 'Some keyed legacy page', gbif: 7410371 },
    { kew: '200', name: 'Not built', gbif: 999 },
    { kew: '300', name: 'Keyless and not built', gbif: null }
  ];
  const index = [
    { key: 'g2747305', gbif: 2747305 },
    { key: 'k100', gbif: 2777724 },
    { key: 'g7410371', gbif: 7410371 }
  ];
  it('counts the page under GBIF\'s key, the page under Kew\'s id and a legacy page, and nothing else', () => {
    expect(held(list, index).map((s: { name: string }) => s.name)).toEqual(['Crocus nudiflorus', 'Aloe vera', 'Some keyed legacy page']);
  });
});
