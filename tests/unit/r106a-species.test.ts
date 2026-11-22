/**
 * Round 106 (docs/PLAN-106.md; the first hand-off's round 4): the species page in the grower's order. Here, the rules
 * under it:
 *
 * 1. "Show in my months" in both hemispheres: the chart moves by six months only where the year can be moved and the
 *    reader's hemisphere is not the habitat's (the reader's from their latitude, north when none is known).
 * 2. The months moved: the reader's January is the habitat's July, every figure with its month.
 * 3. Flowering at 0, at 11 and at 12 observations: under 12 the months in a sentence, each month's count beside it where
 *    any month has more than one; at 12 the chart (Flowering.svelte, rendered).
 *
 * On dd6265c: FAILED, every test: `$climate/my-months` and `floweringFewLine` did not exist, and under 12 observations
 * the strip drew twelve bars.
 */
import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import { myMonthsShift, inMyMonths } from '$climate/my-months';
import { floweringFewLine } from '$lib/ui/ref/links-words';
import Flowering from '$lib/ui/ref/Flowering.svelte';

describe('r106a 1: "Show in my months" in both hemispheres', () => {
  it('a southern habitat moves for a northern reader, and for a reader whose hemisphere is not known', () => {
    expect(myMonthsShift(true, 51.5, true)).toBe(6);
    expect(myMonthsShift(true, null, true)).toBe(6);
  });
  it('a northern habitat moves for a southern reader, and not for a northern one', () => {
    expect(myMonthsShift(false, -33.9, true)).toBe(6);
    expect(myMonthsShift(false, 40, true)).toBe(0);
    expect(myMonthsShift(false, null, true)).toBe(0);
  });
  it('a southern habitat does not move for a southern reader', () => {
    expect(myMonthsShift(true, -27, true)).toBe(0);
  });
  it('a year the rule cannot move, or a habitat with no hemisphere read, never moves', () => {
    expect(myMonthsShift(true, 51.5, false)).toBe(0);
    expect(myMonthsShift(null, -30, true)).toBe(0);
  });
});

describe('r106a 2: the months moved by six', () => {
  const habitat = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  it('the reader\'s January holds the habitat\'s July, and every month moves with its figure', () => {
    expect(inMyMonths(habitat, 6)).toEqual(['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']);
    expect(inMyMonths(habitat, 0)).toBe(habitat);
    expect(inMyMonths(inMyMonths(habitat, 6), 6)).toEqual(habitat);
  });
});

describe('r106a 3: flowering at 0, 11 and 12 observations', () => {
  const page = (months: number[]) => render(Flowering, { props: { dossier: { ids: { inat: 7 }, flowering: { taxon: 7, months, read: '2026-11-21' } } as never } }).body;
  it('two in two months, named; counts beside the months where any month has more than one', () => {
    expect(floweringFewLine([0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1].map((n) => ({ n })))).toBe('2 flowering records: September and December');
    expect(floweringFewLine([0, 0, 3, 2, 0, 0, 0, 0, 0, 0, 0, 0].map((n) => ({ n })))).toBe('5 flowering records: March (3) and April (2)');
    expect(floweringFewLine([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0].map((n) => ({ n })))).toBe('1 flowering record: June');
  });
  it('at 11 a sentence and no chart', () => {
    const h = page([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0]);
    expect(h).toContain('11 flowering records: January, February, March, April, May, June, July, August, September, October and November.');
    expect(h).not.toMatch(/<li\b/);
    expect(h).toContain('from few records: 11');
  });
  it('at 12 the chart, twelve months, and no sentence', () => {
    const h = page([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect(h.match(/<li\b/g)).toHaveLength(12);
    expect(h).not.toContain('flowering records:');
    expect(h).not.toContain('from few records');
  });
  it('at 0 the answer said as that, never "none"', () => {
    const h = page(Array(12).fill(0));
    expect(h).toContain('No research-grade observation of a wild plant is annotated flowering on iNaturalist.');
    expect(h).not.toMatch(/<li\b/);
  });
});
