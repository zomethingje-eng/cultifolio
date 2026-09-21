import { describe, it, expect } from 'vitest';
import { temp, deltaT, rain, ruleRain, unitsForLocale, cToF, fToC } from '$core/units';
import { cultivationSheet } from '$core/sheet';
import { generatedNote, careLine } from '$core/note';

describe('units', () => {
  it('converts a temperature with its offset and a difference without it', () => {
    expect(temp(6.5, 'us', 1)).toBe('43.7 °F');
    expect(temp(6.5, 'metric', 1)).toBe('6.5 °C');
    expect(temp(0, 'us')).toBe('32 °F');
    expect(deltaT(4, 'us')).toBe('7.2 °F'); // not 39.2
    expect(deltaT(4, 'metric')).toBe('4.0 °C');
    expect(fToC(cToF(-12.3))).toBeCloseTo(-12.3, 9);
    // a bench floor typed as 40 °F is stored in °C at two decimals and reads back as 40.0, not 39.9
    expect(cToF(+fToC(40).toFixed(2)).toFixed(1)).toBe('40.0');
    expect(cToF(+fToC(40).toFixed(1)).toFixed(1)).toBe('39.9');
  });
  it('prints rain in inches with the precision an inch needs, and keeps the metric threshold beside a converted rule', () => {
    expect(rain(72, 'us')).toBe('2.8 in');
    expect(rain(13, 'us')).toBe('0.51 in');
    expect(rain(72, 'metric')).toBe('72 mm');
    expect(rain(0.4, 'metric')).toBe('0.4 mm');
    expect(ruleRain(120, 'us')).toBe('4.7 in (120 mm)');
    expect(ruleRain(120, 'metric')).toBe('120 mm');
  });
  it('guesses US units only for an en-US reader', () => {
    expect(unitsForLocale('en-US,en;q=0.9')).toBe('us');
    expect(unitsForLocale('en-GB')).toBe('metric');
    expect(unitsForLocale('de-DE')).toBe('metric');
    expect(unitsForLocale(null)).toBe('metric');
  });
});

describe('the sheet in the reader\'s units', () => {
  const months = Array.from({ length: 12 }, (_, i) => ({ tmax: 22 + 4 * Math.cos((i / 12) * 2 * Math.PI), tmin: 12 + 3 * Math.cos((i / 12) * 2 * Math.PI), tmean: 17, precipMm: i > 4 && i < 8 ? 13 : 3, dli: 40, rh: 70 }));
  const ex = { years: 40, days: 14600, minAbs: 4, minP01: 6.5, minP05: 8, maxAbs: 33, maxP99: 29, frostDaysPerYear: 0, frostNights: 0, lapseAppliedM: 0 };
  const input = { scientific: 'Copiapoa cinerea', family: 'Cactaceae', months, extremes: ex, lat: -25 };
  it('writes every figure, every short and the label in the same units, and nothing metric leaks', () => {
    const us = cultivationSheet({ ...input, units: 'us' });
    const all = us.rows.flatMap((r) => [r.s, r.short ?? '', r.why]).join(' ');
    expect(all).toContain('43.7 °F');
    expect(all).toMatch(/2\.6 in a year/); // 3×9 + 13×3 = 66 mm
    expect(all).toContain('4.7 in (120 mm)'); // the rule's threshold, checkable
    expect(all.replace(/\(\d+ mm\)|\(0\.5 °C\)|\(1 °C\)/g, '')).not.toMatch(/\d °C|\d mm\b/);
    const note = generatedNote({ ...input, units: 'us' });
    expect(note?.text).toContain('Cold floor 43.7 °F');
    expect(note?.text).not.toMatch(/\d °C/);
    expect(careLine({ ...input, units: 'us' })).toContain('43.7 °F');
  });
  it('is metric by default and identical to before', () => {
    const m = cultivationSheet(input);
    expect(m.rows.flatMap((r) => r.s).join(' ')).toContain('6.5 °C');
    expect(m.rows.flatMap((r) => r.s).join(' ')).not.toContain('°F');
  });
});
