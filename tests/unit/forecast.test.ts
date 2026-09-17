import { describe, it, expect } from 'vitest';
import { reduceMet, reduceNws, frostRisk, metUrl, isUS } from '$lib/weather/forecast';

function metFixture(startIso: string, hours: number, tempAt: (h: number) => number) {
  const timeseries = [];
  const t0 = new Date(startIso).getTime();
  for (let h = 0; h < hours; h++) {
    const step = h < 48 ? 1 : 6;
    if (h >= 48 && (h - 48) % 6) continue;
    const time = new Date(t0 + h * 3600_000).toISOString();
    const T = tempAt(h);
    timeseries.push({
      time,
      data: {
        instant: { details: { air_temperature: T } },
        ...(step === 1 ? { next_1_hours: { details: { precipitation_amount: h % 10 === 0 ? 0.5 : 0 } } } : {}),
        next_6_hours: { details: { air_temperature_max: T + 1.5, air_temperature_min: T - 1.5, precipitation_amount: 0 } }
      }
    });
  }
  return { properties: { timeseries } };
}

describe('MET reducer', () => {
  it('folds the series into local days and finds the first frost night', () => {
    // Pittsburgh (lon -80 → UTC-5ish); cold snap on night 3
    const f = reduceMet(metFixture('2026-10-10T12:00:00Z', 216, (h) => (h >= 60 && h < 72 ? -1.2 : 8 + 6 * Math.sin(((h - 6) / 24) * 2 * Math.PI))), -80, '2026-10-10T12:00:00Z');
    expect(f.days.length).toBeGreaterThanOrEqual(8);
    expect(f.days[0].date).toBe('2026-10-10');
    expect(f.firstFrost).toBe('2026-10-12');
    expect(f.firstCold).toBe('2026-10-10'); // the sine's nightly low of 0.5 °C already counts as cold
    const frostDay = f.days.find((d) => d.date === f.firstFrost)!;
    expect(frostDay.tmin).toBeCloseTo(-2.7, 1); // -1.2 instant, -1.5 from the 6-hour min
    expect(f.days[0].precipMm).toBeGreaterThan(0);
  });
  it('builds a MET URL with 4 decimals and altitude', () => {
    expect(metUrl(40.3846, -80.0512, 350.6)).toBe('https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=40.3846&lon=-80.0512&altitude=351');
  });
});

describe('NWS reducer and risk', () => {
  it('keeps only frost and cold products', () => {
    const alerts = reduceNws({ features: [{ properties: { event: 'Frost Advisory', headline: 'Frost Advisory issued', ends: '2026-10-12T14:00:00-04:00' } }, { properties: { event: 'Wind Advisory' } }] });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].event).toBe('Frost Advisory');
  });
  it('ranks warnings above forecast frost above cold above clear', () => {
    const mild = reduceMet(metFixture('2026-06-01T00:00:00Z', 200, () => 18), -80);
    expect(frostRisk(mild, []).level).toBe('none');
    const cold = reduceMet(metFixture('2026-06-01T00:00:00Z', 200, (h) => (h === 30 ? 2.5 : 15)), -80);
    expect(frostRisk(cold, []).level).toBe('cold');
    const frost = reduceMet(metFixture('2026-06-01T00:00:00Z', 200, (h) => (h === 30 ? -0.5 : 15)), -80);
    expect(frostRisk(frost, []).level).toBe('frost');
    expect(frostRisk(mild, [{ event: 'Freeze Warning', ends: '2026-06-02T12:00:00Z' }]).level).toBe('warning');
  });
  it('knows roughly where the NWS applies', () => {
    expect(isUS(40.38, -80.05)).toBe(true);
    expect(isUS(-24.9, -70.4)).toBe(false);
  });
});
