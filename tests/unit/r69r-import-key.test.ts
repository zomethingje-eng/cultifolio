/**
 * Round sixty-nine, agent R: the import key (triage-68 R1; the self-review's D1, IND-5, R46-20). Each case marked "base"
 * fails on 1609c19. The round-sixty-seven keys below are what that build's `rowsFromSheet` gave for the sheets shown, so
 * the plants its imports filed are found, and never taken for another day's or another column's plant.
 */
import { describe, it, expect } from 'vitest';
import { parseCsv, detectHeader, guessMapping } from '$lib/import/csv';
import { rowsFromSheet } from '$lib/import/rows';
import { markImported, markAlreadyImported, markSheet, type HerePlant, type ImportRow } from '$lib/import/plan';

const read = (text: string, dateOrder: 'dmy' | 'mdy' | null = 'dmy') => { const s = parseCsv(text); const h = detectHeader(s); return rowsFromSheet(s, guessMapping(s, h), h, '2026-10-05', { dateOrder }).rows; };
const keysOf = (rows: ImportRow[]) => new Set(rows.flatMap((r) => r.importKeys ?? []));
const done = (rows: ImportRow[]) => rows.map((r) => !!r.done);

describe('a date is keyed by its exact day (S-D1, IND-5)', () => {
  it('base: 2024-01-05 and 2024-05-01 are two keys', () => {
    const [a] = read('species,acquired,source\nLithops lesliei,2024-05-01,Mesa Garden\n');
    const [b] = read('species,acquired,source\nLithops lesliei,2024-01-05,Mesa Garden\n');
    expect(b.importKeys).not.toEqual(a.importKeys);
  });
  it('base: an older purchase sorted above a plant already imported is offered; the plant is not offered again', () => {
    const here = keysOf(read('species,acquired,source\nLithops lesliei,2024-05-01,Mesa Garden\n'));
    const second = markImported(read('species,acquired,source\nLithops lesliei,2024-01-05,Mesa Garden\nLithops lesliei,2024-05-01,Mesa Garden\n'), (k) => here.has(k));
    expect(second.map((r) => [r.acquired, !!r.done, r.drop])).toEqual([['2024-01-05', false, false], ['2024-05-01', true, true]]);
  });
  it('an ambiguous cell finds its plant whichever way it is answered, and a re-saved exact day finds it too', () => {
    const dmy = read('species,acquired\nAloe vera,05/01/2024\n', 'dmy');
    const mdy = read('species,acquired\nAloe vera,05/01/2024\n', 'mdy');
    expect(mdy[0].importKeys).toEqual(dmy[0].importKeys);
    const iso = read('species,acquired\nAloe vera,2024-05-01\n', null);
    expect(markImported(iso, (k) => keysOf(mdy).has(k))[0].done).toBe(true);
  });
  it('an ambiguous cell finds a plant filed under either of its readings; an exact day only its own', () => {
    const here = keysOf(read('species,acquired\nAloe vera,2024-01-05\n'));
    expect(markImported(read('species,acquired\nAloe vera,05/01/2024\n', 'mdy'), (k) => here.has(k))[0].done).toBe(true);
    expect(markImported(read('species,acquired\nAloe vera,2024-05-01\n'), (k) => here.has(k))[0].done).toBeUndefined();
  });
});

describe('a date re-saved with a two-digit year (R46-20)', () => {
  it('base: 2024-05-01 saved again as 5/1/24 and left as written finds its plant', () => {
    const here = keysOf(read('species,acquired\nAloe vera,2024-05-01\n'));
    expect(markImported(read('species,acquired\nAloe vera,5/1/24\n', null), (k) => here.has(k))[0].done).toBe(true);
    expect(markImported(read('species,acquired\nAloe vera,5/1/24\n', 'dmy'), (k) => here.has(k))[0].done).toBe(true);
  });
});

describe('the columns no field takes are keyed, through the notes (S-D1)', () => {
  it('base: Totoral inserted above Paposo is offered, and Paposo is not offered again', () => {
    const here = keysOf(read('species,source,locality\nCopiapoa cinerea,Uhlig,Paposo\n'));
    const second = markImported(read('species,source,locality\nCopiapoa cinerea,Uhlig,Totoral\nCopiapoa cinerea,Uhlig,Paposo\n'), (k) => here.has(k));
    expect(second.map((r) => [r.notes, !!r.done])).toEqual([['locality: Totoral', false], ['locality: Paposo', true]]);
  });
  it('a column added to tick lines done makes no line new, as it is the only line of its kind', () => {
    const here = keysOf(read('species,acquired\nCopiapoa cinerea,2024-05-01\nLithops lesliei,2023-03-02\n'));
    const second = markImported(read('species,acquired,done\nCopiapoa cinerea,2024-05-01,x\nLithops lesliei,2023-03-02,x\n'), (k) => here.has(k));
    expect(done(second)).toEqual([true, true]);
  });
});

describe('price as a number (R46-20)', () => {
  it('base: 12.50 saved again as 12.5 keys the same line', () => {
    const a = read('species,price\nCopiapoa cinerea,12.50\n'), b = read('species,price\nCopiapoa cinerea,12.5\n');
    expect(b[0].importKeys).toEqual(a[0].importKeys);
    expect(read('species,price\nCopiapoa cinerea,12.51\n')[0].importKeys).not.toEqual(a[0].importKeys);
  });
});

describe('a numbered line matches on its number alone (R46-20)', () => {
  it('base: 0007 Lithops lesleii imported, then corrected to lesliei: looks already imported, and says the name here', () => {
    const rows = read('number,species\n0007,Lithops lesliei\n');
    const held = (no: string) => (no === '0007' ? [{ taxonName: 'Lithops lesleii', importKey: 'i8bb589s7kl#1' }] : []);
    expect(markAlreadyImported(rows, held).map((r) => [r.already, r.drop, r.alreadyAs])).toEqual([[true, true, 'Lithops lesleii']]);
  });
  it('a hand-added plant of another name holding the number is another plant: not already imported', () => {
    const rows = read('number,species\n0010,Haworthia truncata\n');
    expect(markAlreadyImported(rows, () => [{ taxonName: 'Aloe vera' }])[0].already).toBeUndefined();
  });
});

describe('round sixty-seven\'s keys are still found, and never collapse two days', () => {
  // Keys that build gave: "Lithops lesliei,2024-05-01,Mesa Garden", "Copiapoa cinerea,Uhlig,Paposo" (a locality column),
  // and "Copiapoa cinerea,2024-05-01,from Uhlig".
  const may: HerePlant = { acquired: '2024-05-01', notes: null };
  it('base: its May plant is found by the May line only, not by the January line above it', () => {
    const stored = new Map([['i21hw8w3ryl8#1', may]]);
    const second = markImported(read('species,acquired,source\nLithops lesliei,2024-01-05,Mesa Garden\nLithops lesliei,2024-05-01,Mesa Garden\n'), (k) => stored.get(k));
    expect(done(second)).toEqual([false, true]);
  });
  it('an old key whose day it cannot tell is not taken without the plant', () => {
    const second = markImported(read('species,acquired,source\nLithops lesliei,2024-01-05,Mesa Garden\n'), (k) => k === 'i21hw8w3ryl8#1');
    expect(done(second)).toEqual([false]);
  });
  it('base: its Paposo plant is found by the Paposo line, not by Totoral inserted above it', () => {
    const stored = new Map([['i1b9nn70jdo2#1', { acquired: null, notes: 'locality: Paposo' }]]);
    const second = markImported(read('species,source,locality\nCopiapoa cinerea,Uhlig,Totoral\nCopiapoa cinerea,Uhlig,Paposo\n'), (k) => stored.get(k));
    expect(done(second)).toEqual([false, true]);
  });
  it('the same sheet run again finds every plant it filed', () => {
    const stored = new Map([['i241xbsj5nj7#1', { acquired: '2024-05-01', notes: 'from Uhlig' }]]);
    expect(done(markImported(read('species,acquired,notes\nCopiapoa cinerea,2024-05-01,from Uhlig\n'), (k) => stored.get(k)))).toEqual([true]);
    expect(done(markImported(read('species,acquired,notes\nCopiapoa cinerea,01/05/2024,from Uhlig\n'), (k) => stored.get(k)))).toEqual([true]);
  });
  it('a plant found by an older key is taken once, and explains no other line as changed', () => {
    const stored = new Map([['i241xbsj5nj7#1', { acquired: '2024-05-01', notes: 'from Uhlig' }]]);
    const plants = [{ taxonName: 'Copiapoa cinerea', acquired: '2024-05-01', sourceFrom: null, importKey: 'i241xbsj5nj7#1' }];
    const rows = read('species,acquired,notes\nCopiapoa cinerea,2024-05-01,from Uhlig\nCopiapoa cinerea,2024-05-01,from Uhlig\n');
    const marked = markSheet(rows, { has: (k) => stored.get(k), dropped: new Set(), held: () => [], plants });
    expect(marked.map((r) => [!!r.done, !!r.changed])).toEqual([[true, false], [false, false]]);
  });
});
