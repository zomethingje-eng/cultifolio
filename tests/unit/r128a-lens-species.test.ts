/**
 * Round 128 (SPECIES 20, the lens's Another species; docs/REVIEW-ROUND-128.md): Welwitschia mirabilis (k339841, the
 * fixture of round 114) against Fenestraria rhopalophylla (k2808089, its page data of 27 November, climate only): nights
 * 11 to 16 °C against 13 to 19 °C (10.6 to 16.1 and 12.5 to 18.7 as the page holds them), cold floors 5.7 and 5.5 °C,
 * rain 56 mm against 80 mm, as the hand-off gives them. Both lie south of the equator, so no month is moved; one north
 * of it is moved six.
 *
 * On 9176178: FAILED (no speciesLines).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { speciesLines, otherShift } from '../../src/lib/climate/lens-spaces';

const W = JSON.parse(readFileSync('tests/unit/fixtures/r114a-k339841.json', 'utf8'));
const Fe = JSON.parse(readFileSync('tests/unit/fixtures/r128a-k2808089.json', 'utf8'));
const temp = (c: number) => `${c.toFixed(1)} °C`, mm = (n: number) => `${Math.round(n)} mm`;
const FORBIDDEN = /\b(will|should|needs?|wants?|tolerates?|survive|die|safe)\b/i;

describe('Another species', () => {
  it('Welwitschia against Fenestraria: the nights, the floors, the rain, the warmest days, two figures a line', () => {
    const l = speciesLines({ name: 'Welwitschia mirabilis', other: 'Fenestraria rhopalophylla', habitat: W.climate.months, theirs: Fe.climate.months, floorC: W.climate.extremes.minP01, theirFloorC: Fe.climate.extremes.minP01, temp, mm });
    expect(l.map((x) => x.k)).toEqual(['nights', 'floor', 'rain', 'days']);
    expect(l[0].text).toBe('Average nights through the year: 10.6 °C to 16.1 °C for Fenestraria rhopalophylla; 12.5 °C to 18.7 °C for Welwitschia mirabilis.');
    expect(l[1].text).toBe('Cold floors: 5.7 °C for Fenestraria rhopalophylla; 5.5 °C for Welwitschia mirabilis.');
    expect(l[2].text).toBe('Rain a year: 56 mm for Fenestraria rhopalophylla; 80 mm for Welwitschia mirabilis.');
    expect(l[3].text).toMatch(/^The warmest month's average day: 22\.3 °C for Fenestraria rhopalophylla; 30\.9 °C for Welwitschia mirabilis\.$/);
    for (const x of l) expect(x.text).not.toMatch(FORBIDDEN);
  });
  it('a cold floor missing on either side: its line is not drawn', () => {
    expect(speciesLines({ name: 'A', other: 'B', habitat: W.climate.months, theirs: Fe.climate.months, floorC: 5.5, theirFloorC: null, temp, mm }).map((x) => x.k)).toEqual(['nights', 'rain', 'days']);
  });
  it('the hemispheres: the same, nothing moved; different, six months', () => {
    expect(otherShift(-20.5, Fe.climate.at.lat)).toBe(0);
    expect(otherShift(-20.5, 40.4)).toBe(6);
    expect(otherShift(51.5, 40.4)).toBe(0);
  });
});
