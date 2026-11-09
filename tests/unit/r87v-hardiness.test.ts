/**
 * Round eighty-seven (derived agent): the habitat's hardiness, by stated arithmetic from the page's NASA POWER figures.
 * USDA's zone of the mean of each year's lowest night (10 °F zones from −60 °F, 5 °F halves, "a" the colder; USDA's Plant
 * Hardiness Zone Map), and the RHS band of the record low (the RHS hardiness rating's table, H1a to H7). The walk keeps
 * each calendar year's lowest night (`year-lows.ts`), a year counted only with 347 of its days.
 *
 * FAILS on the base: none of these modules, and no `lows` in the extremes, existed.
 */
import { describe, it, expect } from 'vitest';
import * as v from 'valibot';

describe('USDA zones and RHS bands, by their published tables', () => {
  it('zones: −60 °F opens 1a, each 5 °F a half-zone, 70 °F past 13b', async () => {
    const { usdaZone, usdaRange } = await import('$dossier/hardiness');
    expect(usdaZone(-60)).toBe('1a');
    expect(usdaZone(-55.1)).toBe('1a');
    expect(usdaZone(-55)).toBe('1b');
    expect(usdaZone(-60.1)).toBe('below 1a');
    expect(usdaZone(0)).toBe('7a');
    expect(usdaZone(4.9)).toBe('7a');
    expect(usdaZone(5)).toBe('7b');
    expect(usdaZone(15.1)).toBe('8b');
    expect(usdaZone(69.9)).toBe('13b');
    expect(usdaZone(70)).toBe('above 13b');
    expect(usdaRange('8b')).toBe('15 to 20 °F');
    expect(usdaRange('1a')).toBe('−60 to −55 °F');
    expect(usdaRange('above 13b')).toBeNull();
  });
  it('RHS bands: each edge the warmer band’s, H1a only above 15 °C', async () => {
    const { rhsBand } = await import('$dossier/hardiness');
    expect(rhsBand(15.1)).toBe('H1a');
    expect(rhsBand(15)).toBe('H1b');
    expect(rhsBand(10)).toBe('H1b');
    expect(rhsBand(9.9)).toBe('H1c');
    expect(rhsBand(1)).toBe('H2');
    expect(rhsBand(0.9)).toBe('H3');
    expect(rhsBand(-5)).toBe('H3');
    expect(rhsBand(-5.1)).toBe('H4');
    expect(rhsBand(-20)).toBe('H6');
    expect(rhsBand(-20.1)).toBe('H7');
  });
});

describe('the yearly lows the walk keeps', () => {
  const series = (years: number[], low: (y: number) => number, drop: (y: number, d: number) => boolean = () => false) => {
    const s = { dates: [] as string[], tmin: [] as number[], tmax: [] as number[] };
    for (const y of years) for (let d = 0; d < 365; d++) {
      if (drop(y, d)) continue;
      const day = new Date(Date.UTC(y, 0, 1 + d)).toISOString().slice(0, 10);
      s.dates.push(day); s.tmin.push(d === 20 ? low(y) : 10); s.tmax.push(20);
    }
    return s;
  };
  it('one low a calendar year, lapse-corrected as the other extremes; a year short of 347 days is null', async () => {
    const { yearLows, YEAR_DAYS_MIN } = await import('$climate/year-lows');
    expect(YEAR_DAYS_MIN).toBe(347);
    const s = series([2001, 2002, 2003], (y) => -(y - 2000), (y, d) => y === 2002 && d > 340);
    // 200 m higher: 1.3 °C colder.
    expect(yearLows(s, 200)).toEqual({ from: 2001, t: [-2.3, null, -4.3] });
    expect(yearLows({ dates: [], tmin: [], tmax: [] })).toBeNull();
  });
});

describe('hardinessOf: from the climate as shown', () => {
  const lows = { from: 1981, t: Array.from({ length: 44 }, (_, i) => (i === 3 ? null : -2 - (i % 3))) };
  const climate = (ex: object | null) => ({ status: 'ok', extremes: ex as never, src: { extremes: 'NASA POWER (MERRA-2) daily 1981–2024, cell -33.50_18.750' } });
  it('the mean of the complete years, in °F, and its zone; the record low in its RHS band', async () => {
    const { hardinessOf } = await import('$dossier/hardiness');
    const h = hardinessOf(climate({ years: 44, minAbs: -4.04, lows }))!;
    const whole = lows.t.filter((x): x is number => x !== null);
    const mean = whole.reduce((a, x) => a + x, 0) / whole.length;
    expect(h.usda).toEqual({ years: 43, from: 1981, to: 2024, meanC: Math.round(mean * 10) / 10, meanF: Math.round(((Math.round(mean * 10) / 10) * 1.8 + 32) * 100) / 100, zone: '9b' }); // the °F of the mean as shown (the review of stage 2, M1)
    expect(h.rhs).toEqual({ lowC: -4, band: 'H3', years: 44 });
    expect(h.src).toMatch(/^NASA POWER/);
  });
  it('without the yearly lows (extremes carried from before the walk): the band, and why no zone', async () => {
    const { hardinessOf } = await import('$dossier/hardiness');
    const h = hardinessOf(climate({ years: 44, minAbs: -12.3 }))!;
    expect(h.usda).toBeUndefined();
    expect(h.usdaWhy).toMatch(/not held/);
    expect(h.rhs.band).toBe('H5');
    const short = hardinessOf(climate({ years: 44, minAbs: -1, lows: { from: 1981, t: [-1, -2, null] } }))!;
    expect(short.usdaWhy).toBe('only 2 of the 3 years are complete; a mean needs 20');
  });
  it('none where the page shows no daily extremes', async () => {
    const { hardinessOf } = await import('$dossier/hardiness');
    expect(hardinessOf(climate(null))).toBeNull();
    expect(hardinessOf({ status: 'none' })).toBeNull();
  });
  it('the schema holds the field and the yearly lows', async () => {
    const { hardinessOf } = await import('$dossier/hardiness');
    const { Dossier } = await import('$dossier/schema');
    const shape = (Dossier as unknown as { entries: Record<string, v.GenericSchema> }).entries;
    expect(v.safeParse(shape.hardiness, hardinessOf(climate({ years: 44, minAbs: -4, lows })) ?? undefined).success).toBe(true);
  });
});

describe('deriveFigures: written from the climate the page is written with', () => {
  it('sets both from an ok climate, clears both where the climate is gone', async () => {
    const { deriveFigures } = await import('$dossier/habitat-figures');
    const months = Array.from({ length: 12 }, (_, i) => ({ tmax: 25, tmin: 12, tmean: 18 + (i < 6 ? 1 : -1), precipMm: 80 }));
    const d: Record<string, unknown> = { climate: { status: 'ok', cells: 4, records: 9, cell: 'x', at: { lat: -30, lon: 20 }, months, p10: months, p90: months, extremes: { years: 44, minAbs: 2.1, minP01: 4, maxP99: 33, frostDaysPerYear: 0, lapseAppliedM: 0 }, src: { normals: 'n', envelope: 'e', extremes: 'NASA POWER' } } };
    deriveFigures(d as never);
    expect((d.koppen as { cls: string }).cls).toBe('Cfb');
    expect((d.hardiness as { rhs: { band: string } }).rhs.band).toBe('H2');
    d.climate = { status: 'none', detail: 'a cultigen' };
    deriveFigures(d as never);
    expect(d.koppen).toBeUndefined();
    expect(d.hardiness).toBeUndefined();
  });
});
