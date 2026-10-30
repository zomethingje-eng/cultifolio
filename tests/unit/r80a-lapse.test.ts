/**
 * Round eighty, agent A (review-d 6): the tomato's cold floor was 18.9 °C and its record low 17.1 °C, above every month's
 * mean nightly low (14.7 °C in August): its extremes were read at NASA POWER's cell -12.00_-76.875, whose ground averages
 * about 1,195 m of Andean slope, and lapse-corrected -1,129 m to the typical cell's 66 m on Lima's coast, warming every
 * night by 7.3 °C. A correction beyond MAX_LAPSE_M either way, or a record low warmer than the coldest month's mean nightly
 * low, is now refused and said, never applied. FAILED on r80f: no `$core/lapse`, and the parser kept such extremes.
 */
import { describe, it, expect } from 'vitest';
import { lapseSetAside, MAX_LAPSE_M } from '../../src/lib/core/lapse';
import { setAsideExtremes } from '../../src/lib/dossier/schema';
import { extremesWhyTag, coldFloor } from '../../src/lib/core/sheet';

const months = (lows: number[]) => lows.map((tmin) => ({ tmin, tmax: tmin + 8, tmean: tmin + 4, precipMm: 10 }));
const tomato = { status: 'ok', months: months([16.2, 17, 16.8, 15.9, 15.2, 14.9, 14.8, 14.7, 14.8, 15.2, 15.6, 15.9]), extremes: { years: 44, minAbs: 17.1, minP01: 18.9, maxP99: 33.4, frostDaysPerYear: 0, frostNights: 0, lapseAppliedM: -1129 }, landFraction: 0.9 } as const;

describe('the daily extremes beyond a lapse correction', () => {
  it("the tomato's correction of -1,129 m is refused, and said", () => {
    expect(MAX_LAPSE_M).toBe(1000);
    expect(lapseSetAside(tomato)).toMatch(/-1129 m, is beyond the 1,000 m/);
    const c = setAsideExtremes(tomato as never) as unknown as { extremes?: unknown; extremesLapse?: unknown; extremesStatus?: string };
    expect(c.extremes).toBeUndefined();
    expect(c.extremesLapse).toEqual(tomato.extremes);
    expect(c.extremesStatus).toBe('lapse');
  });
  it('a record low warmer than the coldest mean night is refused even within the bound (Ruellia simplex, -768 m)', () => {
    const r = { months: months([18, 17.5, 16.6, 17]), extremes: { minAbs: 17.8, lapseAppliedM: -768 } };
    expect(lapseSetAside(r)).toMatch(/record low, 17.8 °C, is warmer than the coldest month's mean nightly low across the range, 16.6 °C/);
  });
  it('an ordinary correction stands, and a sea cell is still the sea rule', () => {
    expect(lapseSetAside({ months: months([2, 1]), extremes: { minAbs: -6, lapseAppliedM: 420 } })).toBeNull();
    expect(lapseSetAside({ months: months([2, 1]), extremes: { minAbs: -6, lapseAppliedM: -1000 } })).toBeNull();
    const sea = setAsideExtremes({ ...tomato, landFraction: 0.3 } as never) as unknown as { extremesStatus?: string };
    expect(sea.extremesStatus).toBe('sea');
  });
  it('the pages word it as set aside, never as none on file (rule 2)', () => {
    // Round eighty-four (D1): by the cause that applied; without the series, only that it was set aside.
    expect(extremesWhyTag('lapse')).toBe('extremes set aside');
    const f = coldFloor(tomato.months, null, null, undefined, 'lapse');
    expect(JSON.stringify(f)).not.toContain('No daily extremes are on file');
  });
});
