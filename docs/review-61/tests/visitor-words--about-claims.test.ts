/**
 * Visitor and words review of round sixty-one: sentences on /about/formats, /about/how and the labels page that the code
 * does not keep. To live in tests/unit/. Run from the repository root:
 *
 *   npx vitest run tests/unit/visitor-words--about-claims.test.ts
 *
 * Status on f4ab4f8: FAILS (reproductions). Expected on f4ab4f8: tests 1, 2, 3, 4, 5 and 6 fail; test 7 passes (a guard
 * for the label line's names, which documents what the label prints today).
 * Each test says what is wrong in its name; once the page or the code is put right, each one passes and stays as a guard.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { hlcPast, isPastStamp } from '$core/hlc';
import { isHeld, isParked } from '$core/log';
import { photoDue } from '$lib/ui/photo-due';
import { careLine } from '$core/note';

const text = (f: string) => readFileSync(f, 'utf8').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
const how = text('src/routes/about/how/+page.svelte');
const formats = text('src/routes/about/formats/+page.svelte');

describe('about pages against the code (visitor-words review, round 61)', () => {
  it('1. formats says the HLC counter has six digits only past 65,535 changes in a millisecond, but every edit stamped past another has six', () => {
    const past = hlcPast('1789520000000-0001-a7f3c2c9d1e4x0z9', 'b8e1d0c2f3a4y1z2');
    const counter = past.split('-')[1];
    expect(isPastStamp(past)).toBe(true);
    expect(counter).toBe('800002'); // six digits, from the second change of the millisecond
    // The page may say six digits only for >65,535 changes in a millisecond if no ordinary edit writes six.
    const claimsOnlyPastFfff = /up to six, only when a millisecond holds more than 65,535 changes/.test(formats);
    expect(claimsOnlyPastFfff && counter.length === 6).toBe(false);
  });

  it("2. formats says a change of this device's not yet sent is held, but the code neither holds nor parks it", () => {
    const now = Date.UTC(2026, 9, 7);
    const dev = 'a7f3c2c9d1e4';
    const ownFar = `${now + 3 * 86_400_000}-0000-${dev}x0z9`; // this device, three days ahead, never sent: no arrival
    const hold = { now, except: dev, clockChecked: true };
    expect(isHeld(ownFar, hold)).toBe(false);
    expect(isParked(ownFar, hold)).toBe(false);
    // So the sentence "a change with no arrival to judge it by (one read from a file, or not yet sent) is held, or ...
    // parked for that load only" is false for the change it names second.
    expect(formats).not.toMatch(/one read from a file, or not yet sent\) is held/);
  });

  it('3. /about/how says 172 collector genera; scripts/specialist-genera.txt lists another number', () => {
    const n = readFileSync('scripts/specialist-genera.txt', 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).length;
    const said = Number(/of (\d+) collector genera/.exec(how)?.[1]);
    expect(said).toBe(n);
  });

  it("4. /about/how's short list says the edge keeps two public answers; its full detail lists three", () => {
    expect(how).toMatch(/a species address the backbone was asked about for a day/); // the full detail's third
    expect(how).not.toMatch(/keeps copies of two public answers/);
  });

  it('5. the labels page says "One care line say"', () => {
    const labels = readFileSync('src/routes/labels/+page.svelte', 'utf8');
    expect(labels).not.toMatch(/'One care line' : `\$\{stillPending\.length\} care lines`\} say /);
  });

  it('6. the photo rule counts a plant acquired "2026" as six months old in October 2026 (a guess the formats page does not state)', () => {
    const src = { photos: () => [], madeOn: () => '2026-09-30' };
    const days = { yearAgo: '2025-10-07', halfYearAgo: '2026-04-07' };
    // Acquired some time in 2026, record made last week: the rule cannot know it has had six months.
    expect(photoDue({ id: 'r1', status: 'growing', acquired: '2026' }, src, days)).toBe(false);
    expect(photoDue({ id: 'r1', status: 'growing', acquired: '2026-04' }, src, days)).toBe(false);
  });

  it('7. guard: the label line names its figures as "hab. night" and "sky", not as the round\'s figure names', () => {
    const months = Array.from({ length: 12 }, (_, i) => ({ tmax: 20 - Math.abs(6 - i), tmin: 10 - Math.abs(6 - i), precipMm: 6, dli: 30 + i }));
    const line = careLine({ scientific: 'Copiapoa cinerea', family: 'Cactaceae', climateStatus: 'ok', months, extremes: { minAbs: 4, minP01: 6.5, maxP99: 29, years: 40, frostDaysPerYear: 0 }, lat: -26 } as never);
    expect(line).toMatch(/hab\. night 6\.5 °C/);
    expect(line).toMatch(/sky 30–41 DLI/);
  });
});
