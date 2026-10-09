/**
 * Round sixty-two, agent A: the calendar file downloaded again (the outside review's A27, still open from round
 * forty-three's 36; the grower review, 11). A rhythm that is not a whole number of days from 1 to 365 is written at the
 * default (INTERVAL=7.5 made a calendar refuse the whole file); every event has a SEQUENCE that grows with the download;
 * every UID carries the collection's tag; a series after a dry season has the same UID however the file is downloaded; one
 * last event says to download the file again; and a one-day rhythm is "every day".
 *
 * Reproductions (fail on the base): every test but the last guard.
 */
import { describe, it, expect } from 'vitest';
import { buildIcs, wholeDays, DEFAULT_EVERY, sequenceAt, seasonStart, type Rhythm } from '$lib/export/ics';
import { calendarOf, rhythmsOf, type RhythmSource } from '$lib/export/rhythms';
import { everyWords } from '$lib/ui/today-words';

const unfold = (s: string) => s.replace(/\r\n[ \t]/g, '');
const events = (ics: string) => unfold(ics).split('BEGIN:VEVENT\r\n').slice(1).map((ev) => {
  const lines = ev.split('END:VEVENT')[0].split('\r\n');
  const get = (k: string) => lines.find((l) => l.startsWith(k))?.slice(k.length) ?? '';
  return { uid: get('UID:'), seq: get('SEQUENCE:'), start: get('DTSTART;VALUE=DATE:'), rrule: get('RRULE:'), summary: get('SUMMARY:'), description: get('DESCRIPTION:').replace(/\\([,;\\])/g, '$1') };
});
const src = (over: Partial<RhythmSource> = {}): RhythmSource => ({
  today: '2026-10-04',
  collection: 'k3x9',
  plants: [
    { id: 'a', no: '2026-0001', name: 'Copiapoa cinerea', placeId: 'gh', ownDays: null },
    { id: 'b', no: '2026-0002', name: 'Lithops lesliei', placeId: null, ownDays: null },
    { id: 'c', no: '2026-0003', name: 'Aloe vera', placeId: 'gh', ownDays: 7.5 }
  ],
  placeName: (id) => ({ gh: 'Greenhouse' })[id] ?? id,
  rule: (id) => (id === 'gh' ? { every: 10, dry: [12, 1, 2] } : { every: 21, dry: [] }),
  from: () => '2026-09-30',
  ...over
});

describe('a rhythm the calendar can write (A27)', () => {
  it('a whole number from 1 to 365, else the fallback', () => {
    expect([wholeDays(7, 21), wholeDays(1, 21), wholeDays(365, 21)]).toEqual([7, 1, 365]);
    expect([wholeDays(7.5, 21), wholeDays(0, 21), wholeDays(-3, 21), wholeDays(366, 21), wholeDays(NaN, 21), wholeDays('7', 21), wholeDays(null, 21)]).toEqual([21, 21, 21, 21, 21, 21, 21]);
  });
  it('a fractional rhythm never reaches the file: a place\'s is written at the default, a plant\'s follows its place', () => {
    const t = calendarOf(src({ rule: (id) => (id === 'gh' ? { every: 10, dry: [] } : { every: 7.5, dry: [] }) }), new Date(Date.UTC(2026, 9, 4))).text;
    expect(t).not.toMatch(/INTERVAL=\d+\.\d/);
    for (const m of t.matchAll(/INTERVAL=(\d+)/g)) expect(Number.isInteger(Number(m[1]))).toBe(true);
    const evs = events(t);
    expect(evs.find((e) => e.uid.startsWith('water-place-none'))!.rrule).toContain(`INTERVAL=${DEFAULT_EVERY}`);
    expect(evs.some((e) => e.uid.startsWith('water-plant-c'))).toBe(false); // 7.5 is no rhythm of its own: the plant is on its place's
  });
  it('buildIcs guards too: a rhythm given as 7.5 is written at the default', () => {
    const r: Rhythm = { uid: 'x@cultifolio', summary: 'Water x', description: '', start: '2026-10-10', every: 7.5, dry: [] };
    expect(unfold(buildIcs([r]))).toContain(`RRULE:FREQ=DAILY;INTERVAL=${DEFAULT_EVERY}\r\n`);
  });
  it('the default is the collection\'s own', async () => {
    const { DUE_DAYS } = await import('$lib/db/collection.svelte');
    expect(DEFAULT_EVERY).toBe(DUE_DAYS);
  });
});

describe('downloaded again, the events are the same events (A27)', () => {
  const first = calendarOf(src(), new Date(Date.UTC(2026, 9, 4, 12))).text;
  const later = calendarOf(src({ today: '2027-04-10', from: () => '2027-04-01' }), new Date(Date.UTC(2027, 3, 10, 12))).text;
  it('every event carries a SEQUENCE, higher in a later download', () => {
    const a = events(first), b = events(later);
    for (const e of [...a, ...b]) expect(e.seq).toMatch(/^\d+$/);
    expect(Number(b[0].seq)).toBeGreaterThan(Number(a[0].seq));
    expect(sequenceAt(new Date(Date.UTC(2026, 0, 1)))).toBe(0);
  });
  it('every UID carries the collection\'s tag, so two collections never share "water-place-none"', () => {
    for (const e of events(first)) expect(e.uid).toContain('k3x9');
    const other = events(calendarOf(src({ collection: 'zz77' }), new Date(Date.UTC(2026, 9, 4))).text);
    expect(new Set(other.map((e) => e.uid)).size).toBe(other.length);
    for (const e of other) expect(events(first).map((x) => x.uid)).not.toContain(e.uid);
  });
  it('a series after a dry season has the same UID whichever download made it (the March series is never the plain UID)', () => {
    const uidOf = (t: string, start: string) => events(t).find((e) => e.start === start)?.uid;
    // October 2026's file: the autumn series, then March 2027's and March 2028's. April 2027's file starts mid-season.
    const march27 = uidOf(first, '20270301');
    expect(march27).toBe('water-place-gh.k3x9-from-20270301@cultifolio');
    const later27 = events(later).find((e) => e.uid.startsWith('water-place-gh'))!;
    expect(later27.start).toBe('20270411'); // its next due day (watered 1 April, every 10 days), mid-season
    expect(later27.uid).toBe(march27); // the same series as the earlier file's, so it replaces it
    expect(uidOf(later, '20280301')).toBe(uidOf(first, '20280301'));
    expect(seasonStart({ dry: [12, 1, 2] }, '2026-11-25')).toBe('2026-03-01');
  });
  it('the last event in the file says to download it again, on the day the first series stops', () => {
    const evs = events(first);
    const again = evs.at(-1)!;
    expect(again.uid).toBe('download-again.k3x9@cultifolio');
    expect(again.summary).toBe('Cultifolio: download the watering calendar again');
    expect(again.rrule).toBe('');
    // Greenhouse is the one rhythm with dry months: its last series stops first (the other repeats with no end).
    const stops = evs.filter((e) => /UNTIL=/.test(e.rrule)).map((e) => /UNTIL=(\d{8})/.exec(e.rrule)![1]).sort().at(-1);
    expect(again.start).toBe(stops);
    expect(again.description).toMatch(/Download the calendar again/);
    expect(calendarOf(src(), new Date(Date.UTC(2026, 9, 4))).events).toBe(evs.length - 1); // the page counts the repeating events only
  });
  it('a file whose rhythms never stop has no such event', () => {
    expect(calendarOf(src({ rule: () => ({ every: 10, dry: [] }) }), new Date(Date.UTC(2026, 9, 4))).text).not.toContain('download-again');
  });
});

describe('"every day" for a one-day rhythm (the grower review, 11)', () => {
  it('says every day, never every 1 days', () => {
    expect(everyWords(1)).toBe('every day');
    expect(everyWords(10)).toBe('every 10 days');
    const rs = rhythmsOf(src({ plants: [{ id: 'a', no: '2026-0001', name: 'Copiapoa cinerea', placeId: 'gh', ownDays: 1 }] }));
    expect(rs[0].summary).toBe('Water 2026-0001 Copiapoa cinerea (every day)');
    expect(rs[0].summary).not.toContain('every 1 days');
  });
});
