import { describe, it, expect } from 'vitest';
import { generatedNote, careLine, span3 } from '$core/note';
import { cultivationSheet } from '$core/sheet';

const mk = (tmax: number[], tmin: number[], pr: number[], dli?: number[]) => tmax.map((t, i) => ({ tmax: t, tmin: tmin[i], tmean: (t + tmin[i]) / 2, precipMm: pr[i], dli: dli?.[i], rh: 55 }));
const namaqua = mk([26, 26, 25, 23, 20, 18, 17, 18, 20, 22, 24, 26], [14, 14, 13, 11, 9, 7, 6, 7, 8, 10, 12, 13], [3, 4, 8, 15, 28, 40, 38, 30, 14, 7, 4, 3], [55, 50, 42, 32, 24, 20, 22, 28, 36, 45, 52, 58]);
const equatorial = mk([28, 28, 28, 27, 27, 26, 26, 27, 27, 27, 27, 28], [18, 18, 18, 18, 17, 17, 16, 16, 17, 17, 18, 18], [20, 30, 120, 160, 90, 20, 10, 15, 60, 140, 110, 30]);
const ex = { minAbs: 1.2, minP01: 4.1, maxP99: 38, frostDaysPerYear: 0, years: 44 };

describe('the generated note', () => {
  it('condenses the sheet into one paragraph, shifted to the reader, every sentence traceable', () => {
    const n = generatedNote({ scientific: 'Tylecodon pearsonii', family: 'Crassulaceae', months: namaqua, lat: -30, extremes: ex })!;
    expect(n.text).toContain('Grouped as a cactus or succulent by the genus Tylecodon, which is reliably one kind of plant (archetype table).');
    expect(n.text).toContain('Rain rule: a winter growing season, November to February in the northern hemisphere (May to August at the habitat, southern).');
    expect(n.text).toMatch(/Habitat rain 194 mm a year/);
    expect(n.text).toContain('Cold floor 4.1 °C (1st-percentile habitat night, NASA POWER).');
    expect(n.text).toContain('Open sky over the habitat: 20 to 58 mol/m²/day (CHELSA shortwave).');
    expect(n.from).toEqual(['Its year', 'Rain', 'Light', 'Temperature']);
    expect(n.hab).toBe(true);
    expect(n.text.length).toBeLessThan(700);
    // line by line in a grower's words, one hemisphere per line, the rule apart (round fifty-eight)
    expect(n.items).toEqual([
      { lead: 'A cactus or succulent, by its genus.', rule: 'archetype table' },
      { lead: 'Wet winters: the rain comes November to February (May to August at the habitat), read as a winter growing season.', rule: 'rain rule, CHELSA' },
      { lead: '194 mm of rain a year, 4 months under 5 mm.', rule: 'CHELSA' },
      { lead: 'Open-sky light of 20 to 58 DLI across the year.', rule: 'CHELSA shortwave' },
      { lead: 'Cold floor 4.1 °C: one night in a hundred at a typical spot in the range is colder.', rule: 'NASA POWER, 44 years' }
    ]);
  });
  it('a southern reader gets habitat months unshifted, and the hemisphere is named', () => {
    const n = generatedNote({ scientific: 'Tylecodon pearsonii', family: 'Crassulaceae', months: namaqua, lat: -30 }, { readerLat: -34 })!;
    expect(n.text).toContain('May to August in the southern hemisphere');
  });
  it('with no climate it says so and gives the archetype figure only, credited', () => {
    const n = generatedNote({ scientific: 'Monstera deliciosa', family: 'Araceae' })!;
    expect(n.text).toContain('no habitat climate could be derived for this species');
    expect(n.text).toContain('Cold floor 12 °C (conventional for a tropical foliage plant, archetype table).');
    expect(n.hab).toBe(false);
    expect(generatedNote({ scientific: 'Stephania erecta', family: 'Menispermaceae' })).toBeNull();
  });
  it("every sentence of the note is a row's own short, so the note cannot contradict its card", () => {
    const input = { scientific: 'Aglaonema commutatum', family: 'Araceae', months: equatorial, lat: 1 };
    const { rows } = cultivationSheet(input);
    const n = generatedNote(input)!;
    for (const k of n.from) expect(n.text).toContain(rows.find((r) => r.k === k)!.short!);
    expect(n.text).toContain('the temperature curve is flat');
  });
  it('with nothing to go on there is no note', () => {
    expect(generatedNote({ scientific: 'Nobodia knowsii', family: 'Asparagaceae' })).toBeNull();
  });
});

describe('the label line', () => {
  it('season in the reader\'s hemisphere, floor and open-sky light in a few words, from the same rules as the sheet', () => {
    expect(careLine({ scientific: 'Tylecodon pearsonii', family: 'Crassulaceae', months: namaqua, lat: -30, extremes: ex })).toBe('winter rain Nov–Feb · hab. night 4.1 °C · sky 20–58 DLI');
    // no extremes on file: the CHELSA mean night is printed, named as the habitat night; with the extremes source refused it is not,
    // since it is a warmer and different quantity and the label cannot say so (round seventeen, 7)
    // No extremes at all: the mean night is not the night either, on a label that stays in the pot for years (round thirty-eight, R1-2).
    expect(careLine({ scientific: 'Tylecodon pearsonii', family: 'Crassulaceae', months: namaqua, lat: -30, extremes: null, extremesStatus: 'none' })).toBe('winter rain Nov–Feb · sky 20–58 DLI');
    expect(careLine({ scientific: 'Tylecodon pearsonii', family: 'Crassulaceae', months: namaqua, lat: -30 })).toBe('winter rain Nov–Feb · sky 20–58 DLI');
    expect(careLine({ scientific: 'Tylecodon pearsonii', family: 'Crassulaceae', months: namaqua, lat: -30, extremes: null, extremesStatus: 'refused' })).toBe('winter rain Nov–Feb · sky 20–58 DLI');
    // Extremes read at a sea cell and set aside: the mean night is not printed as the habitat night either (round thirty-seven, R1-2).
    expect(careLine({ scientific: 'Tylecodon pearsonii', family: 'Crassulaceae', months: namaqua, lat: -30, extremes: null, extremesStatus: 'sea' })).toBe('winter rain Nov–Feb · sky 20–58 DLI');
    expect(careLine({ scientific: 'Tylecodon pearsonii', family: 'Crassulaceae', months: namaqua, lat: -30, extremes: ex }, { readerLat: -34 })).toBe('winter rain May–Aug · hab. night 4.1 °C · sky 20–58 DLI');
    expect(careLine({ scientific: 'Aglaonema commutatum', family: 'Araceae', months: equatorial, lat: 1 })).toBe('rain Mar–May, Oct–Nov, flat T'); // no extremes: no night on the label (round thirty-eight, R1-2)
    expect(careLine({ scientific: 'Monstera deliciosa', family: 'Araceae' })).toBe('group min 12 °C');
    // A raised floor is printed as the table's beside the habitat's own night, never as a night the habitat had (round seven, 1).
    expect(careLine({ scientific: 'Monstera deliciosa', family: 'Araceae', months: namaqua, lat: -30, extremes: ex })).toContain('hab. night 4.1 °C · group min 12 °C');
    expect(careLine({ scientific: 'Nobodia knowsii', family: 'Asparagaceae' })).toBe('');
  });
  it('month spans wrap the year and list a bimodal season as two runs', () => {
    expect(span3([11, 12, 1, 2])).toBe('Nov–Feb');
    expect(span3([5, 6, 7, 8])).toBe('May–Aug');
    expect(span3([6])).toBe('Jun');
    expect(span3([3, 4, 9, 10])).toBe('Mar–Apr, Sep–Oct');
  });
});
