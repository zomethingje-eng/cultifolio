/**
 * records review, round sixty: the import (src/lib/import/*), attacked. The reader and the planner as pure functions, then
 * commitImport against an in-memory vault that refuses a write partway (the collection-store test's mem.fail pattern).
 *
 * Mixed file. Tests named FAILS reproduce a finding on commit 21257b7; tests named PASSES guard behaviour that is right.
 * Run: npx vitest run tests/unit/records--import-attack.test.ts
 */
import { describe, it, expect, vi } from 'vitest';
import type { Change } from '$core/log';
import { parseCsv, readDate, detectHeader, guessMapping, cellText } from '$lib/import/csv';
import { parsePaste } from '$lib/import/paste';
import { rowsFromSheet, rowsFromPaste } from '$lib/import/rows';
import { planNumbers, splitPath, resolvePlace, placesToMake } from '$lib/import/plan';
import { DEFAULT_SCHEME } from '$core/accession';

type Mem = { changes: Map<string, Change>; meta: Map<string, unknown>; device: string; failAfter: number | null; writes: number };
let mem: Mem = { changes: new Map(), meta: new Map(), device: 'testdevice', failAfter: null, writes: 0 };
vi.mock('$lib/db/vault', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m: any = {
    allChanges: async () => [...mem.changes.values()],
    appendChanges: async (cs: Change[]) => {
      if (mem.failAfter !== null && mem.writes >= mem.failAfter) throw new DOMException('the disk is full', 'QuotaExceededError');
      mem.writes++;
      for (const c of cs) mem.changes.set(c.t, c);
      return { kept: cs, replaced: [], seq: 0 };
    },
    getMeta: async (k: string) => mem.meta.get(k),
    setMeta: async (k: string, v: unknown) => void mem.meta.set(k, v),
    deviceId: async () => mem.device,
    requestPersistence: async () => true
  };
  m.appendChangesClaiming = async (_k: string, known: Set<string>, build: (s: Set<string>) => { changes: Change[]; result: unknown }) => { const b = build(new Set(known)); await m.appendChanges(b.changes); return b.result; };
  m.onOtherTabWrite = () => () => {};
  m.readFold = async () => undefined;
  m.writeFold = async () => false;
  m.foldGen = async () => 0;
  m.dropFold = async () => {};
  m.parkStamps = async (st: string[]) => st;
  m.lastArrival = async () => 0;
  m.arrivalsAfter = async () => ({ changes: [...mem.changes.values()], seq: 0, gen: 0 });
  m.changeKeys = async () => [...mem.changes.keys()];
  m.changesByKeys = async (ts: string[]) => ts.map((t) => mem.changes.get(t)).filter(Boolean);
  m.updateMeta = async (k: string, fn: (had: unknown) => unknown) => { const next = fn(mem.meta.get(k)); mem.meta.set(k, next); return next; };
  m.changesOf = async (kind: string, id: string) => ([...mem.changes.values()] as Change[]).filter((c) => c.kind === kind && c.id === id);
  m.holdVault = async (work: () => Promise<unknown>) => work();
  m.announceSyncForgotten = () => {};
  return m;
});
async function fresh() {
  vi.resetModules();
  mem = { changes: new Map(), meta: new Map(), device: 'testdevice', failAfter: null, writes: 0 };
  const { collection } = await import('$lib/db/collection.svelte');
  await collection.load();
  const { commitImport } = await import('$lib/import/commit');
  return { collection, commitImport };
}
const sheetRows = (text: string) => { const s = parseCsv(text); return rowsFromSheet(s, guessMapping(s, detectHeader(s)), detectHeader(s), '2026-10-05'); };

describe('the CSV reader, attacked', () => {
  it('PASSES: mixed CR, LF and CRLF, a quoted line break, a doubled quote', () => {
    expect(parseCsv('name,notes\rA a,"one\r\ntwo"\nB b,"say ""hi"""\r\nC c,x')).toEqual([['name', 'notes'], ['A a', 'one\r\ntwo'], ['B b', 'say "hi"'], ['C c', 'x']]);
  });
  it('FAILS (finding 9): an unbalanced quote swallows every row after it into one cell, and nothing says so', () => {
    const { rows } = sheetRows('name,notes\nCopiapoa cinerea,"5 inch pot\nCopiapoa humilis,ok\nWelwitschia mirabilis,ok\n');
    // three plants in the sheet; the reader keeps one, whose notes now hold the other two lines
    expect(rows.map((r) => r.name)).toEqual(['Copiapoa cinerea', 'Copiapoa humilis', 'Welwitschia mirabilis']);
  });
  it('PASSES: a byte order mark in the middle of the file (two sheets pasted together) is taken off a name by trim()', () => {
    const { rows } = sheetRows('name\nCopiapoa cinerea\n﻿Copiapoa humilis\n');
    expect(rows.map((r) => r.name)).toEqual(['Copiapoa cinerea', 'Copiapoa humilis']);
  });
  it('FAILS (finding 10): two sheets pasted together file the second header row as a plant named "species"', () => {
    const { rows } = sheetRows('﻿number,species\r\n2026-0001,Copiapoa cinerea\r\n﻿number,species\r\n2026-0002,Copiapoa humilis\r\n');
    expect(rows.map((r) => r.name)).not.toContain('species');
  });
  it('PASSES: formula cells stay text, and only the backup\'s own guard apostrophe is taken off', () => {
    expect(cellText('=cmd|\' /C calc\'!A0')).toBe("=cmd|' /C calc'!A0");
    expect(cellText("'=HYPERLINK(\"http://x\")")).toBe('=HYPERLINK("http://x")');
    expect(cellText('="0012"')).toBe('0012');
    expect(cellText('="1"&"2"')).toBe('="1"&"2"'); // only the bare quoted constant is unwrapped
  });
  it('PASSES: dates are read only when written year first; 09/03/2024 and two-digit years are refused and said', () => {
    expect(readDate('09/03/2024', '2026-10-05').d).toBeNull();
    expect(readDate('09/03/2024', '2026-10-05').why).toMatch(/not written year first/);
    expect(readDate('24-03-09', '2026-10-05').d).toBeNull();
    expect(readDate('2024-3-9', '2026-10-05').d).toBe('2024-03-09');
    expect(readDate('2024-02-30', '2026-10-05').d).toBeNull();
    expect(readDate('2024-03-09T10:00:00Z', '2026-10-05').d).toBe('2024-03-09');
  });
  it('PASSES: 10,000 rows parse in well under a second in Node', () => {
    const text = 'number,species,notes\n' + Array.from({ length: 10_000 }, (_, i) => `2020-${i},Copiapoa cinerea,"note ${i}, with a comma"`).join('\n');
    const t0 = performance.now();
    const { rows } = sheetRows(text);
    expect(rows).toHaveLength(10_000);
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});

describe('the paste reader', () => {
  it('PASSES: hybrids, cultivars in quotes, a genus alone, an empty name', () => {
    const lines = parsePaste('Copiapoa\nEchinopsis × hybrid; \'Flying Saucer\'\n; ; 2026-0009\nHaworthia truncata ‘Lime Green’\n');
    expect(lines.map((l) => [l.name, l.cultivar])).toEqual([['Copiapoa', null], ['Echinopsis × hybrid', 'Flying Saucer'], ['Haworthia truncata ‘Lime Green’', null]]);
  });
  it('FAILS (finding 11): a line with an empty name but a number is dropped without a word', () => {
    const lines = parsePaste('; ; 2026-0009; club; a note\n');
    const rows = rowsFromPaste(lines, { placeId: null, acquired: null, source: null });
    expect(rows.length + 0).toBe(1); // or the review says a line was left out; it says neither
  });
});

describe('numbers and places, planned before anything is written', () => {
  it('PASSES: a number used twice in the file is kept once, the second row renumbered and said; a number used here is never kept', () => {
    const { rows } = sheetRows('number,species\n2026-0001,Copiapoa cinerea\n2026-0001,Copiapoa humilis\n2026-0005,Welwitschia mirabilis\n');
    const plan = planNumbers(rows, ['2026-0005'], DEFAULT_SCHEME, 2026);
    expect(rows.map((r) => plan.byRow.get(r.key)!.numbers[0])).toEqual(['2026-0001', '2026-0006', '2026-0007']);
    expect(plan.renumbered.map((x) => x.given)).toEqual(['2026-0001', '2026-0005']);
  });
  it('FAILS (finding 7): a place named "Shelf > 1 m" here is not found by its own path, and the import would make "Shelf" and "1 m"', () => {
    const places = [{ id: 's', name: 'Shelf > 1 m', parentId: null }];
    expect(resolvePlace('Shelf > 1 m', places)).toEqual({ id: 's' });
    expect(placesToMake(['Shelf > 1 m'], places)).toEqual([]);
  });
  it('PASSES: "Greenhouse › Bench 1" is that Bench 1, not any Bench 1', () => {
    const places = [{ id: 'g', name: 'Greenhouse', parentId: null }, { id: 'b1', name: 'Bench 1', parentId: null }, { id: 'b2', name: 'Bench 1', parentId: 'g' }];
    expect(resolvePlace('Greenhouse › Bench 1', places)).toEqual({ id: 'b2' });
    expect(splitPath('Greenhouse > Bench 1')).toEqual(['Greenhouse', 'Bench 1']);
  });
});

describe('the commit, with a vault that fills up partway', () => {
  const sheet = 'number,species,location\n2026-0001,Copiapoa cinerea,Greenhouse › Bench 9\n2026-0002,Notagenus fakeus,Greenhouse › Bench 9\n2026-0003,Copiapoa humilis,Greenhouse › Bench 9\n';
  it('PASSES (nothing before Add): reading, checking and planning write nothing', async () => {
    const { collection } = await fresh();
    const { rows } = sheetRows(sheet);
    planNumbers(rows, [], collection.scheme, 2026, (n) => collection.isNumberTaken(n));
    expect(mem.changes.size).toBe(0);
  });
  it('FAILS (finding 8): the commit is not all-or-nothing: a full disk at the first plant (the fourth write) leaves two places and three species records, no plant, and "Stopped at line 2: … The lines before it were added"', async () => {
    const { collection, commitImport } = await fresh();
    const { rows } = sheetRows(sheet);
    const plan = planNumbers(rows, [], collection.scheme, 2026, (n) => collection.isNumberTaken(n));
    mem.failAfter = 3; // writes 1 and 2: the two places; write 3: the species records; write 4, the first plant, is refused
    let threw: unknown = null;
    let res: Awaited<ReturnType<typeof commitImport>> | null = null;
    try { res = await commitImport(rows, new Map(), plan, { makePlaces: true }); } catch (e) { threw = e; }
    const left = { places: collection.locations.length, plants: collection.accessions.length, taxa: collection.taxa.length };
    // what is left behind, and what the page is told
    expect({ threw: !!threw, failed: res?.failed ?? null, left }).toEqual({ threw: false, failed: expect.anything(), left: { places: 0, plants: 0, taxa: 0 } });
  });
  it('FAILS (finding 8): a full disk at the second plant leaves the places, the species records and the first plant; the page is told "Stopped at line 3"', async () => {
    const { collection, commitImport } = await fresh();
    const { rows } = sheetRows(sheet);
    const plan = planNumbers(rows, [], collection.scheme, 2026, (n) => collection.isNumberTaken(n));
    mem.failAfter = 4; // places 2, species 1, plant 1, then refused
    const res = await commitImport(rows, new Map(), plan, { makePlaces: true });
    expect(res.failed?.line).toBe(3);
    expect({ places: collection.locations.length, plants: collection.accessions.length, taxa: collection.taxa.length }).toEqual({ places: 0, plants: 0, taxa: 0 });
  });
  it('FAILS (finding 8): a full disk while the places are made throws out of commitImport (the page has no catch), leaving the first place', async () => {
    const { collection, commitImport } = await fresh();
    const { rows } = sheetRows(sheet);
    const plan = planNumbers(rows, [], collection.scheme, 2026, (n) => collection.isNumberTaken(n));
    mem.failAfter = 1;
    let threw: unknown = null;
    try { await commitImport(rows, new Map(), plan, { makePlaces: true }); } catch (e) { threw = e; }
    expect({ threw: threw ? String(threw) : null, places: collection.locations.map((l) => l.name) }).toEqual({ threw: null, places: [] });
  });
  it('PASSES: the second try after a failure makes no second set of places and keeps the numbers planned', async () => {
    const { collection, commitImport } = await fresh();
    const { rows } = sheetRows(sheet);
    let plan = planNumbers(rows, [], collection.scheme, 2026, (n) => collection.isNumberTaken(n));
    mem.failAfter = 4;
    const res = await commitImport(rows, new Map(), plan, { makePlaces: true });
    mem.failAfter = null;
    const rest = rows.filter((r) => !res.doneKeys.includes(r.key));
    plan = planNumbers(rest, collection.accessions.map((a) => a.acc!), collection.scheme, 2026, (n) => collection.isNumberTaken(n));
    const res2 = await commitImport(rest, new Map(), plan, { makePlaces: true });
    expect(res2.failed).toBeNull();
    expect(collection.locations.map((l) => l.name).sort()).toEqual(['Bench 9', 'Greenhouse']);
    expect(collection.accessions.map((a) => a.acc).sort()).toEqual(['2026-0001', '2026-0002', '2026-0003']);
  });
});
