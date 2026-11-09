/**
 * Round eighty-seven (derived agent; the plan's C10, the owner's mockup "At home, aim for"): the targets worked out from the
 * page's habitat figures, each row with its arithmetic and source; PPFD = DLI × 1,000,000 ÷ (hours × 3,600) for 14 hours,
 * 12 and 16 a choice away; humidity only where every month holds it. And the three sections rendered: At home, the
 * hardiness, the climate class.
 *
 * FAILS on the base: no `at-home.ts`, no AtHome, Hardiness or Koppen component.
 */
import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';

const months = Array.from({ length: 12 }, (_, i) => ({ tmax: 30 - Math.abs(6 - i), tmin: 8 + Math.abs(6 - i) / 2, tmean: 18, precipMm: 10 + i, dli: 30 + (i % 3), rh: 40 + i }));
const lo = months.map((m) => ({ ...m, tmax: m.tmax - 1, tmin: m.tmin - 1 }));
const hi = months.map((m) => ({ ...m, tmax: m.tmax + 1, tmin: m.tmin + 1 }));
const climate = { status: 'ok', cells: 11, months, p10: lo, p90: hi, extremes: { minAbs: -0.7, years: 44 } };
const text = (html: string) => html.replace(/<!--[^]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/&rsquo;/g, '’').replace(/\s+/g, ' ');

describe('atHomeRows', () => {
  it('winter nights, summer days, grow light for 14 h, humidity: each with its arithmetic', async () => {
    const { atHomeRows, ppfdOf } = await import('$lib/ui/ref/at-home');
    const rows = atHomeRows(climate, 'metric')!;
    expect(rows.map((r) => r.k)).toEqual(['Winter nights', 'Summer days', 'Grow light, 14 h a day', 'Humidity']);
    // The coldest month is the one whose median low is lowest: July (index 6, 8 °C), 7 to 9 across the cells.
    expect(rows[0]).toMatchObject({ v: '7–9 °C', how: 'the July mean nightly low, 10th to 90th percentile across the 11 cells of the range, median 8.0 °C (CHELSA V2.1, 1981–2010); its coldest night on record was -0.7 °C (NASA POWER, daily lows over 44 years at the typical spot)' });
    expect(rows[1]).toMatchObject({ v: '29–31 °C', how: expect.stringMatching(/^the July mean daily high/) });
    const dli = Math.round((months.reduce((a, m) => a + m.dli, 0) / 12) * 10) / 10;
    expect(rows[2].v).toBe(`${Math.round(ppfdOf(dli, 14))} µmol/m²/s`);
    expect(rows[2].how).toContain(`${dli.toFixed(1)} mol/m²/day`);
    expect(rows[2].how).toMatch(/× 1,000,000 ÷ \(14 × 3,600\)$/);
    expect(rows[3]).toMatchObject({ v: '40–51%', figure: true });
    // 31 mol/m²/day over 14 h: 31e6 ÷ 50,400 = 615.1
    expect(Math.round(ppfdOf(31, 14))).toBe(615);
    expect(atHomeRows(climate, 'metric', 12)![2].k).toBe('Grow light, 12 h a day');
    expect(atHomeRows(climate, 'metric', 16)![2].v).toBe(`${Math.round(ppfdOf(dli, 16))} µmol/m²/s`);
  });
  it('no humidity in the figures: the row says none is worked out; no record low: said so; the reader’s units', async () => {
    const { atHomeRows } = await import('$lib/ui/ref/at-home');
    const dry = { ...climate, extremes: null, months: months.map(({ rh: _, ...m }) => m) };
    const rows = atHomeRows(dry, 'us')!;
    expect(rows[3]).toEqual({ k: 'Humidity', v: 'none worked out', how: 'the habitat figures hold no humidity, so none is worked out', figure: false });
    expect(rows[0].how).toMatch(/; no record low is shown for this page$/);
    expect(rows[0].v).toBe('45–48 °F');
  });
  it('nothing without a habitat climate', async () => {
    const { atHomeRows } = await import('$lib/ui/ref/at-home');
    expect(atHomeRows({ status: 'none' }, 'metric')).toBeNull();
    expect(atHomeRows(null, 'metric')).toBeNull();
  });
});

describe('the sections rendered', () => {
  it('AtHome: the head, the rows, the hours choice and the owner’s note', async () => {
    const AtHome = (await import('$lib/ui/ref/AtHome.svelte')).default;
    const t = text(render(AtHome, { props: { climate, units: 'metric' } as never }).body);
    expect(t).toContain('At home, aim for (worked out from the figures above)');
    expect(t).toContain('Grow light, 14 h a day');
    expect(t).toMatch(/12 h 14 h 16 h/);
    expect(t).toContain('A starting point worked out from where it grows wild, not tested in cultivation. The light is the open sky’s; a plant among rocks or shrubs gets less.');
    expect(render(AtHome, { props: { climate: { status: 'pending' }, units: 'metric' } as never }).body.replace(/<!--[^]*?-->/g, '').trim()).toBe('');
  });
  it('Hardiness: the zone with its years and arithmetic, the band, and that it is the habitat’s', async () => {
    const Hardiness = (await import('$lib/ui/ref/Hardiness.svelte')).default;
    const hardiness = { usda: { years: 43, from: 1981, to: 2024, meanC: -3, meanF: 26.6, zone: '9b' }, rhs: { lowC: -4, band: 'H3', years: 44 }, src: 'NASA POWER (MERRA-2) daily 1981–2024, cell -33.50_18.750' };
    const t = text(render(Hardiness, { props: { hardiness, extremesShown: true, units: 'metric' } as never }).body);
    expect(t).toContain('USDA zone of the habitat 9b');
    expect(t).toContain('lowest night in each of 43 complete years, 1981–2024: −3.0 °C = −3.0 × 9 ÷ 5 + 32 = 26.6 °F, in zone 9b (25 to 30 °F)');
    expect(t).toContain('the record low falls in RHS’s H3 band (−5 to 1 °C: half-hardy, unheated glasshouse or mild winter;');
    expect(t).toContain('neither is a tested hardiness of the plant');
    // A page whose record has extremes but no hardiness yet: said, never "none".
    expect(text(render(Hardiness, { props: { hardiness: undefined, extremesShown: true, units: 'metric' } as never }).body)).toContain('Not worked out for this page yet');
    expect(render(Hardiness, { props: { hardiness, extremesShown: false, units: 'metric' } as never }).body.replace(/<!--[^]*?-->/g, '').trim()).toBe('');
  });
  it('Koppen: the class, each letter’s test, the source, and the Walter–Lieth reading', async () => {
    const Koppen = (await import('$lib/ui/ref/Koppen.svelte')).default;
    const { koppenOf } = await import('$dossier/koppen');
    const m = [10, 11, 13, 15, 19, 23, 26, 26, 23, 19, 14, 11].map((tmean, i) => ({ tmean, precipMm: [90, 80, 70, 50, 30, 10, 2, 5, 30, 80, 100, 110][i] }));
    const t = text(render(Koppen, { props: { koppen: koppenOf(m), months: m, cells: 7 } as never }).body);
    expect(t).toContain('Csa Köppen–Geiger, worked out from the median year of the range’s 7 cells');
    expect(t).toContain('s dry summer the driest summer month');
    expect(t).toContain('Peel, Finlayson and McMahon (2007)');
    expect(t).toContain('Walter–Lieth: arid in May to September');
  });
});
