/**
 * Round 127 (SPECIES 20, the lens's views that read the reader's spaces; docs/REVIEW-ROUND-127.md): Greenhouse,
 * Windowsill and Under lights, and which view opens, on Welwitschia mirabilis's page data (k339841, the fixture of round
 * 114) and the hand-off's figures.
 *
 * - Greenhouse held at 5.0 °C: 0.5 °C under the cold floor (5.5 °C), 7.5 °C under the coolest month's nights (12.5 °C).
 * - Windowsill at 16,000 lux over 8 hours, nights 15 °C: 296 µmol/m²/s, 8.5 mol a day, 28% of the darkest month (30.4)
 *   and 16% of the brightest (53.3); 2.5 °C warmer than the coolest month's nights.
 * - Under lights: 176, 151, 132; 352, 302, 264; 528, 452, 396; 704, 603, 528.
 * - The view that opens: a plant in a Greenhouse; plants in two kinds of space; no plant and a last-used view; neither.
 * - No sentence matches the forbidden words (kept here, as the hand-off asks).
 *
 * On 1486d7c: FAILED (no $climate/lens-spaces).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { greenhouseLines, windowsillLines, lampTable, lightsLines, lampCell, luxToPpfd, openingView, viewOfKind } from '../../src/lib/climate/lens-spaces';
import { dayLengths } from '../../src/lib/climate/day-length';

const F = JSON.parse(readFileSync('tests/unit/fixtures/r114a-k339841.json', 'utf8'));
const habitat = F.climate.months as Array<{ tmax: number; tmin: number; dli: number }>;
const floorC = F.climate.extremes.minP01 as number;
const fmt = { temp: (c: number) => `${c.toFixed(1)} °C`, dtemp: (c: number) => `${c.toFixed(1)} °C` };
const FORBIDDEN = /\b(will|should|needs?|wants?|tolerates?|survive|die|safe)\b/i;

describe('the lens on the reader\'s spaces', () => {
  it('Greenhouse held at 5.0 °C: 0.5 °C under its cold floor (5.5 °C), 7.5 °C under its coolest nights (12.5 °C)', () => {
    const l = greenhouseLines({ heldC: 5, held: true, floorC, habitat, ...fmt });
    expect(l.find((x) => x.k === 'floor')!.text).toBe('Held at 5.0 °C: 0.5 °C under its cold floor (5.5 °C).');
    expect(l.find((x) => x.k === 'nights')!.text).toBe("Held at 5.0 °C: 7.5 °C under its coolest month's average night (12.5 °C).");
    expect(greenhouseLines({ heldC: 5.5, held: false, floorC, habitat, ...fmt })[0].text).toBe('Its coldest 5.5 °C: at its cold floor (5.5 °C).');
    expect(greenhouseLines({ heldC: 8, held: true, floorC: null, habitat, ...fmt }).map((x) => x.k)).toEqual(['nights']); // no floor: its line not drawn
  });
  it('Windowsill at 16,000 lux over 8 h, nights 15 °C: 296 µmol/m²/s, 8.5 mol a day, 28% and 16%, 2.5 °C warmer', () => {
    const ppfd = luxToPpfd(16000);
    expect(ppfd).toBe(296);
    const l = windowsillLines({ ppfd, hours: 8, nightC: 15, habitat, ...fmt });
    expect(l[0].text).toBe('296 µmol/m²/s for 8 h is 8.5 mol a day: 28% of its darkest month (30.4) and 16% of its brightest (53.3).');
    expect(l[1].text).toBe("Your winter night, 15.0 °C: 2.5 °C warmer than its coolest month's average night (12.5 °C).");
    expect(windowsillLines({ ppfd: null, hours: 8, nightC: null, habitat, ...fmt })).toEqual([]); // inputs missing: no figure
  });
  it('Under lights: the table for 25 to 100% of the darkest month at 12, 14 and 16 h, the year\'s mean last', () => {
    const t = lampTable(habitat)!;
    expect(t.rows.slice(0, 4).map((r) => r.cells)).toEqual([[176, 151, 132], [352, 302, 264], [528, 452, 396], [704, 603, 528]]);
    expect(t.rows[4].label).toBe("The year's mean");
    expect(t.rows[4].cells).toEqual([980, 840, 735]); // 42.3 mol a day: the figure the page showed as "Grow light"
    expect(lampCell(t, 300, 14)).toEqual([1, 1]);
    expect(lampCell(t, 300, 13)).toBeNull();
    const l = lightsLines({ ppfd: 300, hours: 14, habitat, days: dayLengths(-20.5), ...fmt });
    expect(l[0].text).toBe('Your lamp, 300 µmol/m²/s for 14 h, is 15.1 mol a day: 50% of its darkest month (30.4).');
    expect(l[1].text).toMatch(/^Its day length runs 10\.9 to 13\.4 h through the year, and its nights average 13\.5 °C cooler than its days\.$/);
  });
  it('a space\'s kind chooses its view; a room with a lamp is under lights, without one a windowsill', () => {
    expect(viewOfKind('garden', null)).toBe('outdoors');
    expect(viewOfKind('coldframe', null)).toBe('greenhouse');
    expect(viewOfKind('windowsill', 14)).toBe('windowsill');
    expect(viewOfKind('shelf', 14)).toBe('lights');
    expect(viewOfKind('shelf', null)).toBe('windowsill');
    expect(viewOfKind(null, null)).toBeNull();
  });
  it('which view opens: the plant\'s space, the one written last of several, else the view used last, else Nothing', () => {
    const gh = { kind: 'greenhouse', lampHours: null }, sh = { kind: 'shelf', lampHours: 14 };
    expect(openingView([{ space: gh, latest: '2026-11-01' }], 'windowsill')).toMatchObject({ view: 'greenhouse', from: 'plant' });
    expect(openingView([{ space: gh, latest: '2026-10-01' }, { space: sh, latest: '2026-11-20' }], null)).toMatchObject({ view: 'lights', index: 1 });
    expect(openingView([], 'windowsill')).toMatchObject({ view: 'windowsill', from: 'last' });
    expect(openingView([{ space: null, latest: '2026-11-01' }], 'nonsense')).toMatchObject({ view: 'none', from: 'none' });
    expect(openingView([], null).view).toBe('none');
  });
  it('no line in any view says what the plant will do', () => {
    const all = [
      ...greenhouseLines({ heldC: 5, held: true, floorC, habitat, ...fmt }), ...greenhouseLines({ heldC: 14, held: false, floorC, habitat, ...fmt }),
      ...windowsillLines({ ppfd: 296, hours: 8, nightC: 15, habitat, ...fmt }), ...windowsillLines({ ppfd: 900, hours: 16, nightC: 4, habitat, ...fmt }),
      ...lightsLines({ ppfd: 300, hours: 14, habitat, days: dayLengths(-20.5), ...fmt })
    ];
    for (const l of all) expect(l.text).not.toMatch(FORBIDDEN);
  });
});
