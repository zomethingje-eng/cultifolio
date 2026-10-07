/**
 * Round sixty-one, agent A: the watering calendar after the grower review's "The .ics, validated" (decision 12). A reminder
 * on the day (VALARM), a series that restarts on the first day after each run of dry months (so the calendar and Today
 * agree), a place dry in every month left out and named, and the dry months in the order the seasons run.
 *
 * The expansion here is a small reader of the file's own lines (DTSTART, RRULE FREQ=DAILY;INTERVAL;UNTIL, EXDATE), so the
 * test checks the days a calendar would show, not only the text.
 */
import { describe, it, expect } from 'vitest';
import { buildIcs, wetRuns, allDry, addDays, DRY_HORIZON_DAYS, type Rhythm } from '$lib/export/ics';
import { calendarOf, rhythmsOf, type RhythmSource } from '$lib/export/rhythms';

const NOW = new Date(Date.UTC(2026, 9, 4, 12, 30, 5));
const unfold = (s: string) => s.replace(/\r\n[ \t]/g, '');
const ymd = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;

/** Every VEVENT's days, as a calendar expands them: DTSTART, then every INTERVAL days up to UNTIL (or `cap`), less EXDATE. */
function expand(ics: string, cap: string): Array<{ uid: string; days: string[]; alarm: string[] }> {
  return unfold(ics).split('BEGIN:VEVENT\r\n').slice(1).map((ev) => {
    const body = ev.split('END:VEVENT')[0];
    const get = (k: string) => body.split('\r\n').find((l) => l.startsWith(k))?.slice(k.length) ?? '';
    const start = ymd(get('DTSTART;VALUE=DATE:'));
    const rule = Object.fromEntries(get('RRULE:').split(';').map((p) => p.split('=')));
    const until = rule.UNTIL ? ymd(rule.UNTIL) : cap;
    const ex = new Set(body.split('\r\n').filter((l) => l.startsWith('EXDATE')).flatMap((l) => l.split(':')[1].split(',')).map(ymd));
    const days: string[] = [];
    for (let d = start; d <= until && d <= cap; d = addDays(d, Number(rule.INTERVAL))) if (!ex.has(d)) days.push(d);
    const alarm = body.includes('BEGIN:VALARM') ? body.slice(body.indexOf('BEGIN:VALARM'), body.indexOf('END:VALARM') + 10).split('\r\n') : [];
    return { uid: get('UID:'), days, alarm };
  });
}

const r: Rhythm = { uid: 'water-place-g@cultifolio', summary: 'Water Greenhouse (every 10 days)', description: '3 growing plants, from Cultifolio.', start: '2026-11-25', every: 10, dry: [12, 1, 2] };

describe('the calendar, round sixty-one', () => {
  it('rings at 09:00 on the day: every event carries a VALARM with a display action, a description and TRIGGER:PT9H', () => {
    const t = buildIcs([r, { ...r, uid: 'water-plant-x@cultifolio', dry: [] }], NOW);
    const evs = expand(t, '2030-01-01');
    expect(evs.length).toBeGreaterThan(1);
    for (const e of evs) expect(e.alarm).toEqual(['BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Water Greenhouse (every 10 days)', 'TRIGGER:PT9H', 'END:VALARM']);
    for (const line of t.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });

  it('restarts the series on the first day after each run of dry months, the day Today lists the place again', () => {
    const t = buildIcs([r], NOW);
    const evs = expand(t, '2030-01-01');
    // Three runs in two years: 25 to 30 Nov 2026, Mar to Nov 2027, Mar 2028 to the horizon.
    expect(evs.map((e) => e.days[0])).toEqual(['2026-11-25', '2027-03-01', '2028-03-01']);
    const all = evs.flatMap((e) => e.days);
    expect(all.some((d) => [12, 1, 2].includes(Number(d.slice(5, 7))))).toBe(false);
    expect(all).toContain('2027-03-11');
    expect(all.at(-1)! <= addDays(r.start, DRY_HORIZON_DAYS)).toBe(true);
    // each series its own event: the first keeps the rhythm's UID, the later ones are marked by their first day
    expect(evs.map((e) => e.uid)).toEqual(['water-place-g@cultifolio', 'water-place-g-from-20270301@cultifolio', 'water-place-g-from-20280301@cultifolio']);
    expect(t).not.toContain('EXDATE');
    const text = unfold(t).replace(/\\([,;\\])/g, '$1'); // TEXT unescaped
    expect(text).toMatch(/This series ends on 2026-11-30, before the months kept dry; the next starts after them\./);
    expect(text).toMatch(/The repeats stop on \d{4}-\d{2}-\d{2}; download the calendar again before then\./);
  });

  it('starts at the first watered day when the first due day falls in the dry months', () => {
    const runs = wetRuns({ ...r, start: '2026-12-20' });
    expect(runs[0]).toEqual({ from: '2027-03-01', to: '2027-11-30' });
    const runs2 = wetRuns({ ...r, start: '2026-06-01', dry: [6] });
    expect(runs2[0].from).toBe('2026-07-01');
  });

  it('a rhythm with no dry months is one event with no end, as before', () => {
    const t = unfold(buildIcs([{ ...r, dry: [] }], NOW));
    expect(t.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(t).toContain('\r\nRRULE:FREQ=DAILY;INTERVAL=10\r\n');
  });

  it('leaves out a place kept dry in every month, and names it', () => {
    expect(allDry({ dry: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] })).toBe(true);
    expect(allDry({ dry: [1, 2, 3] })).toBe(false);
    const src: RhythmSource = {
      today: '2026-10-04',
      plants: [
        { id: 'a', no: '2026-0001', name: 'Lithops lesliei', placeId: 'shed', ownDays: null },
        { id: 'b', no: '2026-0002', name: 'Copiapoa cinerea', placeId: 'b1', ownDays: null }
      ],
      placeName: (id) => ({ shed: 'Cold shed', b1: 'Bench 1' })[id] ?? id,
      rule: (id) => (id === 'shed' ? { every: 14, dry: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] } : { every: 10, dry: [12, 1, 2] }),
      from: () => '2026-09-30'
    };
    const c = calendarOf(src, NOW);
    expect(c.leftOut).toEqual(['Cold shed']);
    expect(c.text).not.toContain('Cold shed');
    expect(c.events).toBe(3); // Bench 1's three runs
    expect(c.events).toBe((c.text.match(/BEGIN:VEVENT/g) ?? []).length);
  });

  it('says the dry months in the order the seasons run, as the place page does', () => {
    const src: RhythmSource = { today: '2026-10-04', plants: [{ id: 'b', no: '2026-0002', name: 'Copiapoa cinerea', placeId: 'b1', ownDays: null }], placeName: () => 'Bench 1', rule: () => ({ every: 10, dry: [1, 2, 12] }), from: () => '2026-09-30' };
    expect(rhythmsOf(src)[0].description).toMatch(/Not in the months kept dry: Dec to Feb\./);
  });
});
