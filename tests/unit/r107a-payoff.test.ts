/**
 * Round 107 (docs/PLAN-107.md; the first hand-off's round 7, the tracker's payoff):
 *
 * - The payoff after "Add one to my plants": one comparison of two figures, each named with its source, no advice: the
 *   space's floor against the habitat's cold floor (NASA POWER), else against the coldest month's mean nightly low
 *   (CHELSA), else the space's light against the open sky (CHELSA), else the space has no floor and the card asks for it.
 * - The backup line asks once, at the tenth plant, with no backup and no sync, until "Not now", a backup or sync.
 * - A town for the frost watch: the words asked bounded, Nominatim's answer read to five places with coordinates in range,
 *   three decimals, and the site's name its first part; the reason said before the browser asks is true of the code.
 *
 * On c92f117: FAILED, every test: payoff.ts and place.ts did not exist, and the backup line asked from the fifth plant.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { payoff, type PayoffIn } from '$lib/ui/grow/payoff';
import { nudgeDue, NUDGE_AT, hideNudge, nudgeHidden, backupReminder } from '$lib/ui/backup-reminder.svelte';
import { placeQuery, readPlaces, nominatimUrl, shortPlace, LOCATION_WHY, PLACE_CREDIT } from '$lib/weather/place';

const base: PayoffIn = { space: 'windowsill', floorC: 15, floorHeld: false, ppfd: null, lightHours: null, coldFloor: { minP01: 4.4, years: 30 }, coldMonth: { tmin: 7.2, month: 'July' }, sky: { lo: 18, hi: 52 }, units: 'metric' };

describe('r107a payoff: one comparison, two figures, each with its source', () => {
  it('the floor against the cold floor', () => {
    const p = payoff(base);
    expect(p.kind).toBe('cold');
    expect(p.text).toBe("Your windowsill: floor 15.0 °C (as you set it), 10.6 °C over this habitat's cold floor, 4.4 °C (one night in a hundred colder, over 30 years, NASA POWER).");
  });
  it('a floor held, under the habitat, in °F', () => {
    const p = payoff({ ...base, floorC: 2, floorHeld: true, units: 'us' });
    expect(p.text).toBe("Your windowsill: held at 35.6 °F (as you set it), 4.3 °F under this habitat's cold floor, 39.9 °F (one night in a hundred colder, over 30 years, NASA POWER).");
  });
  it('the same figure is said as the same', () => {
    expect(payoff({ ...base, floorC: 4.4 }).text).toContain('the same as this habitat');
  });
  it("no cold floor read: the coldest month's mean nightly low, CHELSA", () => {
    const p = payoff({ ...base, coldFloor: null });
    expect(p.kind).toBe('night');
    expect(p.text).toBe("Your windowsill: floor 15.0 °C (as you set it), 7.8 °C over the habitat's coldest-month mean nightly low, 7.2 °C in July (median year, CHELSA).");
  });
  it('no floor, a light: the light against the open sky, the hours said or assumed', () => {
    const p = payoff({ ...base, floorC: null, ppfd: 200 });
    expect(p.kind).toBe('light');
    expect(p.text).toBe('Your windowsill: 9 mol/m²/day (from the light you set, 12 hours assumed); the open sky over the habitat 18–52 mol/m²/day across the year (median year, CHELSA).');
    expect(payoff({ ...base, floorC: null, ppfd: 200, lightHours: 14 }).text).toContain('over 14 hours');
  });
  it('neither figure: the card asks for the floor; no advice in any sentence', () => {
    const p = payoff({ ...base, floorC: null });
    expect(p.kind).toBe('none');
    expect(p.text).toContain('has no floor set');
    for (const x of [base, { ...base, coldFloor: null }, { ...base, floorC: null, ppfd: 300 }]) expect(payoff(x).text).not.toMatch(/\b(should|too cold|too warm|safe|move it|protect)\b/i);
  });
});

describe('r107a the backup line: once, at the tenth plant', () => {
  const at = (plants: number, o: Partial<{ lastBackup: string | null | undefined; synced: boolean; putAway: boolean }> = {}) => nudgeDue({ plants, lastBackup: null, synced: false, putAway: false, ...o });
  it('none at nine, due at ten', () => {
    expect(NUDGE_AT).toBe(10);
    expect(at(5)).toBe(false);
    expect(at(9)).toBe(false);
    expect(at(10)).toBe(true);
    expect(at(40)).toBe(true);
  });
  it('none after a backup, with sync, once put away, or while the last backup is not read yet', () => {
    expect(at(10, { lastBackup: '2026-11-20' })).toBe(false);
    expect(at(10, { synced: true })).toBe(false);
    expect(at(10, { putAway: true })).toBe(false);
    expect(at(10, { lastBackup: undefined })).toBe(false);
  });
  it('"Not now" is kept on the device, not only in the tab, and /about/how names the key', () => {
    const store = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m }; };
    const local = store(), tab = store();
    vi.stubGlobal('localStorage', local);
    vi.stubGlobal('sessionStorage', tab);
    try {
      expect(nudgeHidden()).toBe(false);
      hideNudge();
      expect(local.m.get('cultifolio.backupNudgeDone')).toBe('1');
      // A new tab: its own session storage empty, the page's state fresh; the device's key still puts it away.
      backupReminder.hidden = false;
      vi.stubGlobal('sessionStorage', store());
      expect(nudgeHidden()).toBe(true);
    } finally {
      backupReminder.hidden = false;
      vi.unstubAllGlobals();
    }
    expect(readFileSync('src/routes/about/how/+page.svelte', 'utf8')).toContain('<code>cultifolio.backupNudgeDone</code>');
  });
});

describe('r107a a town for the frost watch', () => {
  it('the words asked: two to 100 characters, spaces made one', () => {
    expect(placeQuery('  Kew   Green ')).toBe('Kew Green');
    expect(placeQuery('K')).toBeNull();
    expect(placeQuery('x'.repeat(101))).toBeNull();
    expect(placeQuery(null)).toBeNull();
  });
  it('Nominatim asked for five, in JSON, in English', () => {
    const u = new URL(nominatimUrl('Kew'));
    expect(u.origin + u.pathname).toBe('https://nominatim.openstreetmap.org/search');
    expect(Object.fromEntries(u.searchParams)).toEqual({ q: 'Kew', format: 'jsonv2', limit: '5', 'accept-language': 'en' });
  });
  it('the answer read: names and coordinates in range, three decimals, at most five, anything else none', () => {
    const body = [
      { display_name: 'Kew, London Borough of Richmond upon Thames, London, England, United Kingdom', lat: '51.4787', lon: '-0.2956' },
      { display_name: 'Nowhere', lat: '91', lon: '0' },
      { lat: '1', lon: '1' },
      ...Array.from({ length: 6 }, (_, i) => ({ display_name: `Kew ${i}`, lat: String(i), lon: String(i) }))
    ];
    const ps = readPlaces(body);
    expect(ps).toHaveLength(5);
    expect(ps[0]).toEqual({ name: 'Kew, London Borough of Richmond upon Thames, London, England, United Kingdom', lat: 51.479, lon: -0.296 });
    expect(shortPlace(ps[0])).toBe('Kew');
    expect(readPlaces({ error: 'x' })).toEqual([]);
  });
  it("the credit OpenStreetMap's licence asks", () => {
    expect(PLACE_CREDIT).toContain('© OpenStreetMap contributors');
    expect(PLACE_CREDIT).toContain('ODbL');
  });
  it('the reason before the browser asks: kept on this device, about a kilometre, to MET Norway (r107b reads it on Today)', () => {
    expect(LOCATION_WHY).toBe('Your location gives the forecast for your nights. It is kept on this device; only its position, rounded to about a kilometre, goes to MET Norway, through this site.');
  });
});
