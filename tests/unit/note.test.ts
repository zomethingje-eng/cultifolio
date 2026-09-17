import { describe, it, expect } from 'vitest';
import { generatedNote, careLine, span3 } from '$core/note';

const mk = (tmax: number[], tmin: number[], pr: number[], dli?: number[]) => tmax.map((t, i) => ({ tmax: t, tmin: tmin[i], tmean: (t + tmin[i]) / 2, precipMm: pr[i], dli: dli?.[i], rh: 55 }));
const namaqua = mk([26, 26, 25, 23, 20, 18, 17, 18, 20, 22, 24, 26], [14, 14, 13, 11, 9, 7, 6, 7, 8, 10, 12, 13], [3, 4, 8, 15, 28, 40, 38, 30, 14, 7, 4, 3], [55, 50, 42, 32, 24, 20, 22, 28, 36, 45, 52, 58]);
const ex = { minAbs: 1.2, minP01: 4.1, maxP99: 38, frostDaysPerYear: 0, years: 44 };

describe('the generated note', () => {
  it('condenses the sheet into one paragraph, shifted to the reader, every sentence traceable', () => {
    const n = generatedNote({ scientific: 'Tylecodon pearsonii', family: 'Crassulaceae', months: namaqua, lat: -30, extremes: ex })!;
    expect(n.text).toContain('winter grower: where you are it grows November to February and rests March to October');
    expect(n.text).toMatch(/about 194 mm of rain a year/);
    expect(n.text).toContain('Keep it above 4 °C');
    expect(n.text).toContain('As much light as you can give it (habitat sky 20–58 mol/m²/day');
    expect(n.text).toContain('Feed every 28 days');
    expect(n.from).toEqual(['Its year', 'Water', 'Light', 'Temperature', 'Feeding', 'Repotting']);
    expect(n.hab).toBe(true);
    expect(n.text.length).toBeLessThan(900);
  });
  it('a southern reader gets habitat months unshifted', () => {
    const n = generatedNote({ scientific: 'Tylecodon pearsonii', family: 'Crassulaceae', months: namaqua, lat: -30 }, { readerLat: -34 })!;
    expect(n.text).toContain('grows May to August');
  });
  it('with no climate it says so and gives the group posture only', () => {
    const n = generatedNote({ scientific: 'Stephania erecta', family: 'Menispermaceae' })!;
    expect(n.text).toContain('no habitat climate is on file');
    expect(n.hab).toBe(false);
    expect(n.text).not.toContain('°C'); // no floor without figures or an archetype minimum
  });
  it('with nothing to go on there is no note', () => {
    expect(generatedNote({ scientific: 'Nobodia knowsii', family: 'Asparagaceae' })).toBeNull();
  });
});

describe('the label line', () => {
  it('season, floor, light and water in a few words', () => {
    expect(careLine({ scientific: 'Tylecodon pearsonii', family: 'Crassulaceae', months: namaqua, lat: -30, extremes: ex })).toBe('winter grower Nov–Feb · >4 °C · full sun · dry between');
    expect(careLine({ scientific: 'Dionaea muscipula', family: 'Droseraceae' })).toBe('full sun · never dry · rain/RO water');
    expect(careLine({ scientific: 'Nobodia knowsii', family: 'Asparagaceae' })).toBe('');
  });
  it('month spans wrap the year', () => {
    expect(span3([11, 12, 1, 2])).toBe('Nov–Feb');
    expect(span3([5, 6, 7, 8])).toBe('May–Aug');
    expect(span3([6])).toBe('Jun');
  });
});
