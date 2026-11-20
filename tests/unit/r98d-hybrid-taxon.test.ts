/**
 * Round ninety-eight (docs/REVIEW-ROUND-98.md, 6): an item Wikidata states is an instance of "hybrid taxon" (Q136343650,
 * a subclass of taxon made in October 2026) is a taxon's item. Diplacus × australis's Q17746323 carries Kew's IPNI
 * identifier for the page (77121452-1) and the alias "Diplacus australis", and went from taxon (Q16521) to hybrid taxon
 * on 8 November 2026; the page's online build of 20 November found no item and lost Q17746323 and its WFO identifier
 * (drops.txt). 136 pages held such an item on 20 November.
 *
 * On 26a8295: isTaxonItem of an item whose P31 is Q136343650 was false; the first case FAILED.
 */
import { describe, it, expect } from 'vitest';
import { isTaxonItem, TAXON } from '../../src/lib/dossier/sources/wikimedia';

const item = (p31: string[], extra: Record<string, string> = {}) => ({
  claims: {
    ...Object.fromEntries(Object.entries(extra).map(([p, v]) => [p, [{ mainsnak: { datavalue: { value: v } } }]])),
    ...(p31.length ? { P31: p31.map((id) => ({ mainsnak: { datavalue: { value: { id } } } })) } : {})
  }
});

describe('r98d: a hybrid taxon is a taxon', () => {
  it('Diplacus × australis as Wikidata holds it since 8 November 2026 (P31 Q136343650) is a taxon item', () => {
    expect(isTaxonItem(item(['Q136343650'], { P225: 'Diplacus × australis', P961: '77121452-1' }))).toBe(true);
  });
  it('the classes before are taxa still, and a painting with the name is not', () => {
    for (const q of ['Q16521', 'Q310890', 'Q23038290', 'Q98961713']) expect(isTaxonItem(item([q]))).toBe(true);
    expect(isTaxonItem(item(['Q3305213'], { P225: 'Diplacus × australis' }))).toBe(false);
    expect(TAXON.size).toBe(5);
  });
  it('an item that states no P31 is judged by its taxon name or GBIF key, as before', () => {
    expect(isTaxonItem(item([], { P225: 'Diplacus × australis' }))).toBe(true);
    expect(isTaxonItem(item([]))).toBe(false);
  });
});
