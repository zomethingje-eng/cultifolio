/**
 * Round eighty-two, the independent review's 18: the frost bar under the top bar was red on every page for a night nine
 * days out ("Cold night ahead: 36.3 °F around 07:00 Sunday… (2026-11-01 in the table)" on 2026-10-23), and 36.3 °F is
 * not frost. Now the bar carries a night within 72 hours of the forecast, or one below the cold floor of a space of the
 * grower's (not a heater's set-point, not indoors, under the site's forecast), with its date in words, red only at or
 * below freezing. And review 2's 4: a batch of cuttings was announced "First seedlings up".
 * On r82base `frost.bar` and `nightWords` did not exist, the line was red whatever the night, and every batch's first
 * count was "First seedlings up".
 */
import { describe, it, expect } from 'vitest';
import { frost, nightWords, NEAR_H } from '$lib/ui/frost.svelte';
import { firstUpWords } from '$lib/ui/grow/firsts';

const day = (date: string, tmin: number, hour = '11:00') => ({ date, tmin, tmax: tmin + 8, precipMm: 0, steps: 24, tminAt: `${date}T${hour}:00Z` });
const at = (fetched: string, days: ReturnType<typeof day>[], risk: { level: string; text: string }) => {
  const firstFrost = days.find((d) => d.tmin <= 0)?.date;
  const firstCold = days.find((d) => d.tmin <= 3)?.date;
  frost.unchecked = null;
  frost.risk = risk;
  frost.nights = { fetched, offsetH: -5, days, firstFrost, firstCold };
};

describe('the frost bar (the independent review\'s 18)', () => {
  it('a cold night above freezing nine days out: amber on the front page, dated, and no bar', () => {
    at('2026-10-23T12:00:00Z', [day('2026-10-24', 8), day('2026-10-28', 6), day('2026-11-01', 2.4)], { level: 'cold', text: 'Cold night ahead: 2.4 °C around 07:00 Sunday, your time (2026-11-01 in the table, MET Norway).' });
    const l = frost.line!;
    expect(l.tone).toBe('warn');
    expect(l.near).toBe(false);
    expect(l.text).toContain('(Sunday 1 November, 2026-11-01 in the table, MET Norway)');
    expect(frost.bar([])).toBeNull();
  });
  it('a frost within 72 hours: red, and on the bar', () => {
    at('2026-10-23T12:00:00Z', [day('2026-10-24', 3), day('2026-10-25', -1.5)], { level: 'frost', text: 'Frost forecast: -1.5 °C around 06:00 Sunday solar time (2026-10-25, MET Norway).' });
    const b = frost.bar([])!;
    expect(b.tone).toBe('bad');
    expect(b.near).toBe(true);
    expect(b.text).toBe('Frost forecast: -1.5 °C around 06:00 Sunday solar time (Sunday 25 October, 2026-10-25, MET Norway).');
  });
  it('a cold night within 72 hours: on the bar, amber', () => {
    at('2026-10-23T12:00:00Z', [day('2026-10-24', 2.1)], { level: 'cold', text: 'Cold night ahead: 2.1 °C around 06:00 Saturday solar time (2026-10-24, MET Norway).' });
    expect(frost.bar([])).toMatchObject({ tone: 'warn', near: true });
  });
  it('a frost beyond 72 hours: not on the bar, unless it falls below a space\'s floor, said with the space and the date', () => {
    at('2026-10-23T12:00:00Z', [day('2026-10-24', 9), day('2026-10-30', -2)], { level: 'frost', text: 'Frost forecast: -2.0 °C around 06:00 Friday solar time (2026-10-30, MET Norway).' });
    expect(frost.line).toMatchObject({ tone: 'bad', near: false });
    expect(frost.bar([])).toBeNull();
    const b = frost.bar([{ name: 'Cold frame', floorC: 4 }])!;
    expect(b.tone).toBe('bad');
    expect(b.text).toBe("Forecast below Cold frame's 4.0 °C floor: -2.0 °C outside (Friday 30 October, 2026-10-30 in the table, MET Norway).");
  });
  it('a night above freezing below a space\'s floor, days out: on the bar, amber, the first such night', () => {
    at('2026-10-23T12:00:00Z', [day('2026-10-24', 12), day('2026-10-29', 6.5), day('2026-10-31', 5)], { level: 'none', text: 'No frost in the next 216 hours of forecast; coldest 5.0 °C around 07:00 Saturday solar time (MET Norway).' });
    expect(frost.line).toBeNull();
    expect(frost.bar([{ name: 'Greenhouse', floorC: 7 }])).toMatchObject({ tone: 'warn', text: expect.stringContaining("Greenhouse's 7.0 °C floor: 6.5 °C outside (Thursday 29 October") });
    expect(frost.bar([{ name: 'Greenhouse', floorC: 4 }])).toBeNull();
  });
  it('an alert of the National Weather Service in force: red and on the bar, as it is said', () => {
    at('2026-10-23T12:00:00Z', [day('2026-10-24', 9)], { level: 'warning', text: 'Freeze Warning in force until 2026-10-24 09:00 (NOAA/NWS).' });
    expect(frost.bar([])).toEqual({ tone: 'bad', near: true, text: 'Freeze Warning in force until 2026-10-24 09:00 (NOAA/NWS).' });
  });
  it('a refusal is on the front page, never on the bar', () => {
    frost.risk = null;
    frost.unchecked = 'Frost not checked: the forecast service did not answer.';
    expect(frost.line).toMatchObject({ tone: 'warn' });
    expect(frost.bar([{ name: 'Greenhouse', floorC: 7 }])).toBeNull();
    frost.unchecked = null;
  });
  it('the dates and the window', () => {
    expect(NEAR_H).toBe(72);
    expect(nightWords('2026-11-01')).toBe('Sunday 1 November');
    expect(nightWords('2027-01-01')).toBe('Friday 1 January');
  });
});

describe('a batch\'s first count, by its method (review 2\'s 4)', () => {
  it('seed comes up; the rest strike', () => {
    expect(firstUpWords('seed')).toBe('First seedlings up');
    expect(firstUpWords('cutting')).toBe('First cuttings struck');
    expect(firstUpWords('leaf')).toBe('First leaf cuttings struck');
    expect(firstUpWords('offset')).toBe('First offsets struck');
    expect(firstUpWords('graft')).toBe('First grafts struck');
    expect(firstUpWords('tissue')).toBe('First count');
  });
});
