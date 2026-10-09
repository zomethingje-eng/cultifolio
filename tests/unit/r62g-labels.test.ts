/**
 * Round sixty-two, agent G: labels (docs/REVIEW-TRIAGE-61.md, decision 8; A36; the records review, 13). The 5167 sheet's
 * side margin; the QR name with format characters, separators, runs of marks, joined emoji and lone surrogates; an "sp."
 * plant's code with no species slug.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { plantQrUrl, labelFromHash, QR_NAME_MAX } from '$lib/ui/grow/qr';

const qr = (taxonName: string, cultivar: string | null = null, nameKind: 'species' | 'cultivar' | 'hybrid' = 'species') => plantQrUrl('https://x', { id: 'r1', taxonName, cultivar, nameKind });
const nameOf = (url: string) => labelFromHash(url.slice(url.indexOf('#'))).name ?? '';

describe('the 5167 sheet (A36)', () => {
  it('sits 0.3 in from each side, with 0.3 in between its four columns', () => {
    const src = readFileSync('src/routes/labels/+page.svelte', 'utf8');
    const m = /k: '5167'.*?page: \[([\d.]+), [\d.]+\], cols: (\d+),.*?w: ([\d.]+),.*?left: ([\d.]+),.*?gapX: ([\d.]+),/.exec(src)!;
    const [paper, cols, w, left, gap] = m.slice(1).map(Number);
    expect(left).toBe(7.62); // base: 7.3, every column 0.33 to 0.39 mm left
    expect(left * 2 + cols * w + (cols - 1) * gap).toBeCloseTo(paper, 6);
  });
});

describe('the name in the code (A36)', () => {
  it('takes off format characters and line and paragraph separators: zero-width space, word joiner, soft hyphen, BOM, tags, U+2028', () => {
    const n = nameOf(qr('Copiapoa\u200b cin\u00ader\u2060ea\ufeff\u{e0041}\u2028x\u2029y'));
    expect(n).toBe('Copiapoa cinerea x y'); // a format character removed, a separator a space (round sixty-two, second pass; triage-outside 6)
    expect(/[\p{Cf}\p{Zl}\p{Zp}]/u.test(n)).toBe(false); // base: all of them kept
    expect(labelFromHash('#n=' + encodeURIComponent('a\u200bb\u00adc\u2028d')).name).toBe('abc d');
  });
  it('keeps two marks on a letter and takes off a stack of more', () => {
    const n = nameOf(qr('Aloe ve' + 'r\u0301\u0302' + '\u0303'.repeat(57) + 'a'));
    expect(n).toBe('Aloe ve' + '\u0155\u0302\u0303' + 'a'); // r with its acute composed, then two marks; the other 56 gone
  });
  it('cuts by grapheme, never inside a joined emoji or a letter and its mark, at 60 code points', () => {
    const family = '\u{1f468}\u200d\u{1f469}\u200d\u{1f467}'; // five code points, one grapheme
    const n = nameOf(qr('x'.repeat(57) + family));
    expect(n).toBe('x'.repeat(57)); // base: the first three code points of the family were kept
    expect(Array.from(nameOf(qr('x'.repeat(100)))).length).toBe(QR_NAME_MAX);
    expect(nameOf(qr('x'.repeat(55) + family))).toBe('x'.repeat(55) + family);
  });
  it('a lone surrogate is replaced, and the code is still made', () => {
    expect(() => qr('Copiapoa \ud800cinerea')).not.toThrow(); // base: "URI malformed", and the label had no code
    expect(nameOf(qr('Copiapoa \ud800cinerea'))).toBe('Copiapoa \ufffdcinerea');
  });
});

describe('an open name in the code (the records review, 13)', () => {
  it('an "sp." plant carries no species slug; a cf. plant carries the compared species\'', () => {
    expect(qr('Lithops sp. C 036')).toBe('https://x/plants/r1#n=Lithops%20sp.%20C%20036'); // base: s=lithops, and "Its species has no page"
    expect(qr('Copiapoa cf. cinerea')).toMatch(/#s=copiapoa-cinerea&n=/);
  });
});
