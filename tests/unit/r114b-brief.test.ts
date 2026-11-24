/**
 * Round 114 (SPECIES 18 d): "Habitat in brief", the page's title and its description, against the addition's own test
 * for Welwitschia mirabilis (tests/unit/fixtures/r114b-k339841.json, the page as the corpus held it on 23 November 2026),
 * and its other cases: extremes failed, frost, a zone with no band and the reverse, no dry month, °F, and the words a
 * paragraph about a place never uses.
 *
 * On 1764df3 there is no paragraph and the title is "Welwitschia mirabilis (Angolan Welwitschia): habitat climate": every
 * test FAILED.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { habitatBrief, briefDescription, titleWords, placesPhrase, type BriefIn } from '../../src/lib/ui/ref/brief';
import { sixAnswers } from '../../src/lib/ui/ref/six-answers';

const F = JSON.parse(readFileSync('tests/unit/fixtures/r114b-k339841.json', 'utf8'));
const W: BriefIn = { name: F.name, months: F.months, annualRain: F.annualRain, extremes: F.extremes, hardiness: F.hardiness, kewClimate: F.kewClimate, native: F.native, src: F.src };

describe('r114b Welwitschia mirabilis', () => {
  it('the paragraph and its source line read exactly as the addition gives them', () => {
    const b = habitatBrief(W, 'metric')!;
    expect(b.text).toBe('In habitat, Welwitschia mirabilis rarely sees nights below 5.5 °C: only 1 night in 100 is colder at a typical spot. The lowest in 44 years of records was 2.1 °C, with no frost nights. That places its habitat in USDA zone 10b and RHS H2. Rain is 80 mm a year at the median across its range, and 7 months bring under 5 mm. The hottest 1 day in 100 reaches 41.2 °C. Kew places it in desert or dry shrubland; it is native to Angola and Namibia.');
    expect(b.sources.join(' · ')).toBe('NASA POWER, daily 1981–2024 · CHELSA V2.1, 1981–2010 · Kew, Plants of the World Online');
    expect(b.runs.filter((r) => r.i).map((r) => r.t)).toEqual(['Welwitschia mirabilis']);
    expect(b.runs.filter((r) => r.b).map((r) => r.t)).toEqual(['5.5 °C', '2.1 °C', 'USDA zone 10b', 'RHS H2', '80 mm a year', '41.2 °C']);
  });
  it('the title and the description', () => {
    expect(`Welwitschia mirabilis (Angolan Welwitschia): ${titleWords({ hardiness: true, extremes: true })}`).toBe('Welwitschia mirabilis (Angolan Welwitschia): hardiness zone, minimum temperature, habitat climate');
    expect(briefDescription(W, 'metric')).toBe('Welwitschia mirabilis in habitat: nights rarely below 5.5 °C, lowest 2.1 °C in 44 years, no frost (NASA POWER); USDA zone 10b; 80 mm of rain a year (CHELSA).');
    expect(briefDescription(W, 'metric')!.length).toBeLessThanOrEqual(160);
  });
  it('the paragraph\'s figures are the six answers\' figures, in °C and in °F', () => {
    const six = sixAnswers({ months: F.months, annualRain: F.annualRain, extremes: F.extremes })!;
    for (const u of ['metric', 'us'] as const) {
      const t = habitatBrief(W, u)!.text;
      expect(t).toContain(u === 'us' ? '41.9 °F' : '5.5 °C'); // the cold floor, 5.5 °C = 41.9 °F
      expect(six.cold.floor).toBe(5.5);
    }
    expect(habitatBrief(W, 'us')!.text).toContain('3.1 in a year'); // 80 mm, as the Rain answer prints inches
  });
});

describe('r114b the other cases', () => {
  it('no climate: no paragraph, no description, the title as before', () => {
    expect(habitatBrief({ name: 'X y', months: null }, 'metric')).toBeNull();
    expect(briefDescription({ name: 'X y', months: null }, 'metric')).toBeNull();
    expect(titleWords({ hardiness: false, extremes: false })).toBeNull();
  });
  it('extremes failed: the rain opens; no floor, no lowest, no hottest, no hardiness; no "minimum temperature"', () => {
    const b = habitatBrief({ ...W, extremes: null, hardiness: null }, 'metric')!;
    expect(b.text.startsWith('In habitat, Welwitschia mirabilis gets 80 mm of rain a year at the median across its range, and 7 months bring under 5 mm.')).toBe(true);
    expect(b.text).not.toMatch(/nights below|lowest in|hottest|USDA|RHS/);
    expect(b.sources[0]).toMatch(/^CHELSA/);
    // A record with no median across the range: the rain said as the median year's, in the paragraph and the description.
    const older = { ...W, annualRain: null };
    expect(habitatBrief(older, 'metric')!.text).toContain('a year, its monthly medians added');
    expect(briefDescription(older, 'metric')).toMatch(/of rain in the median year \(CHELSA\)\.$/);
    expect(titleWords({ hardiness: false, extremes: false })).toBeNull();
    expect(titleWords({ hardiness: true, extremes: false })).toBe('hardiness zone, habitat climate');
  });
  it('frost: the count, never "no frost"', () => {
    const t = habitatBrief({ ...W, extremes: { ...F.extremes, frostNights: 3 } }, 'metric')!.text;
    expect(t).toContain('was 2.1 °C, with 3 frost nights.');
    expect(t).not.toContain('no frost');
    expect(habitatBrief({ ...W, extremes: { ...F.extremes, frostNights: 1 } }, 'metric')!.text).toContain('with 1 frost night.');
  });
  it('a zone with no band, and a band with no zone', () => {
    expect(habitatBrief({ ...W, hardiness: { usda: F.hardiness.usda, rhs: null } }, 'metric')!.text).toContain('That places its habitat in USDA zone 10b.');
    expect(habitatBrief({ ...W, hardiness: { usda: null, rhs: F.hardiness.rhs } }, 'metric')!.text).toContain('That places its habitat in RHS H2.');
  });
  it('no month under 5 mm: the rain sentence ends at "range."', () => {
    const wet = F.months.map((m: Record<string, number>) => ({ ...m, precipMm: 30 }));
    expect(habitatBrief({ ...W, months: wet }, 'metric')!.text).toContain('at the median across its range. The hottest');
  });
  it('only the place, never the plant: none of the words of a claim about the plant', () => {
    for (const b of [W, { ...W, extremes: null }, { ...W, kewClimate: null, native: [] }]) {
      const t = habitatBrief(b, 'metric')!.text;
      expect(t).not.toMatch(/\b(hardy to|tolerates?|survives?|needs?|will|should)\b/i);
      expect(t).toMatch(/in habitat|its habitat/i);
    }
  });
  it('the native list as one phrase', () => {
    expect(placesPhrase(['Angola', 'Namibia'])).toBe('Angola and Namibia');
    expect(placesPhrase(['A', 'B', 'C'])).toBe('A, B and C');
    expect(placesPhrase(['A', 'B', 'C', 'D', 'E'])).toBe('A, B and 3 more regions');
  });
});
