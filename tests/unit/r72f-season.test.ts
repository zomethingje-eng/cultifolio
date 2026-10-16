/**
 * Round seventy-two, reviewer F (triage F1): a wet season with a month whose mean nightly low is below 0 °C is no growing
 * season. 72 pages read "a winter growing season" from one: Rubus parviflorus at a wet-season mean of 4.1 °C, Colchicum
 * kurdicum at −4.9 °C. The months are the live dossiers' median years (corpus 4c784c5dc7ca2448).
 */
import { describe, it, expect } from 'vitest';
import { growingYear, cultivationSheet } from '$core/sheet';
import { seasonStrip } from '$lib/ui/ref/season';
import { careLine } from '$core/note';

const M = (rows: [number, number, number, number][]) => rows.map(([tmax, tmin, tmean, precipMm]) => ({ tmax, tmin, tmean, precipMm }));
// Rubus parviflorus (7872219), typical spot 49.275, -122.525.
const rubus = M([[4.7, -1.3, 1.9, 185], [6.1, -1, 2.8, 139], [8.5, 0.4, 4.9, 128], [11.5, 2.5, 7.4, 87], [15.4, 6.3, 11, 78], [19.3, 10, 14.2, 70], [22.9, 12.4, 17.3, 39], [23, 12.8, 17.3, 40], [19.4, 10.6, 14.5, 62], [13.4, 6.5, 9.5, 104], [7.4, 1.6, 4.4, 179], [4, -1.6, 1.4, 193]]);
// Colchicum kurdicum, typical spot 38.125, 42.875.
const kurdicum = M([[-5.9, -14.2, -9.5, 142], [-5.3, -13.4, -8.2, 169], [-1.5, -9.2, -4, 201], [4.2, -4.8, 0.9, 211], [11.1, -0.6, 6.4, 120], [18, 5.6, 12.9, 25], [22.9, 10.9, 17.5, 11], [22.9, 10.9, 17.3, 9], [18.1, 6.6, 12.7, 12], [10.4, 0.8, 5.8, 102], [1.8, -6.3, -1.6, 175], [-3.7, -12.2, -7.2, 156]]);
// A Namaqualand-like winter rainfall year with no frost: still a winter growing season.
const namaqua = M([[30, 15, 22, 5], [30, 15, 22, 6], [28, 13, 20, 10], [25, 10, 17, 18], [21, 7, 14, 30], [19, 5, 12, 35], [18, 4, 11, 34], [19, 5, 12, 30], [21, 7, 14, 18], [24, 9, 16, 10], [27, 12, 19, 6], [29, 14, 21, 5]]);

describe('r72f F1: no growing season from a frozen wet season', () => {
  it('Rubus parviflorus: the wet winter has nights below freezing, so no growing season is read', () => {
    const y = growingYear(rubus, 49.3)!;
    expect(y.grow).toBe('winter');
    expect(y.frozen).toBe(true);
    expect(y.frozenMonths).toEqual([1, 2, 12]);
    const sheet = cultivationSheet({ scientific: 'Rubus parviflorus', months: rubus, lat: 49.3 });
    const seasons = sheet.rows.find((r) => r.card === 'Seasons')!;
    expect(seasons.s).not.toMatch(/reads a winter growing season/);
    expect(seasons.s).toMatch(/no growing season/);
    expect(seasons.plain?.lead).toMatch(/no growing season read/);
    expect(seasonStrip(y, rubus, 49.3)?.shadeIs).toBe('the rainy season (no growing season read: nights below freezing)');
  });
  it('Colchicum kurdicum: a wet season at a mean of −4.9 °C is no growing season either', () => {
    const y = growingYear(kurdicum, 38.1)!;
    expect(y.frozen).toBe(true);
    const sheet = cultivationSheet({ scientific: 'Colchicum kurdicum', months: kurdicum, lat: 38.1 });
    expect(sheet.rows.map((r) => `${r.s} ${r.short ?? ''} ${r.plain?.lead ?? ''}`).join(' ')).not.toMatch(/read as a winter growing season|a winter growing season/);
    // The label still says when the rain falls, which is a fact of the habitat, not of the plant.
    expect(careLine({ scientific: 'Colchicum kurdicum', months: kurdicum, lat: 38.1 })).toMatch(/winter rain/);
  });
  it('a winter rainfall year with no frost keeps its winter growing season (guard)', () => {
    const y = growingYear(namaqua, -30)!;
    expect(y.grow).toBe('winter');
    expect(y.frozen).toBe(false);
    expect(seasonStrip(y, namaqua, -30)?.shadeIs).toBe('the rainy season, read as a winter growing season');
  });
});

describe('r72f F1: a summer monsoon keeps its reading', () => {
  it('Echinocereus coccineus: a frosty December at the edge of a summer wet season does not take the summer growing season away (guard)', () => {
    // May to October and December; December's mean nightly low −0.5 °C (the live dossier's median year, rounded).
    const coccineus = M([[12, -2, 5, 15], [14, -1, 6, 14], [18, 2, 10, 15], [22, 5, 13, 12], [27, 10, 18, 22], [32, 15, 23, 25], [32, 17, 24, 70], [30, 16, 23, 75], [28, 13, 20, 45], [23, 7, 15, 30], [16, 1, 8, 16], [12, -0.5, 5, 20]]);
    const y = growingYear(coccineus, 33)!;
    expect(y.grow).toBe('summer');
    expect(y.frozen).toBe(false);
  });
});
