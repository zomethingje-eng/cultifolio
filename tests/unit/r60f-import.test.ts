/**
 * Round sixty, agent F: the import's reading on the device. A pasted list (name; cultivar; number; source; notes), a CSV with its header found and its columns
 * mapped, formulas kept as text, the backup's guard apostrophe taken off again, dates read only when unambiguous, names
 * checked against the reference with "not checked" kept apart from "not in the reference", numbers kept when free and
 * minted otherwise, places by path.
 */
import { describe, it, expect } from 'vitest';
import { parsePaste } from '$lib/import/paste';
import { parseCsv, sniffDelimiter, detectHeader, guessMapping, cellText, readDate, readRow } from '$lib/import/csv';
import { rowsFromPaste, rowsFromSheet } from '$lib/import/rows';
import { checkNames, readSearch, type Lookup } from '$lib/import/check';
import { planNumbers, resolvePlace, placesToMake, blankRow } from '$lib/import/plan';
import { plantsCsv } from '$lib/backup/backup';
import type { Record_ } from '$core/log';
import type { Accession } from '$lib/db/types';

describe('a pasted list', () => {
  it('reads one plant per line, with cultivar, number, source and notes after semicolons or tabs, skipping blanks, comments and list marks', () => {
    const got = parsePaste('\uFEFFCopiapoa cinerea\n\n# my list\n- Haworthia truncata; Lime Green\n2. Gymnocalycium ragonesei; ; 2024-0031; club sale; two heads\nLithops lesliei\t\t\tSteinkopf\r\n• Aloe polyphylla; ‘Spiral’');
    expect(got.map((l) => [l.line, l.name, l.cultivar, l.number, l.source, l.notes])).toEqual([
      [1, 'Copiapoa cinerea', null, null, null, null],
      [4, 'Haworthia truncata', 'Lime Green', null, null, null],
      [5, 'Gymnocalycium ragonesei', null, '2024-0031', 'club sale', 'two heads'],
      [6, 'Lithops lesliei', null, null, 'Steinkopf', null],
      [7, 'Aloe polyphylla', 'Spiral', null, null, null]
    ]);
    expect(got.every((l) => !l.problem)).toBe(true);
  });
  it('says what is left after the note rather than filing it somewhere', () => {
    const [a] = parsePaste('Copiapoa cinerea; ; ; ; a note; and more; and more');
    expect(a.notes).toBe('a note');
    expect(a.problem).toMatch(/"and more; and more" after the note was left out/);
  });
  it('gives every line the same place and date, and the list\'s source unless a line names its own', () => {
    const rows = rowsFromPaste(parsePaste('A b\nC d; x; ; a friend; n'), { placeId: 'l1', acquired: '2025-04-01', source: 'club sale' });
    expect(rows.map((r) => [r.placeId, r.acquired, r.source, r.notes, r.qty])).toEqual([['l1', '2025-04-01', 'club sale', null, 1], ['l1', '2025-04-01', 'a friend', 'n', 1]]);
  });
  it('keeps a pasted number that is free, and gives one in use the next free number, saying so', () => {
    const rows = rowsFromPaste(parsePaste('A b; ; 2026-0009\nC d; ; 2026-0001\nE f'), { placeId: null, acquired: null, source: null });
    const p = planNumbers(rows, ['2026-0001'], { mode: 'year', width: 4 }, 2026);
    expect(rows.map((r) => p.byRow.get(r.key)!.numbers[0])).toEqual(['2026-0009', '2026-0010', '2026-0011']);
    expect(p.renumbered).toEqual([{ key: 'p2', line: 2, given: '2026-0001', got: '2026-0010' }]);
  });
});

describe('a CSV', () => {
  it('reads quoted cells with commas, quotes and line breaks, three line endings, and a byte order mark', () => {
    const rows = parseCsv('﻿number,species,notes\r\n2024-0001,Copiapoa cinerea,"a ""big"" one, two heads"\n2024-0002,Lithops lesliei,"line one\nline two"\r2024-0003,,\n');
    expect(rows).toEqual([['number', 'species', 'notes'], ['2024-0001', 'Copiapoa cinerea', 'a "big" one, two heads'], ['2024-0002', 'Lithops lesliei', 'line one\nline two'], ['2024-0003', '', '']]);
  });
  it('finds the separator: a semicolon sheet from a decimal-comma locale, and a tab sheet', () => {
    expect(sniffDelimiter('Name;Price;Notes\nA b;3,50;x')).toBe(';');
    expect(parseCsv('Name;Price\nA b;3,50')).toEqual([['Name', 'Price'], ['A b', '3,50']]);
    expect(sniffDelimiter('Name\tPrice\nA\t1')).toBe('\t');
    expect(sniffDelimiter('"a;b",c\n')).toBe(',');
  });
  it('detects the header and maps columns by their names, the backup\'s and a grower\'s own', () => {
    const backup = parseCsv('number,species,cultivar,kind,parentage,name as received,field number,provenance,status,location,acquired,from,lot or reference,form,price,sowing,notes\n');
    expect(detectHeader(backup)).toBe(true);
    expect(guessMapping(backup, true)).toMatchObject({ number: 0, name: 1, cultivar: 2, kind: 3, parentage: 4, nameAsReceived: 5, fieldNumber: 6, provenance: 7, status: 8, place: 9, acquired: 10, source: 11, lot: 12, form: 13, price: 14, notes: 16 });
    const own = parseCsv('Acc. No.,Botanical name,Bench,Date bought,Supplier,Comments\n');
    expect(guessMapping(own, true)).toEqual({ number: 0, name: 1, place: 2, acquired: 3, source: 4, notes: 5 });
    const bare = parseCsv('Copiapoa cinerea,Bench 1\nLithops lesliei,Bench 2');
    expect(detectHeader(bare)).toBe(false);
    expect(guessMapping(bare, false)).toEqual({ name: 0 });
  });
  it('keeps a formula as text, and takes off only the guard apostrophe the backup put before one', () => {
    expect(cellText('=SUM(A1:A3)')).toBe('=SUM(A1:A3)');
    expect(cellText("'-5 °C at night")).toBe('-5 °C at night');
    expect(cellText("'=1+1")).toBe('=1+1');
    expect(cellText("'Bev's Wonder'")).toBe("'Bev's Wonder'"); // not a guard: nothing formula-like follows
    expect(cellText('  padded  ')).toBe('padded');
  });
  it('reads a date written year first, and refuses a future one; 09/03/2024 is left unless the sheet says which way round (round sixty-one)', () => {
    expect(readDate('2024-3-9', '2026-10-04')).toEqual({ d: '2024-03-09' });
    expect(readDate('2024/03/09 10:00', '2026-10-04')).toEqual({ d: '2024-03-09' });
    expect(readDate('09/03/2024', '2026-10-04').d).toBeNull();
    expect(readDate('09/03/2024', '2026-10-04').why).toMatch(/could be 9 March or 3 September/);
    expect(readDate('2024-02-30', '2026-10-04').why).toMatch(/not a date/);
    expect(readDate('2031-01-01', '2026-10-04').why).toMatch(/future/);
  });
  it('turns rows into import rows, leaving out a row with no name and saying what it did not read', () => {
    const sheet = parseCsv('species,location,acquired,status,provenance,price\nCopiapoa cinerea,Greenhouse › Bench 1,2024-05-01,archived,wild,12\n,Bench 2,,,,\nLithops lesliei,,1/2/2024,sold,seed-grown,');
    const { rows, noName } = rowsFromSheet(sheet, guessMapping(sheet, true), true, '2026-10-04');
    expect(noName).toBe(1);
    expect(rows[0]).toMatchObject({ line: 2, name: 'Copiapoa cinerea', placePath: 'Greenhouse › Bench 1', acquired: '2024-05-01', status: 'archived', provenance: 'wild', price: '12', problems: [] });
    // The date left as written goes to the notes, and the plant is numbered for the year it names (round sixty-one).
    expect(rows[1]).toMatchObject({ line: 4, name: 'Lithops lesliei', acquired: null, numberYear: 2024, status: 'growing', provenance: null, notes: 'Acquired (as written): 1/2/2024\nProvenance: seed-grown\nStatus: sold' }); // an unread status is kept in the notes (round sixty-two; the records review, 4)
    expect(rows[1].problems.join(' | ')).toMatch(/left as written.*status "sold".*|provenance/);
  });
  it('never evaluates a cell: formulas, DDE and hyperlinks stay the text they are, and go back out guarded', () => {
    const sheet = parseCsv('species,notes\nCopiapoa cinerea,=HYPERLINK("http://x.example";"click")\n"=cmd|\' /C calc\'!A0",+1+1\n@SUM(A1),-2');
    const { rows } = rowsFromSheet(sheet, guessMapping(sheet, true), true, '2026-10-04');
    expect(rows.map((r) => [r.name, r.notes])).toEqual([['Copiapoa cinerea', '=HYPERLINK("http://x.example";"click")'], ["=cmd|' /C calc'!A0", '+1+1'], ['@SUM(A1)', '-2']]);
  });
  it('reads back the plants.csv a backup writes: byte order mark, CRLF, quoting and guard apostrophes included', () => {
    const state = new Map<string, Record_>([
      ['location:g', { kind: 'location', id: 'g', name: 'Greenhouse', parentId: null } as unknown as Record_],
      ['location:b', { kind: 'location', id: 'b', name: 'Bench 1', parentId: 'g' } as unknown as Record_]
    ]);
    const acc = { kind: 'accession', id: 'r1', acc: '2024-0001', taxonName: 'Copiapoa cinerea', cultivar: null, status: 'growing', provenance: 'wild', locationId: 'b', acquired: '2024-05-01', sourceFrom: 'Club, "spring" sale', price: '£12', notes: '-5 °C one night\nfine after', fieldNumber: 'FR 1234' } as unknown as Accession & Record_;
    const text = plantsCsv([acc], state);
    const sheet = parseCsv(text);
    expect(detectHeader(sheet)).toBe(true);
    const { rows } = rowsFromSheet(sheet, guessMapping(sheet, true), true, '2026-10-04');
    expect(rows[0]).toMatchObject({ number: '2024-0001', name: 'Copiapoa cinerea', fieldNumber: 'FR 1234', provenance: 'wild', status: 'growing', acquired: '2024-05-01', source: 'Club, "spring" sale', price: '£12', notes: '-5 °C one night\nfine after', problems: [] });
    expect(resolvePlace(rows[0].placePath!, [{ id: 'g', name: 'Greenhouse', parentId: null }, { id: 'b', name: 'Bench 1', parentId: 'g' }])).toEqual({ id: 'b' });
  });
  it('reads a short row as empty cells', () => {
    expect(readRow(['A b'], { name: 0, notes: 3 })).toEqual({ name: 'A b', notes: '' });
  });
});

describe('the names, against the reference', () => {
  const ref = new Map([
    ['copiapoa-cinerea', { slug: 'copiapoa-cinerea', name: 'Copiapoa cinerea', key: 5384013, syn: ['Copiapoa columna-alba'] }],
    ['copiapoa-humilis', { slug: 'copiapoa-humilis', name: 'Copiapoa humilis', key: 5384999 }]
  ]);
  const searched: string[] = [];
  const look = (searchAnswer: 'ok' | 'down' | 'limited' = 'ok'): Lookup => ({
    entries: async (slugs) => new Map(slugs.filter((s) => ref.has(s)).map((s) => [s, ref.get(s)!])),
    search: async (q) => {
      searched.push(q);
      if (searchAnswer === 'down') return null;
      if (searchAnswer === 'limited') return { limited: 60 };
      return [...ref.values()].filter((e) => e.name.toLowerCase().startsWith(q.toLowerCase().slice(0, 8)) || (e.syn ?? []).some((s) => s.toLowerCase() === q.toLowerCase()));
    }
  });
  it('finds a name by its hash group without searching it, keeps no species key on a subspecies, and files a cross under its genus', async () => {
    searched.length = 0;
    const got = await checkNames(['Copiapoa cinerea', "Copiapoa humilis subsp. tocopillana", 'Ariocarpus retusus × trigonus', "Copiapoa cinerea 'Big'"], look());
    expect(got.get('Copiapoa cinerea')).toEqual({ s: 'found', slug: 'copiapoa-cinerea', refName: 'Copiapoa cinerea', key: 5384013 });
    expect(got.get('Copiapoa humilis subsp. tocopillana')).toEqual({ s: 'found', slug: 'copiapoa-humilis', refName: 'Copiapoa humilis', key: null });
    expect(got.get('Ariocarpus')).toEqual({ s: 'hybrid' });
    expect(searched).toEqual([]); // nothing the groups held was put to the search
  });
  it('offers the accepted name for an older one and a near spelling, never taking either on its own', async () => {
    const got = await checkNames(['Copiapoa columna-alba', 'Copiapoa cinera', 'Notagenus fakeus'], look());
    expect(got.get('Copiapoa columna-alba')).toEqual({ s: 'near', suggestion: 'Copiapoa cinerea', key: 5384013, why: 'older name' });
    expect(got.get('Copiapoa cinera')).toMatchObject({ s: 'near', suggestion: 'Copiapoa cinerea', why: 'spelling' });
    expect(got.get('Notagenus fakeus')).toEqual({ s: 'missing' });
  });
  it('a search that did not answer, or an allowance spent, leaves the name not checked, never missing (rule 2)', async () => {
    expect((await checkNames(['Notagenus fakeus'], look('down'))).get('Notagenus fakeus')).toEqual({ s: 'unchecked' });
    const lim = await checkNames(['Notagenus a', 'Notagenus b', 'Notagenus c'], look('limited'), 1);
    expect([...lim.values()].every((c) => c.s === 'unchecked')).toBe(true);
    const groupsDown: Lookup = { entries: async () => null, search: async () => null };
    expect((await checkNames(['Copiapoa cinerea'], groupsDown)).get('Copiapoa cinerea')).toEqual({ s: 'unchecked' });
  });
  it('reads a search answer for an exact name at species rank', () => {
    expect(readSearch('Copiapoa cinerea', true, [...ref.values()])).toMatchObject({ s: 'found', key: 5384013 });
  });
});

describe('numbers and places', () => {
  const row = (key: string, number: string | null, qty = 1, acquired: string | null = null) => ({ ...blankRow(key, Number(key.slice(1)), 'A b'), number, qty, acquired });
  it('keeps a free number, gives a taken one the next free number and says so, and writes keepers first so a minted number cannot take one', () => {
    const rows = [row('s2', null), row('s3', '2026-0005'), row('s4', '2026-0001'), row('s5', null, 2, '2024-06-01'), row('s6', '2026-0005')];
    const p = planNumbers(rows, ['2026-0001', '2026-0002'], { mode: 'year', width: 4 }, 2026, (n) => n === '2026-0001');
    expect(p.byRow.get('s3')).toEqual({ numbers: ['2026-0005'], kept: true, given: '2026-0005' });
    expect(p.byRow.get('s2')!.numbers).toEqual(['2026-0006']); // the next after the highest, as the collection mints
    expect(p.byRow.get('s5')!.numbers).toEqual(['2024-0001', '2024-0002']); // the acquisition year's numbers
    expect(p.renumbered.map((x) => [x.given, x.got])).toEqual([['2026-0001', '2026-0007'], ['2026-0005', '2026-0008']]);
    expect(p.order[0]).toBe('s3');
  });
  it('a dropped row takes no number', () => {
    const rows = [{ ...row('s2', null), drop: true }, row('s3', null)];
    const p = planNumbers(rows, [], { mode: 'prefix', prefix: 'JF', width: 3 }, 2026);
    expect(p.byRow.has('s2')).toBe(false);
    expect(p.byRow.get('s3')!.numbers).toEqual(['JF-001']);
  });
  it('finds a place by its path from the top, and lists what would be made, parents first', () => {
    const places = [{ id: 'g', name: 'Greenhouse', parentId: null }, { id: 'b1', name: 'Bench 1', parentId: 'g' }, { id: 'x', name: 'Bench 1', parentId: null }];
    expect(resolvePlace('Greenhouse › Bench 1', places)).toEqual({ id: 'b1' });
    expect(resolvePlace('greenhouse › bench 1', places)).toEqual({ id: 'b1' });
    expect(resolvePlace('Greenhouse > Bench 1', places)).toEqual({ under: null, make: ['Greenhouse > Bench 1'] }); // " › " only since round sixty-one (the records review, 7)
    expect(resolvePlace('Bench 1', places)).toEqual({ id: 'x' });
    expect(resolvePlace('Greenhouse › Bench 3', places)).toEqual({ under: 'g', make: ['Bench 3'] });
    expect(placesToMake(['Greenhouse › Bench 3', 'Cold frame › Left', 'Cold frame', 'Greenhouse › Bench 1'], places)).toEqual([['Cold frame'], ['Greenhouse', 'Bench 3'], ['Cold frame', 'Left']]);
  });
});
