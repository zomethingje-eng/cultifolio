/**
 * Round 115 (SPECIES 18 a and b): the header's "What it is" cut at a sentence's end, never inside an abbreviation, and
 * the whole text kept where no end is found (rule 4).
 *
 * On 1764df3 there is no cut (the section showed the excerpt whole, lower down the page): every test FAILED.
 */
import { describe, it, expect } from 'vitest';
import { firstSentences } from '../../src/lib/ui/ref/sentences';

describe('r115a firstSentences', () => {
  it('two sentences, the rest held back', () => {
    const t = 'Welwitschia is a monotypic genus of gnetophytes containing only the species Welwitschia mirabilis. It is named after the Austrian botanist Friedrich Welwitsch. It is endemic to the Namib desert.';
    const s = firstSentences(t, 2);
    expect(s.head).toBe('Welwitschia is a monotypic genus of gnetophytes containing only the species Welwitschia mirabilis. It is named after the Austrian botanist Friedrich Welwitsch.');
    expect(s.rest).toBe('It is endemic to the Namib desert.');
    expect(`${s.head} ${s.rest}`).toBe(t);
  });
  it('never inside an abbreviation: an author, a rank, a title, e.g.', () => {
    const t = 'It was described by Hook.f. In 1863 it was named. Its var. Minor is not accepted. St. Helena is far. E.g. This.';
    const s = firstSentences(t, 2);
    expect(s.head).toBe('It was described by Hook.f. In 1863 it was named. Its var. Minor is not accepted.');
  });
  it('the whole text where it holds fewer sentences than asked', () => {
    expect(firstSentences('One sentence only.', 2)).toEqual({ head: 'One sentence only.', rest: '' });
    expect(firstSentences('One. Two.', 2)).toEqual({ head: 'One. Two.', rest: '' });
  });
});
