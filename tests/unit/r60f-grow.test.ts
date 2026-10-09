/**
 * Round sixty, agent F: the grower features' readings, each made on the device. The watering calendar (RFC 5545: CRLF,
 * folding at 75 octets without splitting a character, TEXT escaping, the repeat rule and the dry months), the label's
 * fragment, prices read only when they are plain numbers, firsts read from the log, iOS told by its features.
 */
import { describe, it, expect } from 'vitest';
import { buildIcs, foldLine, escapeText, wetRuns, addDays, DRY_HORIZON_DAYS, type Rhythm } from '$lib/export/ics';
import { rhythmsOf, type RhythmSource } from '$lib/export/rhythms';
import { plantQrUrl, labelFromHash, speciesFromHash, QR_NAME_MAX } from '$lib/ui/grow/qr';
import { readPrice, spendOf, spendWords, amountWords } from '$lib/ui/grow/spend';
import { firstsOf } from '$lib/ui/grow/firsts';
import { isIos, iosInBrowser } from '$lib/ui/grow/ios';
import { readWanted, writeWanted } from '$lib/ui/grow/wanted';
import type { PlantEvent } from '$lib/db/types';

const NOW = new Date(Date.UTC(2026, 9, 4, 12, 30, 5));
const octets = (s: string) => new TextEncoder().encode(s).length;
/** RFC 5545 §3.1 unfolding: a CRLF followed by one space or tab is removed. */
const unfold = (s: string) => s.replace(/\r\n[ \t]/g, '');

describe('the watering calendar file', () => {
  const r: Rhythm = { uid: 'water-place-g@cultifolio', summary: 'Water Greenhouse › Bench 1 (every 10 days)', description: '3 growing plants, from Cultifolio.', start: '2026-10-06', every: 10, dry: [] };
  it('ends every line with CRLF, has no bare LF, and wraps one VEVENT per rhythm in a VCALENDAR', () => {
    const t = buildIcs([r, { ...r, uid: 'b' }], NOW);
    expect(t.endsWith('\r\n')).toBe(true);
    expect(/[^\r]\n/.test(t)).toBe(false);
    const lines = t.split('\r\n');
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines).toContain('VERSION:2.0');
    expect(lines.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(2);
    expect(lines.at(-2)).toBe('END:VCALENDAR');
  });
  it('writes an all-day event repeating every n days from its first due day, with no end when no month is dry', () => {
    const t = unfold(buildIcs([r], NOW));
    expect(t).toContain('\r\nDTSTART;VALUE=DATE:20261006\r\n');
    expect(t).toContain('\r\nDTEND;VALUE=DATE:20261007\r\n');
    expect(t).toContain('\r\nRRULE:FREQ=DAILY;INTERVAL=10\r\n');
    expect(t).toContain('\r\nDTSTAMP:20261004T123005Z\r\n');
    expect(t).toContain('\r\nUID:water-place-g@cultifolio\r\n');
    expect(t).not.toContain('EXDATE');
  });
  // Round sixty-one: a series per run of watered months, restarting on the first day after the dry months, in place of
  // one cadence with its dry repeats excepted (the grower review, "The .ics, validated"); r61a-calendar.test.ts has the rest.
  it('leaves out the dry months, ends the last series at the horizon, and says so', () => {
    const dry = { ...r, start: '2026-11-25', dry: [12, 1, 2] };
    const t = unfold(buildIcs([dry], NOW));
    const until = addDays('2026-11-25', DRY_HORIZON_DAYS).replaceAll('-', '');
    expect(t).toContain(`RRULE:FREQ=DAILY;INTERVAL=10;UNTIL=${until}`);
    expect(t).toContain('RRULE:FREQ=DAILY;INTERVAL=10;UNTIL=20261130'); // November is not dry; the first series stops before December
    expect(t).toContain('DTSTART;VALUE=DATE:20270301'); // and the next starts on the first day after the dry months
    expect(t).not.toContain('EXDATE');
    expect(wetRuns(dry).every((w) => !['12', '01', '02'].includes(w.from.slice(5, 7)) && !['12', '01', '02'].includes(w.to.slice(5, 7)))).toBe(true);
    expect(t).toMatch(/DESCRIPTION:.*download the calendar again/);
  });
  it('escapes backslash, semicolon, comma and line breaks in text', () => {
    expect(escapeText('a\\b; c, d\ne\r\nf')).toBe('a\\\\b\\; c\\, d\\ne\\nf');
    const t = unfold(buildIcs([{ ...r, summary: 'Water Bench 1, left; top\nshelf' }], NOW));
    expect(t).toContain('\r\nSUMMARY:Water Bench 1\\, left\\; top\\nshelf\r\n');
  });
  it('folds lines longer than 75 octets, never splitting a UTF-8 character, and unfolds to the same line', () => {
    const long = 'DESCRIPTION:' + 'Ünïcödé › plants '.repeat(20);
    const f = foldLine(long);
    for (const l of f.split('\r\n')) expect(octets(l)).toBeLessThanOrEqual(75);
    expect(f.split('\r\n').slice(1).every((l) => l.startsWith(' '))).toBe(true);
    expect(unfold(f)).toBe(long);
    expect(foldLine('SHORT:line')).toBe('SHORT:line');
    const t = buildIcs([{ ...r, summary: 'Water ' + '日本の温室'.repeat(20) }], NOW);
    for (const l of t.split('\r\n')) expect(octets(l)).toBeLessThanOrEqual(75);
  });
  it('makes one rhythm per place and one per plant with its own, starting at the earliest next due day, today when past', () => {
    const src: RhythmSource = {
      today: '2026-10-04',
      plants: [
        { id: 'a', no: '2026-0001', name: 'Copiapoa cinerea', placeId: 'b1', ownDays: null },
        { id: 'b', no: '2026-0002', name: 'Copiapoa humilis', placeId: 'b1', ownDays: null },
        { id: 'c', no: '2026-0003', name: 'Lithops lesliei', placeId: 'b1', ownDays: 28 },
        { id: 'd', no: '2026-0004', name: 'Aloe polyphylla', placeId: null, ownDays: null }
      ],
      placeName: (id) => (id === 'b1' ? 'Bench 1' : id),
      rule: (id) => (id === 'b1' ? { every: 10, dry: [1] } : { every: 21, dry: [] }),
      from: (id) => ({ a: '2026-09-30', b: '2026-09-28', c: '2026-09-20', d: '2026-08-01' })[id]!,
      };
    const got = rhythmsOf(src);
    expect(got.map((x) => [x.summary, x.start, x.every, x.dry])).toEqual([
      ['Water 2026-0003 Lithops lesliei (every 28 days)', '2026-10-18', 28, [1]],
      ['Water Bench 1 (every 10 days)', '2026-10-08', 10, [1]],
      ['Water plants with no place (every 21 days)', '2026-10-04', 21, []]
    ]);
    expect(got[1].description).toMatch(/2 growing plants.*Not in the months kept dry: Jan\./);
  });
});

describe("a label's code", () => {
  it('carries the species and the printed name in the fragment, which is never sent to the server', () => {
    const u = plantQrUrl('https://cultifolio.example', { id: 'r123', taxonName: 'Haworthia truncata', cultivar: 'Lime Green', nameKind: 'cultivar' });
    expect(u).toBe("https://cultifolio.example/plants/r123#s=haworthia-truncata&n=Haworthia%20truncata%20'Lime%20Green'");
    expect(new URL(u).pathname).toBe('/plants/r123');
    expect(labelFromHash(new URL(u).hash)).toEqual({ slug: 'haworthia-truncata', name: "Haworthia truncata 'Lime Green'" });
  });
  it('gives a cross its name and no species, since a cross has no species page', () => {
    const u = plantQrUrl('https://x', { id: 'r1', taxonName: 'Ariocarpus', cultivar: null, nameKind: 'hybrid' });
    expect(labelFromHash(new URL(u).hash)).toEqual({ slug: null, name: 'Ariocarpus' });
  });
  it('keeps the code short: the name is cut', () => {
    const u = plantQrUrl('https://x', { id: 'r1', taxonName: 'Gymnocalycium ' + 'a'.repeat(200), cultivar: null, nameKind: 'species' });
    expect(labelFromHash(new URL(u).hash).name!.length).toBeLessThanOrEqual(QR_NAME_MAX);
  });
  it('reads only a slug\'s characters, and the name as plain text, whatever the address holds', () => {
    expect(speciesFromHash('#s=copiapoa-cinerea')).toBe('copiapoa-cinerea');
    expect(speciesFromHash('#n=x&s=copiapoa-cinerea')).toBe('copiapoa-cinerea');
    expect(speciesFromHash('#s=../../api/sync')).toBeNull();
    expect(speciesFromHash('#s=Copiapoa')).toBeNull();
    expect(speciesFromHash('')).toBeNull();
    expect(labelFromHash('#s=a-b&n=%3Cscript%3Ealert(1)%3C%2Fscript%3E').name).toBe('<script>alert(1)</script>'); // text, shown escaped
    expect(labelFromHash('#n=%E0%A4%A').name).toBeNull(); // a broken escape is no name, not an error
    expect(labelFromHash('#n=a%0Ab%00c').name).toBe('a b c');
    expect(labelFromHash('#n=Copiapoa+cinerea').name).toBe('Copiapoa cinerea');
  });
});

describe('prices and what was spent', () => {
  it('reads a plain number with or without a currency, and nothing else', () => {
    expect(readPrice('12')).toEqual({ v: 12, cur: null });
    expect(readPrice('8.50')).toEqual({ v: 8.5, cur: null });
    expect(readPrice('3,50')).toEqual({ v: 3.5, cur: null });
    expect(readPrice('£6')).toEqual({ v: 6, cur: '£' });
    expect(readPrice(' $ 14.99 ')).toEqual({ v: 14.99, cur: '$' });
    expect(readPrice('6 EUR')).toEqual({ v: 6, cur: '€' }); // one currency written one way (round sixty-two; A39)
    expect(readPrice('12 €')).toEqual({ v: 12, cur: '€' });
    for (const no of ['a swap', '3 for 10', '1,2000', '£6 $7', '12-15', '-5', '']) expect(readPrice(no), no).toBeNull(); // "1,200" and "free" are read since round sixty-two (A39)
  });
  // Round sixty-one: a total per currency, never across them, in place of no total at all (the grower review, 12).
  it('totals the plain prices per currency, and counts the rest as not read', () => {
    expect(spendOf(['12', '8.50', 'a swap', null, '', '£3'])).toMatchObject({ counted: 3, skipped: 1 });
    const s = spendOf(['£12', '£8.50', 'a swap', null, '£0.25']);
    expect(s).toEqual({ parts: [{ cur: '£', total: 20.75, counted: 3 }], counted: 3, skipped: 1, free: 0 });
    expect(amountWords(s)).toBe('£20.75 on 3 plants');
    expect(amountWords(spendOf(['12', '3']))).toBe('15 on 2 plants');
    expect(amountWords(spendOf(['12 EUR']))).toBe('€12 on 1 plant');
    expect(amountWords(spendOf(['12', '£3']))).toBe('£3 on 1 plant and 12 on 1 plant with no currency given');
  });
  it('says this year and all time, and how many prices could not be read', () => {
    const w = spendWords(spendOf(['£5']), spendOf(['£5', '£10', 'a swap', 'two for 5']), '2026');
    expect(w).toEqual({ year: '£5 on 1 plant (2026)', all: '£15 on 2 plants', left: '2 prices could not be read as a number, so they are not counted.' });
    expect(spendWords(spendOf([]), spendOf([null, '']), '2026')).toBeNull();
    expect(spendWords(spendOf([]), spendOf(['a swap']), '2026')).toEqual({ year: 'nothing counted (2026)', all: 'nothing counted', left: '1 price could not be read as a number, so it is not counted.' });
  });
});

describe('firsts, read from the log', () => {
  const ev = (id: string, acc: string, d: string, t: PlantEvent['t'], n?: number): PlantEvent => ({ id, acc, d, t, ...(n != null ? { n } : {}) });
  const log: Record<string, PlantEvent[]> = {
    p1: [ev('e2', 'p1', '2026-10-04', 'flower'), ev('e1', 'p1', '2026-10-04', 'water')],
    p2: [ev('e3', 'p2', '2026-10-03', 'flower'), ev('e4', 'p2', '2025-06-01', 'flower')], // flowered before: not a first
    s1: [ev('e5', 's1', '2026-10-03', 'germinate', 7)],
    s2: [ev('e6', 's2', '2026-10-01', 'germinate', 3), ev('e7', 's2', '2026-10-04', 'germinate', 9)],
    p3: [ev('e8', 'p3', '2026-10-05', 'flower')] // dated ahead of today: not yet
  };
  const photos: Record<string, Array<{ id: string; made: string | null }>> = {
    p1: [{ id: 'f1', made: '2026-10-04' }],
    p2: [{ id: 'f2', made: '2026-10-04' }, { id: 'f3', made: '2026-03-01' }],
    p3: [{ id: 'f4', made: null }]
  };
  it('finds a first flowering, a first germination count and a first photograph dated today or yesterday', () => {
    const got = firstsOf(['p1', 'p2', 'p3', 's1', 's2'], { events: (id) => log[id] ?? [], photos: (id) => photos[id] ?? [] }, '2026-10-04', '2026-10-03');
    expect(got).toEqual([
      { kind: 'flower', recId: 'p1', d: '2026-10-04' },
      { kind: 'photo', recId: 'p1', d: '2026-10-04' },
      { kind: 'germinate', recId: 's1', d: '2026-10-03', n: 7 }
    ]);
  });
  it('writes nothing: it reads through the functions it is given', () => {
    const frozen = Object.freeze(log.p1.map((e) => Object.freeze({ ...e })));
    expect(() => firstsOf(['p1'], { events: () => frozen as PlantEvent[] }, '2026-10-04', '2026-10-03')).not.toThrow();
  });
});

describe('iPhone and iPad, by features', () => {
  const iphone = { standalone: false, maxTouchPoints: 5, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1' };
  it('tells an iPhone, an iPad asking for the desktop site, and not a Mac or an Android phone', () => {
    expect(isIos(iphone)).toBe(true);
    expect(isIos({ standalone: false, maxTouchPoints: 5, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15' })).toBe(true);
    expect(isIos({ maxTouchPoints: 0, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15' })).toBe(false);
    expect(isIos({ maxTouchPoints: 5, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/129 Mobile Safari/537.36' })).toBe(false);
  });
  it('is in the browser only when not opened from the Home Screen', () => {
    expect(iosInBrowser(iphone, false)).toBe(true);
    expect(iosInBrowser({ ...iphone, standalone: true }, false)).toBe(false);
    expect(iosInBrowser(iphone, true)).toBe(false);
  });
});

describe('the Wanted line in a species\' notes', () => {
  it('sets, reads and clears its own line, keeping the rest of the notes', () => {
    const n = writeWanted('Grows slowly.\nKeep dry in winter.', 'a seedling, not a graft', '18 at the spring sale');
    expect(n).toBe('Wanted: a seedling, not a graft · price seen 18 at the spring sale\nGrows slowly.\nKeep dry in winter.');
    expect(readWanted(n)).toEqual({ note: 'a seedling, not a graft', price: '18 at the spring sale' });
    expect(writeWanted(n, '', '')).toBe('Grows slowly.\nKeep dry in winter.');
    expect(readWanted(writeWanted(null, '', '£9'))).toEqual({ note: '', price: '£9' });
  });
});
