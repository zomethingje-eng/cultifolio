/**
 * Round sixty-one, agent G: the import is lossless and restartable (docs/REVIEW-TRIAGE-60.md, decision 3; the grower
 * review's 3 to 6 and 10, the records review's 6 to 11 and 16). The reader and planner as pure functions; the commit
 * against an in-memory vault, as the collection's own tests stand it in.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Change } from '$core/log';
import { nextAccession, DEFAULT_SCHEME } from '$core/accession';
import { parseName } from '$core/names';
import { parseCsv, readDate, detectHeader, guessMapping, unmappedColumns, ambiguousDates } from '$lib/import/csv';
import { rowsFromSheet } from '$lib/import/rows';
import { planNumbers, markAlreadyImported, blankRow } from '$lib/import/plan';
import { recordOf } from '$lib/import/commit';

const TODAY = '2026-10-06';
const sheetOf = (text: string, opts = {}) => { const s = parseCsv(text); const h = detectHeader(s); return rowsFromSheet(s, guessMapping(s, h), h, TODAY, opts); };

describe('dates, read at their precision (the grower review, 4)', () => {
  it.each([
    ['2009', '2009'], ['2017-08', '2017-08'], ['08/2017', '2017-08'], ['August 2017', '2017-08'], ['Feb 2022', '2022-02'],
    ['17-Feb-2017', '2017-02-17'], ['17 February 2017', '2017-02-17'], ['Feb 17, 2017', '2017-02-17'], ['17th Feb 2017', '2017-02-17'],
    ['17.11.2007', '2007-11-17'], ['22/10/2023', '2023-10-22'], ['10/22/2023', '2023-10-22'], ['09/09/2024', '2024-09-09'], ['30/09/09', '2009-09-30'], ['1/2/03', '2003-02-01']
  ])('%s is read as %s', (cell, want) => {
    expect(readDate(cell, TODAY, cell === '1/2/03' ? 'dmy' : null).d).toBe(want);
  });
  it('a two-digit year is read only when 20YY has come: "01/02/99" could be 1999 or 2099 (round sixty-two; A20)', () => {
    expect(readDate('01/02/99', TODAY, 'dmy')).toMatchObject({ d: null, why: '"01/02/99" has a two-digit year that could be 1999 or 2099, so it was not read' });
  });
  it('a day and month either way round is read only by the sheet\'s one choice, and left otherwise with its year', () => {
    expect(readDate('09/03/2024', TODAY)).toMatchObject({ d: null, ambiguous: true, year: 2024 });
    expect(readDate('09/03/2024', TODAY, 'dmy').d).toBe('2024-03-09');
    expect(readDate('09/03/2024', TODAY, 'mdy').d).toBe('2024-09-03');
  });
  it('refuses what is not a date, a future one and a two-digit year with dashes, naming the year when there is one', () => {
    expect(readDate('spring 2019', TODAY)).toMatchObject({ d: null, year: 2019 });
    expect(readDate('?', TODAY)).toEqual({ d: null, why: 'the date "?" was not read' });
    expect(readDate('2027', TODAY).why).toMatch(/future/);
    expect(readDate('2026-11', TODAY).why).toMatch(/future/);
    expect(readDate('2026-10', TODAY).d).toBe('2026-10');
    expect(readDate('31/02/2020', TODAY).why).toMatch(/not a date/);
    expect(readDate('24-03-09', TODAY).d).toBeNull();
    expect(readDate('1850', TODAY).why).toMatch(/before 1900/);
  });
  it('the sheet\'s ambiguous dates are counted for the choice; an unread one is kept in the notes and numbers the plant for its year', () => {
    const s = parseCsv('Name,Date Acq.\nCopiapoa cinerea,09/03/2024\nLithops lesliei,22/10/2023\nAloe vera,spring 2019\nAloe ferox,soon\n');
    expect(ambiguousDates(s, guessMapping(s, true), true, TODAY)).toMatchObject({ n: 1, first: '09/03/2024' });
    const { rows } = rowsFromSheet(s, guessMapping(s, true), true, TODAY);
    expect(rows.map((r) => [r.acquired, r.numberYear ?? null])).toEqual([[null, 2024], ['2023-10-22', null], [null, 2019], [null, null]]);
    expect(rows[0].notes).toBe('Acquired (as written): 09/03/2024');
    expect(rows[3].problems.join()).toMatch(/numbered for this year/);
    const plan = planNumbers(rows, [], DEFAULT_SCHEME, 2026);
    expect(rows.map((r) => plan.byRow.get(r.key)!.numbers[0])).toEqual(['2024-0001', '2023-0001', '2019-0001', '2026-0001']);
    const dmy = rowsFromSheet(s, guessMapping(s, true), true, TODAY, { dateOrder: 'dmy' }).rows;
    expect(dmy[0]).toMatchObject({ acquired: '2024-03-09', notes: null });
  });
});

describe('columns (the grower review, 3)', () => {
  const text = 'Acc No.,Genus,Species,Locality,Qty,Notes,sowing,id\r\n0001,Copiapoa,cinerea,"Totoral, Chile",3,big one,,r1\r\n0002,Copiapoa,Copiapoa humilis,,two,,S2026-001,r2\r\n';
  it('maps Genus and Qty, and joins the genus to the species', () => {
    const s = parseCsv(text);
    expect(guessMapping(s, true)).toMatchObject({ number: 0, genus: 1, name: 2, qty: 4, notes: 5 });
    const { rows } = sheetOf(text);
    expect(rows.map((r) => [r.name, r.qty])).toEqual([['Copiapoa cinerea', 3], ['Copiapoa humilis', 1]]);
    expect(rows[1].problems.join()).toMatch(/"two" was not read as a number of plants/);
    expect(rows[1].notes).toBe('Qty: two');
  });
  it('lists the columns no field takes, puts them in the notes by default, and leaves the backup\'s own links out', () => {
    const s = parseCsv(text);
    expect(unmappedColumns(s, guessMapping(s, true), true)).toEqual({ extra: [{ i: 3, name: 'Locality' }], own: ['sowing', 'id'] });
    expect(sheetOf(text).rows[0].notes).toBe('big one\nLocality: Totoral, Chile');
    expect(sheetOf(text, { extra: [] }).rows[0].notes).toBe('big one');
  });
  it('"Genus & species" is the name column', () => {
    expect(guessMapping(parseCsv('Acc No.,Genus & species,Date Acq.\n'), true)).toEqual({ number: 0, name: 1, acquired: 2 });
  });
  it('a bracketed part of a name is kept with the name as received; cf., aff. and sp. stay in the name, filed with no key', () => {
    const r = { ...blankRow('a', 2, 'Mammillaria theresae (white flower)') };
    expect(recordOf(r, undefined, null)).toMatchObject({ taxonName: 'Mammillaria theresae', nameAsReceived: 'Mammillaria theresae (white flower)' });
    const cf = recordOf(blankRow('b', 3, 'Mammillaria cf. bombycina'), { s: 'found', slug: 'mammillaria-bombycina', refName: 'Mammillaria bombycina', key: null }, null);
    expect(cf).toMatchObject({ taxonName: 'Mammillaria cf. bombycina', taxonKey: null, nameKind: 'species' });
    expect(parseName('Lithops sp. C 036')).toMatchObject({ scientific: 'Lithops sp. C 036', qualifier: 'sp.', epithet: undefined });
  });
});

describe('numbers (the records review, 16; the grower review, 6 and 10)', () => {
  it('the running maximum gives exactly what nextAccession gives, plant by plant', () => {
    const taken = ['2026-0003', '2026-0010', '2025-0004', 'X-1', '2026-0011'];
    const rows = Array.from({ length: 40 }, (_, i) => ({ ...blankRow('k' + i, i + 2, 'Copiapoa cinerea'), acquired: i % 3 ? '2025-05-01' : null, qty: 1 + (i % 2), number: i === 5 ? '2026-0012' : null }));
    const plan = planNumbers(rows, taken, DEFAULT_SCHEME, 2026);
    const used = new Set([...taken, '2026-0012']);
    for (const r of rows) { // kept numbers first (above), then minted in the sheet's order, as the collection would
      const p = plan.byRow.get(r.key)!;
      const want = p.kept ? [p.numbers[0]] : [];
      while (want.length < r.qty) { const n = nextAccession(used, DEFAULT_SCHEME, r.acquired ? 2025 : 2026); used.add(n); want.push(n); }
      expect(p.numbers).toEqual(want);
    }
  });
  it('says a number given twice in the sheet as such, with the line that keeps it, apart from one used here', () => {
    const { rows } = sheetOf('number,species\n2026-0001,Copiapoa cinerea\n2026-0001,Copiapoa humilis\n2026-0005,Welwitschia mirabilis\n');
    const plan = planNumbers(rows, ['2026-0005'], DEFAULT_SCHEME, 2026);
    expect(plan.renumbered).toEqual([{ key: 's3', line: 3, given: '2026-0001', got: '2026-0006', inFile: 2 }, { key: 's4', line: 4, given: '2026-0005', got: '2026-0007' }]);
  });
  it('a line whose number a plant here holds under the same name is marked already imported and dropped; another name is not', () => {
    const { rows } = sheetOf("number,species,cultivar\n0001,Copiapoa cinerea,\n0002,Haworthia truncata,Lime Green\n0003,Lithops lesliei,\n");
    const here: Record<string, Array<{ taxonName: string; cultivar?: string | null }>> = { '0001': [{ taxonName: 'Copiapoa cinerea' }], '0002': [{ taxonName: 'Haworthia truncata', cultivar: 'Lime Green' }], '0003': [{ taxonName: 'Aloe vera' }] };
    const marked = markAlreadyImported(rows, (no) => here[no] ?? []);
    expect(marked.map((r) => [r.already ?? false, r.drop])).toEqual([[true, true], [true, true], [false, false]]);
  });
});

describe('notes and repeated headers (the records review, 6 and 10)', () => {
  it('a note keeps its spaces and line breaks; a repeated header row is dropped and counted', () => {
    const r = sheetOf('species,notes\nCopiapoa cinerea,"  two heads\n"\nspecies,notes\nLithops lesliei,x\n');
    expect(r.rows.map((x) => x.notes)).toEqual(['  two heads\n', 'x']);
    expect(r.repeatedHeader).toBe(1);
  });
});

// The commit, against an in-memory vault.
const mem: { changes: Change[]; meta: Map<string, unknown>; appends: number } = { changes: [], meta: new Map(), appends: 0 };
vi.mock('$lib/db/vault', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m: any = {
    allChanges: async () => [...mem.changes],
    appendChanges: async (c: Change[]) => { mem.appends++; mem.changes.push(...c); return { kept: c, replaced: [] }; },
    getMeta: async (k: string) => mem.meta.get(k),
    setMeta: async (k: string, v: unknown) => void mem.meta.set(k, v),
    deviceId: async () => 'testdevice',
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
  m.arrivalsAfter = async () => ({ changes: [...mem.changes], seq: 0, gen: 0 });
  m.changeKeys = async () => mem.changes.map((c) => c.t);
  m.changesByKeys = async (ts: string[]) => mem.changes.filter((c) => ts.includes(c.t));
  m.updateMeta = async (k: string, fn: (had: unknown) => unknown) => { const next = fn(mem.meta.get(k)); mem.meta.set(k, next); return next; };
  m.changesOf = async (kind: string, id: string) => mem.changes.filter((c) => c.kind === kind && c.id === id);
  m.holdVault = async (work: () => Promise<unknown>) => work();
  m.announceSyncForgotten = () => {};
  return m;
});

describe('the commit writes what the review showed (the records review, 16; the grower review, 4 and friction 6)', () => {
  it('each plant gets the planned number, a year-only or unread date included; the last watering is one more commit', async () => {
    const { collection } = await import('$lib/db/collection.svelte');
    const { commitImport } = await import('$lib/import/commit');
    await collection.load();
    const { rows } = sheetOf('species,acquired,qty\nCopiapoa cinerea,2009,2\nLithops lesliei,09/03/2024,1\nAloe vera,2024-05-01,3\n');
    const plan = planNumbers(rows, [], collection.scheme, 2026, (n) => collection.isNumberTaken(n));
    const before = mem.appends;
    const res = await commitImport(rows, new Map(), plan, { makePlaces: false, lastWatered: '2026-10-01', thisYear: 2026 });
    expect(res.failed).toBeNull();
    expect(res.added.map((a) => a.acc).sort()).toEqual(['2009-0001', '2009-0002', '2024-0001', '2024-0002', '2024-0003', '2024-0004'].sort());
    expect(res.added.find((a) => a.taxonName === 'Lithops lesliei')).toMatchObject({ acquired: null, notes: 'Acquired (as written): 09/03/2024' });
    expect(res.watered).toEqual({ lines: 6, failed: null });
    expect(collection.lastWatered(res.added[0].id)).toBe('2026-10-01');
    // The species records, then the rows in one group (round sixty-two: up to 50 plants a commit), then the waterings.
    expect(mem.appends - before).toBe(1 + 1 + 1);
  });
});
