/**
 * Round sixty-three, the fix pass (fixer D), R2 findings 1, 2 and 9. Each failed on the merged round before the fix.
 *  - 1: every sentence that gives the median year's rain total names it as that, since the glance card, the compare row,
 *    the share card and the link preview give the median of the cells' own yearly totals, another figure; and the sheet
 *    says the cells' median whenever the dossier has it, not only when the 10th and 90th percentiles differ.
 *  - 2: the median of the cells' yearly totals is interpolated, so with an even number of cells it is no total any cell
 *    has, and nothing in the code says it is.
 *  - 9: the batch page orders its lines by the dates it shows, as the plant page does.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { cultivationSheet } from '$core/sheet';
import { quantile } from '$core/extremes';

// R63FD_ROOT reads the pages from another tree (the fix pass ran this against the merged round's copies to show it fail).
const code = (p: string) => readFileSync(`${process.env.R63FD_ROOT ?? '.'}/${p}`, 'utf8');
const pr = [10, 12, 15, 25, 40, 30, 20, 18, 14, 12, 10, 9];
const months = pr.map((p, i) => ({ tmax: 28 - Math.abs(6 - i), tmin: 12 - Math.abs(6 - i), tmean: 20 - Math.abs(6 - i), precipMm: p }));
const rainRow = (extra: Record<string, number>) => cultivationSheet({ scientific: 'Testus one', family: 'Aizoaceae', months, lat: -30, ...extra } as never).rows.find((x) => x.k === 'Rain')!;

describe('R2 1: the median year\'s rain is named as that', () => {
  it('the Rain row\'s sentence, one-line form and plain lead say "in the median year"', () => {
    const r = rainRow({ annualP10: 150, annualP90: 420, annualP50: 260 });
    expect(r.s).toMatch(/^215 mm in the median year at the habitat/);
    expect(r.short).toMatch(/^Habitat rain 215 mm in the median year, wettest month May at 40 mm/);
    expect(r.plain!.lead).toBe('215 mm of rain in the median year.');
    expect(r.short).not.toMatch(/215 mm a year/);
  });
  it('the cells\' median is said whenever the dossier has it, even when the 10th and 90th percentiles round alike', () => {
    const r = rainRow({ annualP10: 260.2, annualP90: 260.4, annualP50: 260.3 });
    expect(r.s).toContain("The median of the cells' own yearly totals, 260 mm, is the year's rain at the top of the page; the 215 mm here is the median year's");
    expect(r.s).not.toContain('10th to 90th percentile');
    const both = rainRow({ annualP10: 150, annualP90: 420, annualP50: 260 });
    expect(both.s).toContain("the year's total runs 150 mm to 420 mm, the 10th to 90th percentile of each cell's own year. The median of the cells' own yearly totals, 260 mm");
  });
  it('an old dossier with no median: no median clause, and the figure still named as the median year\'s', () => {
    const r = rainRow({ annualP10: 150, annualP90: 420 });
    expect(r.s).not.toContain('The median of the cells');
    expect(r.short).toContain('in the median year');
  });
  it('the season reading beside the glance card names its rain the same way (a dry habitat, read by temperature)', () => {
    const dry = months.map((m) => ({ ...m, precipMm: 6 }));
    const { rows } = cultivationSheet({ scientific: 'Testus two', family: 'Aizoaceae', months: dry, lat: -30, annualP50: 90 } as never);
    const season = rows.find((x) => x.k === 'Its year')!;
    expect(season.plain!.lead).toMatch(/^72 mm of rain in the median year, under the rule's 120 mm/);
    expect(season.short).toContain('(72 mm in the median year)');
  });
  it('the plant page\'s season notes name it the same way', () => {
    const page = code('src/routes/plants/[acc]/+page.svelte');
    expect(page).toContain('note: `${rain(y.annualMm, u)} of rain in the median year and a flat temperature curve');
    expect(page).toContain("note: `${rain(y.annualMm, u)} of rain in the median year; the temperature rule's cooler six months");
    expect(page).not.toMatch(/rain\(y\.annualMm, u\)\} a year/);
  });
});

describe('R2 2: the cells\' median is interpolated, and nothing says it is a total a cell has', () => {
  it('four cells at 100, 200, 600 and 900 mm: the median is 400 mm, which no cell has', () => {
    expect(quantile([100, 200, 600, 900], 0.5)).toBe(400);
  });
  it('the code\'s own words no longer claim "a year cells actually have" of the median', () => {
    expect(code('src/lib/climate/year-rain.ts')).not.toContain('cells actually have');
    expect(code('src/lib/climate/year-rain.ts')).toContain('halfway between the two middle totals when the cells are even in number');
    expect(code('src/lib/climate/provider.ts')).toContain('not a total any cell has');
  });
});

describe('R2 9: the batch page orders its lines by the dates it shows', () => {
  const page = code('src/routes/propagation/[id]/+page.svelte');
  it('the timeline iterates the lines sorted by their shown date', () => {
    expect(page).toContain('{#each shownEvents as e}');
    expect(page).not.toContain('{#each events as e}');
  });
  it('a repair note shown under the day it was written sits first, not among lines of months back', () => {
    const m = /const shownEvents = \$derived\(\[\.\.\.events\]\.sort\((\(a, b\) => .*)\)\);/.exec(page);
    expect(m).not.toBeNull();
    const cmp = new Function('lineDates', `return ${m![1]};`) as (d: Map<string, string>) => (a: { id: string; d: string }, b: { id: string; d: string }) => number;
    const events = [{ id: 'e3', d: '2026-06-01' }, { id: 'e2', d: '2026-03-01' }, { id: 'repair', d: '2026-02-01' }, { id: 'e1', d: '2026-01-01' }];
    const shown = [...events].sort(cmp(new Map([['repair', '2026-10-09']])));
    expect(shown.map((e) => e.id)).toEqual(['repair', 'e3', 'e2', 'e1']);
  });
});
