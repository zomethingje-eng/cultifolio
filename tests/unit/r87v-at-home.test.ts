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
// Round 103: a word with a tip (Term) is read as its word, its button and empty tip taking no space.
const text = (html: string) => html.replace(/<!--[^]*?-->/g, '').replace(/<span class="term[^"]*"[^>]*><button[^>]*>([^<]*)<\/button><span class="tip[^"]*"[^>]*><\/span><\/span>/g, '$1').replace(/<[^>]+>/g, ' ').replace(/&rsquo;/g, '’').replace(/\s+/g, ' ');

// atHomeRows and AtHome went into the year panel's lens in round 129 (SPECIES 20; $climate/lens-spaces, r127a).
describe('the sections rendered', () => {
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
