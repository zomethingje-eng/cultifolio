import { describe, it, expect } from 'vitest';
import { climograph, type ClimoInput } from '$climate/climograph';
import { firstSentences } from '$core/text';

const month = (tmax: number, tmin: number, precipMm: number, dli?: number, rh?: number) => ({ tmax, tmin, precipMm, dli, rh });
const year = (f: (i: number) => ReturnType<typeof month>) => Array.from({ length: 12 }, (_, i) => f(i));

function atacama(spread = 2): ClimoInput {
  const s = (i: number) => Math.cos((i / 12) * 2 * Math.PI);
  return {
    months: year((i) => month(22 + 4 * s(i), 12 + 3 * s(i), i > 4 && i < 8 ? 3 : 0.4, 30 + 10 * s(i), 78 - 6 * s(i))),
    p10: year((i) => month(22 + 4 * s(i) - spread, 12 + 3 * s(i) - spread, 0, 30 + 10 * s(i) - 2, 70)),
    p90: year((i) => month(22 + 4 * s(i) + spread, 12 + 3 * s(i) + spread, i > 4 && i < 8 ? 6 : 1, 30 + 10 * s(i) + 2, 85)),
    cells: 9,
    extremes: { minAbs: 3.4, maxP99: 31.2, years: 40 }
  };
}

describe('the climograph geometry', () => {
  it('draws bands only where the envelope has a spread, and says so in the legend text', () => {
    const g = climograph(atacama());
    expect(g.temp.dayBand).toMatch(/^M.* Z$/);
    expect(g.temp.nightBand).toMatch(/^M.* Z$/);
    expect(g.hasBand).toBe(true);
    expect(g.alt).toMatch(/10th to 90th percentile across 9 habitat cells/);
    const one = climograph({ ...atacama(0), p10: atacama().months, p90: atacama().months, cells: 1 });
    expect(one.temp.dayBand).toBe('');
    expect(one.temp.nightBand).toBe('');
    expect(one.rain.bars.every((b) => b.lo == null)).toBe(true);
    expect(one.hasBand).toBe(false);
    expect(one.alt).not.toMatch(/percentile/);
  });
  it('places the frost line only when the temperature axis crosses zero', () => {
    expect(climograph(atacama()).temp.zeroY).toBeNull(); // minAbs 3.4: axis floor is 0, the line sits on the edge, not drawn
    const cold = atacama();
    cold.extremes = { minAbs: -6.5, maxP99: 31, years: 30 };
    const g = climograph(cold);
    expect(g.temp.zeroY).not.toBeNull();
    expect(g.temp.minAbs!.y).toBeGreaterThan(g.temp.zeroY!); // below the frost line on screen
    expect(g.temp.minAbs!.label).toMatch(/-6\.5° lowest in 30 yrs/);
  });
  it('marks a habitat with no measurable rain as dry rather than drawing nothing', () => {
    const dry = atacama();
    dry.months = dry.months.map((m) => ({ ...m, precipMm: 0.2 }));
    dry.p90 = dry.p90.map((m) => ({ ...m, precipMm: 0.4 }));
    const g = climograph(dry);
    expect(g.rain.dry).toBe(true);
    expect(g.rain.bars.every((b) => b.h < 5)).toBe(true);
    expect(g.alt).toMatch(/No month reaches a millimetre/);
  });
  it('scales the rain axis to the wettest month of this species, not a global cap', () => {
    const wet = atacama();
    wet.months[0].precipMm = 380;
    wet.p90[0].precipMm = 420;
    const g = climograph(wet);
    expect(g.rain.ticks[g.rain.ticks.length - 1].label).toBe('500');
    expect(g.rain.bars[0].h).toBeGreaterThan(g.rain.height * 0.7);
  });
  it('shades the cold quarter around the coldest month, wrapping the year when it must', () => {
    // Southern hemisphere: coldest in Jul (index 6) → Jun–Aug, no wrap.
    const g = climograph(atacama());
    expect(g.temp.coldQuarter.wraps).toBe(false);
    expect(g.temp.coldQuarter.x).toBeCloseTo(g.left + (g.plotW / 12) * 5, 0);
    // Northern: coldest in Jan → Dec–Feb, two rectangles.
    const north = atacama();
    north.months = north.months.map((m, i) => ({ ...m, tmin: 12 - 3 * Math.cos((i / 12) * 2 * Math.PI) }));
    const n = climograph(north);
    expect(n.temp.coldQuarter.wraps).toBe(true);
    expect(n.temp.coldQuarter.x2).toBe(n.left);
  });
  it('leaves the light and humidity strip out when the dossier has neither', () => {
    const bare = atacama();
    bare.months = bare.months.map((m) => ({ tmax: m.tmax, tmin: m.tmin, precipMm: m.precipMm }));
    const g = climograph(bare);
    expect(g.strip).toBeNull();
    expect(climograph(atacama()).strip?.dli?.hi).toBeCloseTo(40, 0);
  });
});

describe('the first sentences of a quotation', () => {
  it('stops after n sentences and says whether more followed', () => {
    const r = firstSentences('One here. Two here. Three here. Four here. Five here.', 4);
    expect(r.text).toBe('One here. Two here. Three here. Four here.');
    expect(r.more).toBe(true);
    expect(firstSentences('Only one.', 4)).toEqual({ text: 'Only one.', more: false });
  });
  it('does not cut at a rank abbreviation, an initial, or an author citation', () => {
    const t = 'Copiapoa cinerea subsp. haseltoniana is a cactus. It was described by F. Ritter in 1959 (syn. Copiapoa haseltoniana). It grows near Taltal. A fourth. A fifth.';
    const r = firstSentences(t, 3);
    expect(r.text).toBe('Copiapoa cinerea subsp. haseltoniana is a cactus. It was described by F. Ritter in 1959 (syn. Copiapoa haseltoniana). It grows near Taltal.');
    expect(r.more).toBe(true);
  });
  it('keeps a closing quote or bracket with its sentence', () => {
    const r = firstSentences('Known as "silver cactus." Next one. Third.', 1);
    expect(r.text).toBe('Known as "silver cactus."');
  });
});
