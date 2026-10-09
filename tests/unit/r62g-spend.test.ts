/**
 * Round sixty-two, agent G: spending (docs/REVIEW-TRIAGE-61.md, decision 4; the grower review, 8; A39). One currency is
 * totalled once; the common forms are read; "free" and "gift" are nothing spent, not "could not be read".
 */
import { describe, it, expect } from 'vitest';
import { readPrice, spendOf, amountWords, spendWords } from '$lib/ui/grow/spend';

describe('prices', () => {
  it.each([
    ['US$12', 12, '$'], ['12 USD', 12, '$'], ['12 usd', 12, '$'], ['$12', 12, '$'],
    ['£1,250', 1250, '£'], ['1,200.00 GBP', 1200, '£'], ['€12,50', 12.5, '€'], ['12 EUR', 12, '€'], ['1.234,56 €', 1234.56, '€'],
    ['¥12,000', 12000, '¥'], ['1200 JPY', 1200, '¥'], ['R$ 30', 30, 'R$'], ['A$15', 15, 'A$'], ['NZ$10', 10, 'NZ$'], ['C$10', 10, 'C$'],
    ['Rs 500', 500, 'Rs'], ['Rs. 500', 500, 'Rs'], ['CHF 20', 20, 'CHF'], ['12.5', 12.5, null], ['3,50', 3.5, null]
  ])('%s is %s %s', (text, v, cur) => {
    expect(readPrice(text)).toEqual({ v, cur });
  });
  it.each(['a swap', '3 for 10', '£6 $7', '12-15', '-5', '1,2345', '1,234,56', '12 per', '£12.00 each'])('%s is not read', (text) => {
    expect(readPrice(text)).toBeNull();
  });
});

describe('totals', () => {
  it('one currency is one total, whatever its name', () => {
    const s = spendOf(['£12', '8 GBP', '£1,250', '€3', '3 EUR', '$5', 'US$5', '5 usd', '¥100', '100 JPY']);
    expect(s.parts.map((p) => [p.cur, p.total, p.counted])).toEqual([['$', 15, 3], ['£', 1270, 3], ['¥', 200, 2], ['€', 6, 2]]);
    expect(s.skipped).toBe(0); // base: four totals of £, GBP, $ and USD apart, and "£1,250" not read
  });
  it('"free" and "gift" are nothing spent, said as such, never "could not be read"', () => {
    const s = spendOf(['£12', 'free', 'Gift', 'a gift', 'a swap']);
    expect([s.counted, s.skipped, s.free]).toEqual([1, 1, 3]);
    expect(amountWords(s)).toBe('£12 on 1 plant and 3 plants free or a gift');
    expect(amountWords(spendOf(['free']))).toBe('nothing spent: 1 plant free or a gift');
    expect(spendWords(spendOf([]), spendOf(['free']), '2026')).toEqual({ year: 'nothing counted (2026)', all: 'nothing spent: 1 plant free or a gift', left: '' });
  });
});
