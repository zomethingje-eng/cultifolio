import { describe, it, expect } from 'vitest';
import { literature, namesSpecies, abstractText } from '$lib/dossier/sources/openalex';
import { fixtureFetcher } from '$lib/dossier/fetch';

describe('literature screening', () => {
  it('keeps only works whose title or abstract names the species', async () => {
    const f = fixtureFetcher({
      'https://api.openalex.org/works': {
        results: [
          { title: 'Crashworthiness of an electric motorcycle chassis', publication_year: 2022, abstract_inverted_index: { A: [0], biomimetic: [1], study: [2] } },
          { title: 'Leaf structure of Albuca spiralis', publication_year: 2015 },
          { title: 'Bulb dormancy in a Namaqualand geophyte', publication_year: 2018, abstract_inverted_index: { We: [0], studied: [1], 'A.': [2], spiralis: [3], in: [4], the: [5], field: [6] } },
          { title: 'Solar pump development', publication_year: 2020, abstract_inverted_index: { Albuca: [0] } } // genus alone is not the species
        ]
      }
    });
    const r = await literature(f, 'Albuca spiralis', 12, undefined);
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.data.map((w) => w.title)).toEqual(['Leaf structure of Albuca spiralis', 'Bulb dormancy in a Namaqualand geophyte']);
  });
  it('is "none" when nothing survives screening, and passes refusals through', async () => {
    const f = fixtureFetcher({ 'https://api.openalex.org/works': { results: [{ title: 'Unrelated', abstract_inverted_index: null }] } });
    expect((await literature(f, 'Albuca spiralis')).status).toBe('none');
    const g = fixtureFetcher({});
    expect((await literature(g, 'Albuca spiralis')).status).toBe('refused');
  });
  it('helpers', () => {
    expect(abstractText({ b: [1], a: [0] })).toBe('a b');
    expect(namesSpecies('Notes on A. spiralis', 'Albuca spiralis')).toBe(true);
    expect(namesSpecies('Albuca nana is not this', 'Albuca spiralis')).toBe(false);
    expect(namesSpecies('anything', 'Albuca')).toBe(false);
  });
});
