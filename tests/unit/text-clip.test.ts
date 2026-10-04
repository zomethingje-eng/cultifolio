import { describe, it, expect } from 'vitest';
import { clip } from '$core/text';

describe('a description cut for a search result or a link preview (round fifty-nine)', () => {
  const w = 'Welwitschia is a monotypic genus of gnetophytes containing only the species Welwitschia mirabilis. It is named after the Austrian botanist Friedrich Welwitsch, who described it in 1859.';
  it('stops at a word with an ellipsis, inside the length', () => {
    const c = clip(w, 155);
    expect(c.length).toBeLessThanOrEqual(155);
    expect(c.endsWith('…')).toBe(true);
    expect(c).not.toMatch(/Welwit…$/);
    expect(w.startsWith(c.slice(0, -1))).toBe(true);
    expect(c.slice(0, -1)).toMatch(/\S$/);
  });
  it('leaves a short text whole, and drops a comma before the ellipsis', () => {
    expect(clip('  Short   text. ', 155)).toBe('Short text.');
    expect(clip('one two three, four', 16)).toBe('one two three…');
  });
});
