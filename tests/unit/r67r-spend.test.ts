/**
 * Round sixty-seven, triage-66 R14 (the outside review's 25): a price written with a space as its thousands separator,
 * "1 200 €" (and a no-break or thin space, as a phone's keyboard or a spreadsheet writes it), is read. The first three
 * cases failed on the round-sixty-six base (null).
 */
import { describe, it, expect } from 'vitest';
import { readPrice, spendOf } from '$lib/ui/grow/spend';

describe('a space as the thousands separator (R14)', () => {
  it('base: "1 200 €" is 1200 euros', () => expect(readPrice('1 200 €')).toEqual({ v: 1200, cur: '€' }));
  it('base: a no-break and a thin space, with a decimal comma', () => {
    expect(readPrice('1 234,50 €')).toEqual({ v: 1234.5, cur: '€' });
    expect(readPrice('CHF 12 500')).toEqual({ v: 12500, cur: 'CHF' });
    expect(readPrice('1 000 kr')).toEqual({ v: 1000, cur: 'kr' });
  });
  it('base: counted in the summary', () => expect(spendOf(['1 200 €', '€30']).parts).toEqual([{ cur: '€', total: 1230, counted: 2 }]));
  it('what is not a plain number is still not guessed at', () => {
    expect(readPrice('3 for 10')).toBeNull();
    expect(readPrice('1 2')).toBeNull();
    expect(readPrice('12 34 €')).toBeNull();
    expect(readPrice('12 €')).toEqual({ v: 12, cur: '€' });
    expect(readPrice('1,250')).toEqual({ v: 1250, cur: null });
    expect(readPrice('1 250,5 €')).toEqual({ v: 1250.5, cur: '€' });
  });
});
