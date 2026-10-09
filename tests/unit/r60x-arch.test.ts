/**
 * Round sixty, agent X: the archetype table never raises a habitat cold floor, terrestrial and temperate genera leave
 * the tropical groups, and the sheet's sentences the words review found broken (self-review 3; words 1, 2, 6 to 9, 20).
 */
import { describe, it, expect } from 'vitest';
import { archFor, aLabel, ARCH } from '$core/arch';
import { coldFloor, cultivationSheet } from '$core/sheet';
import { careLine, generatedNote } from '$core/note';
import { climateCardSvg } from '$lib/share/card';
import { frostWording } from '$core/extremes';

const mk = (tmax: number[], tmin: number[], pr: number[], dli?: number[]) => tmax.map((t, i) => ({ tmax: t, tmin: tmin[i], tmean: (t + tmin[i]) / 2, precipMm: pr[i], dli: dli?.[i], rh: 55 }));
// An Andean bromeliad's year: a -3 °C 1st-percentile night, summer rain.
const andes = mk([14, 14, 14, 13, 12, 11, 11, 12, 13, 14, 15, 15], [2, 2, 1, 0, -1, -2, -3, -2, -1, 0, 1, 2], [90, 80, 70, 30, 10, 5, 5, 8, 20, 40, 60, 80], [40, 40, 38, 34, 30, 28, 29, 32, 36, 40, 42, 42]);
const cold = { minAbs: -9, minP01: -3, maxP99: 24, frostDaysPerYear: 60, frostNights: 2640, years: 44 };

describe('the archetype table (round sixty; self-review 3)', () => {
  it('terrestrial bromeliads and terrestrial or temperate orchids are in no group, so no tropical minimum reaches them', () => {
    for (const [name, family] of [['Puya raimondii', 'Bromeliaceae'], ['Dyckia marnier-lapostollei', 'Bromeliaceae'], ['Hechtia texensis', 'Bromeliaceae'], ['Deuterocohnia brevifolia', 'Bromeliaceae'], ['Fascicularia bicolor', 'Bromeliaceae'], ['Encholirium spectabile', 'Bromeliaceae'], ['Orthophytum gurkenii', 'Bromeliaceae'], ['Bletilla striata', 'Orchidaceae'], ['Pleione formosana', 'Orchidaceae'], ['Cypripedium calceolus', 'Orchidaceae'], ['Dactylorhiza maculata', 'Orchidaceae'], ['Ophrys apifera', 'Orchidaceae'], ['Disa uniflora', 'Orchidaceae'], ['Habenaria radiata', 'Orchidaceae'], ['Spiranthes spiralis', 'Orchidaceae'], ['Calanthe discolor', 'Orchidaceae']] as const) {
      expect(archFor(name, family), name).toBeNull();
      const fl = coldFloor(andes, cold, archFor(name, family));
      expect(fl?.convention, name).toBeNull();
    }
  });
  it('a family that splits between groups assigns none by family', () => {
    expect(archFor('Unlisted bromeliad', 'Bromeliaceae')).toBeNull();
    expect(archFor('Unlisted orchid', 'Orchidaceae')).toBeNull();
    expect(archFor('Arisaema triphyllum', 'Araceae')).toBeNull();
    // A genus on the table still answers for itself.
    expect(archFor('Tillandsia ionantha', 'Bromeliaceae')?.arch.key).toBe('epiphyte');
    expect(archFor('Phalaenopsis amabilis', 'Orchidaceae')?.arch.key).toBe('orchid');
  });
  it('a habitat floor of -3 °C is never shown as 10 °C, even for a genus the table groups', () => {
    const guess = archFor('Tillandsia ionantha', 'Bromeliaceae');
    const fl = coldFloor(andes, cold, guess)!;
    expect(fl.habitat).toBe(-3);
    expect(fl.s).toContain('Cold floor: -3.0 °C');
    for (const t of [fl.s, fl.short, fl.plain.lead]) {
      expect(t).not.toMatch(/10 °C/);
      expect(t).not.toMatch(/takes the higher|archetype minimum|group minimum/);
    }
    // The convention is said apart, as one with no source.
    expect(fl.convention?.text).toBe('the convention for epiphytes grown indoors is 10 °C; no source is given for it');
    // The sheet, the note and the label say the habitat's figure only.
    const { rows } = cultivationSheet({ scientific: 'Tillandsia ionantha', family: 'Bromeliaceae', months: andes, lat: -15, extremes: cold });
    const t = rows.find((r) => r.k === 'Temperature')!;
    expect(t.s).toContain('Cold floor: -3.0 °C');
    expect(t.s + t.why + (t.short ?? '')).not.toMatch(/10 °C|takes the higher/);
    const n = generatedNote({ scientific: 'Tillandsia ionantha', family: 'Bromeliaceae', months: andes, lat: -15, extremes: cold })!;
    expect(n.text).not.toMatch(/10 °C/);
    expect(careLine({ scientific: 'Tillandsia ionantha', family: 'Bromeliaceae', months: andes, lat: -15, extremes: cold })).not.toContain('group min');
  });
  it('the share card prints the habitat night, never a group minimum over it', () => {
    const svg = climateCardSvg({ name: 'Tillandsia ionantha', family: 'Bromeliaceae', origin: ['PER'], slug: 'tillandsia-ionantha', cells: 12, climate: { months: andes, p10: andes, p90: andes, cells: 12, extremes: cold } });
    expect(svg).toContain('-3.0 °C');
    expect(svg).not.toMatch(/group minimum|an epiphyte group|10 °C/);
  });
  it('no label reads "an other epiphyte"', () => {
    for (const a of Object.values(ARCH)) expect(aLabel(a.lab)).not.toMatch(/\ban other\b/);
    expect(aLabel('Other epiphyte')).toBe('another epiphyte');
    expect(aLabel(ARCH.epiphyte.lab)).toBe('an epiphyte');
  });
});

describe('sheet wording (round sixty; words)', () => {
  it('an equatorial habitat states the 10° rule, with no doubled word and no claim the curve contradicts', () => {
    // Lat 5, a curve that moves 8 °C: not shiftable by latitude alone.
    const m = mk([30, 30, 29, 27, 25, 23, 22, 23, 25, 27, 29, 30], [20, 20, 19, 17, 15, 13, 12, 13, 15, 17, 19, 20], [10, 10, 20, 60, 120, 140, 130, 90, 40, 20, 10, 10]);
    const { rows, year } = cultivationSheet({ scientific: 'Testus equatoria', family: 'Cactaceae', months: m, lat: 5, readerLat: 51 });
    expect(year!.shiftable).toBe(false);
    const s = rows.find((r) => r.k === 'Its year')!;
    expect(s.s).not.toMatch(/there there/);
    expect(s.s).not.toMatch(/no thermal season/);
    expect(s.s).toContain('within 10° of the equator, where the shift rule does not apply');
    expect(s.why).toContain('10° or more from the equator');
  });
  it('the habitat months are said once when the reader shares the habitat hemisphere', () => {
    const m = mk([18, 21, 25, 30, 33, 35, 34, 33, 31, 27, 22, 18], [4, 6, 9, 14, 18, 22, 22, 22, 19, 15, 9, 4], [5, 5, 5, 5, 8, 20, 90, 95, 60, 10, 5, 5]);
    const { rows } = cultivationSheet({ scientific: 'Ariocarpus fissuratus', family: 'Cactaceae', months: m, lat: 29, readerLat: 52 });
    const short = rows.find((r) => r.k === 'Its year')!.short!;
    expect(short).toBe('Rain rule: a summer growing season, July to September in the northern hemisphere.');
  });
  it('rain spread over eight or more months is read as no short rainy season', () => {
    const karoo = mk([28, 28, 26, 23, 20, 17, 17, 18, 21, 23, 25, 27], [14, 14, 12, 9, 6, 3, 3, 4, 6, 9, 11, 13], [30, 32, 40, 30, 22, 18, 16, 20, 25, 30, 35, 30]);
    const { rows } = cultivationSheet({ scientific: 'Dioscorea elephantipes', family: 'Dioscoreaceae', months: karoo, lat: -33 });
    const r = rows.find((x) => x.k === 'Its year')!;
    expect(r.plain!.lead).toMatch(/^Rain spread over \d+ months: no short rainy season; \d+ mm in the median year\.$/);
    expect(r.s + r.short + r.plain!.lead).not.toMatch(/No rainy season|no season/);
  });
  it('tied months are not named as one month', () => {
    const dry = mk([22, 22, 21, 20, 18, 17, 17, 17, 17, 18, 19, 20], [16, 16, 15, 14, 12, 10, 9, 10, 11, 11, 13, 14], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const rain0 = cultivationSheet({ scientific: 'Copiapoa cinerea', family: 'Cactaceae', months: dry, lat: -26 }).rows.find((r) => r.k === 'Rain')!;
    expect(rain0.s).toContain('The same in every month, 0 mm');
    expect(rain0.s).not.toMatch(/driest January/);
    const seven = mk([22, 22, 21, 20, 18, 17, 17, 17, 17, 18, 19, 20], [16, 16, 15, 14, 12, 10, 9, 10, 11, 11, 13, 14], [0, 0, 0, 0, 10, 30, 40, 20, 5, 0, 0, 0]);
    const r7 = cultivationSheet({ scientific: 'Copiapoa cinerea', family: 'Cactaceae', months: seven, lat: -26 }).rows.find((r) => r.k === 'Rain')!;
    expect(r7.s).toContain('driest months (7 at 0 mm)');
    expect(r7.s).toContain('Wettest month July at 40 mm');
  });
  it('the fixed POWER years are never printed: the series says its own length', () => {
    const { rows } = cultivationSheet({ scientific: 'Tillandsia ionantha', family: 'Bromeliaceae', months: andes, lat: -15, extremes: { ...cold, years: 40 } });
    const t = rows.find((r) => r.k === 'Temperature')!;
    expect(t.why).not.toContain('1981–2024');
    expect(t.why).toContain('NASA POWER daily minima and maxima over 40 years');
    expect(t.why).not.toMatch(/CHELSA\. .*CHELSA monthly means, median year across the grid cells of the range, CHELSA/);
  });
  it('frost counts carry a thousands separator', () => {
    expect(frostWording({ frostDaysPerYear: 365.3, frostNights: 16071, years: 44 })).toBe('16,071 frost nights in 44 years, 365.3 a year');
  });
});
