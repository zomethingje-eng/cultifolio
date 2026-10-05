/**
 * Round sixty, agent X: what the species page and the front page build from the figures. The season card in the reader's
 * months (visitor 3), the head a search engine and a link preview read (the self-review's 14, product 6), the photograph
 * credit lines outside a species page (rule 1, the round forty-two review G), the share card's wording (visitor 8) and
 * the climograph's tied wettest month (words 20).
 */
import { describe, it, expect } from 'vitest';
import { growingYear } from '$core/sheet';
import { seasonStrip } from '$lib/ui/ref/season';
import { speciesTitle, speciesDescription, photoCredit, photoSource, tileCredit, type HeadInput } from '$lib/ui/ref/head';
import { climateCardSvg } from '$lib/share/card';
import { climograph } from '$climate/climograph';

const mk = (tmax: number[], tmin: number[], pr: number[], dli?: number[]) => tmax.map((t, i) => ({ tmax: t, tmin: tmin[i], tmean: (t + tmin[i]) / 2, precipMm: pr[i], dli: dli?.[i], rh: 60 }));
// A Namaqualand year: winter rain (May to August at the habitat), southern hemisphere, dry summers.
const namaqua = mk([30, 30, 28, 25, 21, 18, 18, 19, 22, 25, 27, 29], [15, 15, 13, 10, 7, 5, 4, 5, 7, 10, 12, 14], [2, 3, 6, 15, 30, 40, 38, 30, 14, 6, 3, 2], [55, 52, 45, 36, 28, 24, 25, 30, 38, 46, 52, 56]);

describe('the season card (round sixty; visitor 3)', () => {
  it("draws the rule's months in the reader's calendar: a southern winter-rain habitat for a northern grower", () => {
    const year = growingYear(namaqua, -30)!;
    expect(year.grow).toBe('winter');
    expect(year.shiftable).toBe(true);
    const north = seasonStrip(year, namaqua, 51)!;
    const on = north.cells.filter((c) => c.on).map((c) => c.m);
    // The habitat's May to August, six months on: November to February.
    expect(on).toEqual(year.shifted.slice().sort((a, b) => a - b));
    expect(on).toContain(12);
    expect(on).not.toContain(6);
    expect(north.calendar).toBe('your months, northern hemisphere');
    expect(north.shadeIs).toBe('the rainy season, read as a winter growing season');
    // The months under 5 mm (the habitat's December to February and November, March's 6 mm is not) move with them.
    const dry = north.cells.filter((c) => c.dry).map((c) => c.m);
    expect(dry.sort((a, b) => a - b)).toEqual([5, 6, 7, 8]);
    // A grower in the habitat's own hemisphere sees the habitat's months.
    const south = seasonStrip(year, namaqua, -34)!;
    expect(south.cells.filter((c) => c.on).map((c) => c.m)).toEqual(year.growMonths.slice().sort((a, b) => a - b));
    expect(south.calendar).toBe('your months, southern hemisphere');
  });
  it('shades nothing for a spread year, and says nothing it did not read', () => {
    const spread = mk([28, 28, 26, 23, 20, 17, 17, 18, 21, 23, 25, 27], [14, 14, 12, 9, 6, 3, 3, 4, 6, 9, 11, 13], [30, 32, 40, 30, 22, 18, 16, 20, 25, 30, 35, 30]);
    const year = growingYear(spread, -33)!;
    expect(year.spread).toBe(true);
    const s = seasonStrip(year, spread, 51)!;
    expect(s.cells.some((c) => c.on)).toBe(false);
    expect(s.shadeIs).toBeNull();
  });
  it('a habitat within 10° of the equator keeps its own months, said as such', () => {
    const eq = mk([30, 30, 29, 27, 25, 23, 22, 23, 25, 27, 29, 30], [20, 20, 19, 17, 15, 13, 12, 13, 15, 17, 19, 20], [10, 10, 20, 60, 120, 140, 130, 90, 40, 20, 10, 10]);
    const year = growingYear(eq, 5)!;
    expect(year.shiftable).toBe(false);
    const s = seasonStrip(year, eq, -40)!;
    expect(s.calendar).toBe("the habitat's months, not shifted");
    expect(s.cells.filter((c) => c.on).map((c) => c.m)).toEqual(year.growMonths.slice().sort((a, b) => a - b));
  });
});

const cinerea: HeadInput = {
  name: { scientific: 'Copiapoa cinerea', family: 'Cactaceae' },
  common: null,
  climate: { status: 'ok', months: mk([24, 24, 23, 21, 19, 17, 16, 17, 18, 20, 21, 23], [16, 16, 15, 13, 11, 10, 9, 9, 10, 12, 13, 15], [0, 0, 0, 1, 5, 12, 20, 15, 6, 1, 0, 0], [62, 58, 50, 40, 33, 30, 31, 36, 44, 52, 58, 63]), records: 352, extremes: { minP01: 6.5, years: 44 } },
  native: 1,
  photos: 20,
  summary: true
};

describe('the species page head (round sixty; the self-review 14, product 6)', () => {
  it('with a climate: the figures, each with its source, and never the Wikipedia lead or advice', () => {
    expect(speciesTitle(cinerea)).toBe('Copiapoa cinerea: habitat rain, cold nights and light');
    const d = speciesDescription(cinerea);
    expect(d).toBe('Copiapoa cinerea in the wild: 1 night in 100 below 6.5 °C (NASA POWER); 60 mm of rain a year and 30–63 DLI of light (CHELSA); from 352 in-range records.');
    expect(d.length).toBeLessThanOrEqual(155);
    expect(d).not.toMatch(/cultivation|suggests|wants|tolerates/);
    // The reader's units, as the page renders them.
    expect(speciesDescription(cinerea, 'us')).toContain('43.7 °F (NASA POWER)');
  });
  it('without extremes the mean night is named as what it is, with its source', () => {
    const d = speciesDescription({ ...cinerea, climate: { ...cinerea.climate, extremes: null } });
    expect(d).toContain("coldest month's mean night 9.0 °C (CHELSA)");
    expect(d).not.toContain('NASA POWER');
  });
  it('a long name is clipped at a word under 155 characters', () => {
    const long = { ...cinerea, name: { scientific: 'Turbinicarpus pseudomacrochele subsp. krainzianus', family: 'Cactaceae' } };
    for (const h of [long, { ...long, climate: { status: 'pending' } }]) {
      const d = speciesDescription(h);
      expect(d.length).toBeLessThanOrEqual(155);
      expect(d).not.toMatch(/\s…$/);
    }
  });
  it('without a climate: a true list of what the page holds, the state of the climate said as it is', () => {
    expect(speciesTitle({ ...cinerea, climate: { status: 'pending' } })).toBe('Copiapoa cinerea');
    expect(speciesDescription({ ...cinerea, climate: { status: 'pending' }, summary: false })).toBe('Copiapoa cinerea, Cactaceae: native range and photographs, each with its source; habitat climate pending.');
    expect(speciesDescription({ name: { scientific: 'Refusia testii', family: 'Testaceae' }, climate: { status: 'refused' }, native: 1, photos: 0, summary: false })).toBe('Refusia testii, Testaceae: native range, with its source; habitat climate not checked.');
    expect(speciesDescription({ name: { scientific: 'Nullia nihil' }, climate: { status: 'none' }, native: 0, photos: 0, summary: false })).toBe('Nullia nihil: names and registers, each with its source.');
    expect(speciesDescription({ ...cinerea, climate: { status: 'none' } })).toContain('a quoted, credited Wikipedia summary');
  });
  it('a common name joins the title only when it is not the genus again', () => {
    expect(speciesTitle({ ...cinerea, common: 'Copiapoa' })).toBe('Copiapoa cinerea: habitat rain, cold nights and light');
    expect(speciesTitle({ ...cinerea, common: 'Grey copiapoa', climate: { status: 'refused' } })).toBe('Copiapoa cinerea (Grey copiapoa)');
  });
});

describe('photograph credits outside a species page (round sixty; rule 1)', () => {
  it('names the author and the licence once', () => {
    expect(photoCredit({ attribution: '(c) Jane Doe', licence: 'by' })).toBe('(c) Jane Doe · CC BY');
    expect(photoCredit({ attribution: '(c) Jane Doe, some rights reserved (CC BY)', licence: 'by' })).toBe('(c) Jane Doe, some rights reserved (CC BY)');
    expect(photoCredit({ attribution: 'Jo Bloggs', licence: 'cc0' })).toBe('Jo Bloggs · CC0');
  });
  it('a tile with only a thumbnail names the site it came from, and an unknown host names nothing', () => {
    expect(photoSource('https://inaturalist-open-data.s3.amazonaws.com/photos/1/small.jpg')).toBe('iNaturalist');
    expect(photoSource('https://static.inaturalist.org/photos/1/small.jpg')).toBe('iNaturalist');
    expect(photoSource('https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/x.jpg/800px-x.jpg')).toBe('Wikimedia Commons');
    expect(photoSource('https://api.gbif.org/v1/image/cache/fit-in/500x/abc')).toBe('GBIF');
    expect(photoSource('https://example.com/x.jpg')).toBeNull();
    expect(tileCredit({ thumb: 'https://static.inaturalist.org/photos/1/small.jpg' })).toBe('Photo: iNaturalist');
    expect(tileCredit({ thumb: 'https://example.com/x.jpg' })).toBeNull();
    expect(tileCredit({ credit: '(c) Jane Doe · CC BY', thumb: 'https://static.inaturalist.org/photos/1/small.jpg' })).toBe('(c) Jane Doe · CC BY');
  });
});

describe('the share card (round sixty; visitor 8)', () => {
  const card = (units?: 'metric' | 'us') => climateCardSvg({ units, name: 'Copiapoa cinerea', family: 'Cactaceae', origin: ['CLN'], slug: 'copiapoa-cinerea', cells: 12, south: true, climate: { months: cinerea.climate.months!, p10: cinerea.climate.months!, p90: cinerea.climate.months!, cells: 12, extremes: { minAbs: 3.1, minP01: 6.5, maxP99: 29, years: 44, frostDaysPerYear: 0, frostNights: 0 } } });
  it('says the light as lowest to highest month, the rain rule as 25 mm or more, and no inch on a metric card', () => {
    const svg = card();
    expect(svg).toContain('lowest to highest month');
    expect(svg).not.toContain('winter to summer');
    expect(svg).toContain('of 25 mm or more');
    expect(svg).not.toMatch(/over 25 mm|\(1 in\)/);
    expect(card('us')).toContain('0.98 in (25 mm) or more');
  });
  it('names its calendar and its sources, and the legend ends inside the card', () => {
    const svg = card();
    expect(svg).toContain('habitat months, southern hemisphere');
    expect(svg).toContain('NASA POWER, 44 years');
    // Every legend item starts left of the chart's right edge (gx 520 + 640), so none runs off the 1200 px card.
    const legend = /<g transform="translate\(520 [\d.]+\)"[^>]*>([\s\S]*?)<\/g>/.exec(svg)![1];
    const xs = [...legend.matchAll(/<text x="(\d+)"/g)].map((m) => Number(m[1]));
    expect(Math.max(...xs)).toBeLessThan(560);
  });
});

describe('the climograph names no one month for a tie (round sixty; words 20)', () => {
  it('equal rain in every month, or several wettest months', () => {
    const evenM = mk(Array(12).fill(20), Array(12).fill(10), Array(12).fill(30));
    const even = climograph({ months: evenM, p10: evenM, p90: evenM, cells: 3 });
    expect(even.alt).toContain('the same in every month');
    const tiedM = mk(Array(12).fill(20), Array(12).fill(10), [40, 40, 40, 10, 5, 5, 5, 5, 5, 5, 5, 10]);
    const tied = climograph({ months: tiedM, p10: tiedM, p90: tiedM, cells: 3 });
    expect(tied.alt).toContain('the wettest months (3 at 40 mm)');
  });
});
