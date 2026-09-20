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
