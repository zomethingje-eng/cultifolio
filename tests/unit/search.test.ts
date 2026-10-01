import { describe, it, expect } from 'vitest';
import { prepare, search } from '$core/search';

const idx = prepare([
  { name: 'Copiapoa cinerea', family: 'Cactaceae', common: 'silver cactus', origin: ['Chile North'] },
  { name: 'Copiapoa coquimbana', family: 'Cactaceae', origin: ['Chile North'] },
  { name: 'Conophytum calculus', family: 'Aizoaceae', origin: ['Cape Provinces'] },
  { name: 'Lithops lesliei', family: 'Aizoaceae', common: 'living stone', origin: ['Northern Provinces'] },
  { name: 'Echinopsis chiloensis', family: 'Cactaceae', origin: ['Chile Central'] },
  { name: 'Aloë ferox', family: 'Asphodelaceae', origin: ['Cape Provinces'] }
]);
const names = (q: string) => search(idx, q).map((x) => x.name);

describe('species search', () => {
  it('matches each word as a prefix of any word, in any order', () => {
    expect(names('cop cin')).toEqual(['Copiapoa cinerea']);
    expect(names('cinerea copiapoa')).toEqual(['Copiapoa cinerea']);
    expect(names('lesli')).toEqual(['Lithops lesliei']);
  });
  it('ranks a genus hit above an epithet hit, and names above common names, families and origins', () => {
    expect(names('c')).toEqual(['Conophytum calculus', 'Copiapoa cinerea', 'Copiapoa coquimbana', 'Echinopsis chiloensis', 'Aloë ferox']); // Aloë by Cape Provinces; Lithops has no c-word at all
    expect(names('chile')).toEqual(['Copiapoa cinerea', 'Copiapoa coquimbana', 'Echinopsis chiloensis']); // all three by origin, alphabetical ("chilo" is not "chile")
    expect(names('chilo')).toEqual(['Echinopsis chiloensis']);
    expect(names('silver cactus')).toEqual(['Copiapoa cinerea']);
    expect(names('cape')).toEqual(['Aloë ferox', 'Conophytum calculus']);
  });
  it('forgives one typing error only when the exact spelling finds nothing', () => {
    expect(names('conophitum')).toEqual(['Conophytum calculus']); // wrong letter
    expect(names('copiapao')).toEqual(['Copiapoa cinerea', 'Copiapoa coquimbana']); // swapped letters
    expect(names('litops')).toEqual(['Lithops lesliei']); // missing letter
    expect(names('lithoops')).toEqual(['Lithops lesliei']); // extra letter
    expect(names('copiapoa cinerea')).toEqual(['Copiapoa cinerea']); // exact: no near misses beside it
    expect(names('cop')).toEqual(['Copiapoa cinerea', 'Copiapoa coquimbana']); // short words are never relaxed
    expect(names('zzzz')).toEqual([]);
  });
  it('ignores accents and punctuation', () => {
    expect(names('aloe')).toEqual(['Aloë ferox']);
    expect(names('Aloë ferox')).toEqual(['Aloë ferox']);
  });
  it('returns nothing for an empty query and honours a limit', () => {
    expect(names('')).toEqual([]);
    expect(search(idx, 'c', 2)).toHaveLength(2);
  });
});

describe('older names (round thirty-one, 3)', () => {
  it('a synonym is cut to its binomial without authorship, and a malformed entry is dropped', async () => {
    const { canonicalSynonym } = await import('$core/names');
    expect(canonicalSynonym('Haworthia attenuata (Haw.) Haw.')).toBe('Haworthia attenuata');
    expect(canonicalSynonym('Aloe attenuata Haw.')).toBe('Aloe attenuata');
    expect(canonicalSynonym('Haworthia attenuata var. radula (Jacq.) M.B.Bayer')).toBe('Haworthia attenuata var. radula');
    expect(canonicalSynonym('? glabra Salm-Dyck')).toBeNull();
    expect(canonicalSynonym('Gasteria')).toBeNull();
    // a section, a subgenus, an undetermined name and a misapplied one are not names of a species (round thirty-three, 13)
    expect(canonicalSynonym('Opuntia sect. Tuna (Mill.) A.Berger')).toBeNull();
    expect(canonicalSynonym('Haworthia subg. Hexangulares Uitewaal')).toBeNull();
    expect(canonicalSynonym('Echinopsis sp.')).toBeNull();
    expect(canonicalSynonym('Aloe glauca auct. non Mill.')).toBeNull();
  });
  it('a search finds a species under an older name, after the species that carry the words in their own names', async () => {
    const { prepare, search } = await import('$core/search');
    const items = [
      { name: 'Haworthiopsis attenuata', family: 'Asphodelaceae', syn: ['Haworthia attenuata', 'Aloe attenuata'] },
      { name: 'Haworthia cooperi', family: 'Asphodelaceae' }
    ];
    const p = prepare(items);
    expect(search(p, 'haworthia attenuata').map((x) => x.name)).toEqual(['Haworthiopsis attenuata']);
    expect(search(p, 'haworthia').map((x) => x.name)).toEqual(['Haworthia cooperi', 'Haworthiopsis attenuata']); // its own name first
    expect(search(p, 'aloe').map((x) => x.name)).toEqual(['Haworthiopsis attenuata']);
    // the words of a query that fall to older names must come from one older name, and a rank marker is not a word (round thirty-three, 13)
    const q = prepare([{ name: 'Tulista pumila', family: 'Asphodelaceae', syn: ['Aloe pumila', 'Haworthia margaritifera', 'Haworthia pumila var. margaritifera'] }]);
    expect(search(q, 'haworthia margaritifera').map((x) => x.name)).toEqual(['Tulista pumila']);
    expect(search(q, 'aloe margaritifera')).toEqual([]);
    expect(search(q, 'var')).toEqual([]);
    for (const typed of ['haworthia pumila var. margaritifera', 'haworthia pumila var margaritifera', 'Haworthia pumila subsp. margaritifera', 'haworthia pumila ssp. margaritifera', 'haworthia pumila f. margaritifera']) expect(search(q, typed).map((x) => x.name), typed).toEqual(['Tulista pumila']); // the label as written (round thirty-five, R2-3)
  });
});
