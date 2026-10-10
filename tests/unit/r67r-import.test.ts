/**
 * Round sixty-seven, agent R: the import's duplicates (triage-66 R3, R4, R5; the self-review's C3, C4, C5, the outside
 * review's 15). Adopted from the self-review's probes (/tmp/rev66/C/tests/unit/rev66c-import-keys, -passes, -partdone),
 * inverted to assert the fix, with cases added for removed plants, numbers saved without their zeros, unnumbered lines
 * changed since, and a sheet numbered past the safe integers. Each case marked "base" failed on the round-sixty-six base.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Change } from '$core/log';
import { parseCsv, detectHeader, guessMapping } from '$lib/import/csv';
import { rowsFromSheet } from '$lib/import/rows';
import { markImported, markAlreadyImported, markDroppedBefore, markChanged, numberKey, passOf, planNumbers, type ImportRow } from '$lib/import/plan';
import { DEFAULT_SCHEME } from '$core/accession';

const read = (text: string, dateOrder: 'dmy' | null = 'dmy') => { const s = parseCsv(text); const h = detectHeader(s); return rowsFromSheet(s, guessMapping(s, h), h, '2026-10-05', { dateOrder }).rows; };

describe('the import key is the line as read, not its raw cells (R3)', () => {
  const first = 'species,acquired,notes\nCopiapoa cinerea,2024-05-01,from Uhlig\nLithops lesliei,2023-03-02,\nAloe polyphylla,2022-01-09,seed\n';
  const resaved = 'species,acquired,notes\nCopiapoa cinerea,01/05/2024,from Uhlig\nLithops lesliei,02/03/2023,\nAloe polyphylla,09/01/2022,seed\n';
  const ticked = 'species,acquired,notes,done\nCopiapoa cinerea,2024-05-01,from Uhlig,x\nLithops lesliei,2023-03-02,,x\nAloe polyphylla,2022-01-09,seed,x\n';
  for (const [what, text] of [['base: re-saved (dates rewritten)', resaved], ['base: with a column added', ticked]] as const) {
    it(`${what}: every line the first run added is here, and none is offered`, () => {
      const here = new Set(read(first).flatMap((r) => r.importKeys ?? []));
      const second = markAlreadyImported(markImported(read(text), (k) => here.has(k)), () => []);
      expect(second.filter((r) => !r.done && !r.drop && !r.already)).toEqual([]);
    });
  }
  it('base: a number a spreadsheet saved without its zeros keys the same line', () => {
    const a = read('number,species\n0012,Copiapoa cinerea\n'), b = read('number,species\n12,Copiapoa cinerea\n');
    expect(b[0].importKeys).toEqual(a[0].importKeys);
  });
  it('a line whose fields changed keys anew (it is another line)', () => {
    const a = read('species,notes\nCopiapoa cinerea,one\n'), b = read('species,notes\nCopiapoa cinerea,two\n');
    expect(b[0].importKeys).not.toEqual(a[0].importKeys);
  });
});

describe('numbered lines that look already imported start dropped (R3)', () => {
  it('base: written again as 0003 and 0004 before; now both dropped, whatever the plant\'s key', () => {
    const numbered = 'number,species,notes\n0001,Copiapoa cinerea,a\n0002,Lithops lesliei,b\n';
    const edited = 'number,species,notes\n0001,Copiapoa cinerea,a (repotted)\n0002,Lithops lesliei,b (repotted)\n';
    const firstRows = read(numbered);
    const here = new Set(firstRows.flatMap((r) => r.importKeys ?? []));
    const held = (no: string) => firstRows.filter((r) => r.number === no).map((r) => ({ taxonName: r.name, cultivar: null, importKey: r.importKeys![0] }));
    const second = markAlreadyImported(markImported(read(edited), (k) => here.has(k)), held);
    expect(second.map((r) => [r.already, r.drop])).toEqual([[true, true], [true, true]]);
  });
  it('base: the number compared without its zeros (12 in the sheet, 0012 here)', () => {
    const rows = read('number,species\n12,Copiapoa cinerea\n');
    const plants = [{ acc: '0012', taxonName: 'Copiapoa cinerea', cultivar: null, importKey: null }];
    const second = markAlreadyImported(rows, (no) => plants.filter((p) => numberKey(p.acc) === numberKey(no)));
    expect(second.map((r) => [r.already, r.drop])).toEqual([[true, true]]);
  });
});

describe('unnumbered lines changed since are said (R3)', () => {
  it('base: an edited note: the line is said as "looks already imported, changed", and kept', () => {
    const first = read('species,acquired,source,notes\nCopiapoa cinerea,2024-05-01,Uhlig,one\nLithops lesliei,2023-03-02,Mesa,\n');
    const plants = first.map((r) => ({ taxonName: r.name, cultivar: null, acquired: r.acquired, sourceFrom: r.source, importKey: r.importKeys![0] }));
    const edited = read('species,acquired,source,notes\nCopiapoa cinerea,2024-05-01,Uhlig,one now two heads\nLithops lesliei,2023-03-02,Mesa,\nAloe vera,2023-03-02,Mesa,\n');
    const here = new Set(plants.map((p) => p.importKey));
    const marked = markChanged(markImported(edited, (k) => here.has(k)), plants, new Set(edited.flatMap((r) => r.importKeys ?? [])));
    expect(marked.map((r) => [r.name, !!r.done, !!r.changed, r.drop])).toEqual([
      ['Copiapoa cinerea', false, true, false],
      ['Lithops lesliei', true, false, true],
      ['Aloe vera', false, false, false]
    ]);
  });
  it('a plant whose key this sheet still makes explains no other line: a second plant of one name, day and source is not said', () => {
    const first = read('species,acquired,source\nLithops lesliei,2023-03-02,Mesa\n');
    const plants = first.map((r) => ({ taxonName: r.name, cultivar: null, acquired: r.acquired, sourceFrom: r.source, importKey: r.importKeys![0] }));
    const more = read('species,acquired,source\nLithops lesliei,2023-03-02,Mesa\nLithops lesliei,2023-03-02,Mesa\n');
    const here = new Set(plants.map((p) => p.importKey));
    const marked = markChanged(markImported(more, (k) => here.has(k)), plants, new Set(more.flatMap((r) => r.importKeys ?? [])));
    expect(marked.map((r) => [!!r.done, !!r.changed])).toEqual([[true, false], [false, false]]);
  });
});

describe('passes of 2,000 lines (R4)', () => {
  it('base: a line dropped in the first pass stays dropped in the second, left out and counted', () => {
    const text = 'species,notes\n' + Array.from({ length: 2100 }, (_, i) => `Lithops lesliei,plant ${i + 1}`).join('\n') + '\n';
    const p1 = passOf(markImported(read(text), () => false), 2000);
    expect(p1.later).toBe(100);
    const dropped = new Set([p1.rows[4].key, p1.rows[5].key]);
    const droppedKeys = new Set(p1.rows.filter((r) => dropped.has(r.key)).flatMap((r) => r.importKeys!));
    const written = new Set(p1.rows.filter((r) => !dropped.has(r.key)).flatMap((r) => r.importKeys!));
    const p2 = passOf(markDroppedBefore(markImported(read(text), (k) => written.has(k)), droppedKeys), 2000);
    expect(p2.rows.filter((r) => dropped.has(r.key))).toEqual([]);
    expect([p2.done, p2.droppedBefore, p2.rows.length, p2.later]).toEqual([1998, 2, 100, 0]);
  });
});

describe('a line partly added keeps the sheet\'s pattern (R5)', () => {
  const text = 'number,species,qty\n0001,Lithops lesliei,3\n0002,Copiapoa cinerea,1\n0003,Aloe polyphylla,1\n';
  it('the first run numbers the further plants in the sheet\'s pattern', () => {
    const rows = read(text);
    expect(planNumbers(rows, [], DEFAULT_SCHEME, 2026).byRow.get(rows[0].key)!.numbers).toEqual(['0001', '0004', '0005']);
  });
  it('base: the second run, with the third plant missing, numbers it in the same pattern, and does not say it was renumbered', () => {
    const rows = read(text);
    const keys = rows[0].importKeys!;
    const here = new Set([keys[0], keys[1], ...rows[1].importKeys!, ...rows[2].importKeys!]);
    const second = markImported(rows, (k) => here.has(k));
    const taken = ['0001', '0002', '0003', '0004', '0005'];
    const plan = planNumbers(second, taken, DEFAULT_SCHEME, 2026, (n) => taken.includes(n));
    expect(plan.byRow.get(rows[0].key)!.numbers).toEqual(['0006']);
    expect(plan.renumbered).toEqual([]);
  });
});

describe('numbering stops at an unsafe integer (R3)', () => {
  it('base: three lines numbered past 2^53 plan in finite time, the rest by this collection\'s rule', () => {
    const rows = read('number,species\n9007199254740993,Copiapoa cinerea\n9007199254740993,Lithops lesliei\n9007199254740993,Aloe vera\n');
    const plan = planNumbers(rows, [], DEFAULT_SCHEME, 2026);
    const nos = rows.map((r) => plan.byRow.get(r.key)!.numbers[0]);
    expect(nos[0]).toBe('9007199254740993');
    expect(nos.slice(1)).toEqual(['2026-0001', '2026-0002']);
  });
});

/* ---- removed plants' keys count, through the collection ---- */
type Mem = { changes: Change[]; meta: Map<string, unknown> };
let mem: Mem = { changes: [], meta: new Map() };
vi.mock('$lib/db/vault', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m: any = {
    allChanges: async () => [...mem.changes],
    appendChanges: async (c: Change[]) => { mem.changes.push(...c); return { kept: c, replaced: [], seq: 0, first: 0 }; },
    getMeta: async (k: string) => mem.meta.get(k),
    setMeta: async (k: string, v: unknown) => void mem.meta.set(k, v),
    deviceId: async () => 'testdevice',
    requestPersistence: async () => true
  };
  m.appendChangesClaiming = async (_k: string, known: Set<string>, build: (s: Set<string>) => { changes: Change[]; result: unknown }) => { const b = build(new Set(known)); await m.appendChanges(b.changes); return b.result; };
  Object.assign(m, { onOtherTabWrite: () => () => {}, readFold: async () => undefined, writeFold: async () => false, foldGen: async () => 0, dropFold: async () => {}, parkStamps: async (st: string[]) => st, lastArrival: async () => 0, arrivalsAfter: async () => ({ changes: [], seq: 0, gen: 0 }), changeKeys: async () => mem.changes.map((c) => c.t), changesByKeys: async (ts: string[]) => mem.changes.filter((c) => ts.includes(c.t)), updateMeta: async (k: string, fn: (had: unknown) => unknown) => { const next = fn(mem.meta.get(k)); mem.meta.set(k, next); return next; }, changesOf: async () => [], holdVault: async (work: () => Promise<unknown>) => work(), announceSyncForgotten: () => {} });
  return m;
});

describe('removed plants count (R3)', () => {
  it('base: a plant removed after an import is not added back by the next run; the commit leaves it out too', async () => {
    vi.resetModules();
    mem = { changes: [], meta: new Map() };
    const { collection } = await import('$lib/db/collection.svelte');
    const { commitImport } = await import('$lib/import/commit');
    await collection.load();
    const sheet = 'species\nCopiapoa cinerea\nLithops lesliei\n';
    const rows = read(sheet);
    await commitImport(rows, new Map(), planNumbers(rows, [], collection.scheme, 2026), { makePlaces: false });
    const gone = collection.accessions.find((a) => a.taxonName === 'Lithops lesliei')!;
    await collection.remove('accession', gone.id);
    const again = read(sheet);
    const here = new Set(collection.allAccessions().map((a) => a.importKey).filter((k): k is string => !!k));
    expect(markImported(again, (k) => here.has(k)).map((r) => !!r.done)).toEqual([true, true]);
    // And the commit's own check (another tab's import, read at the write) counts it too.
    const res = await commitImport(again as ImportRow[], new Map(), planNumbers(again, [], collection.scheme, 2026), { makePlaces: false });
    expect(res.added).toEqual([]);
    expect(collection.accessions.map((a) => a.taxonName)).toEqual(['Copiapoa cinerea']);
  });
});

describe('a date in the key does not hang on the day-first answer (R3)', () => {
  it('09/03/2024 read day first, left as written, or saved as 2024-03-09 keys one line', () => {
    const a = read('species,acquired\nCopiapoa cinerea,09/03/2024\n', 'dmy');
    const b = read('species,acquired\nCopiapoa cinerea,09/03/2024\n', null);
    const c = read('species,acquired\nCopiapoa cinerea,2024-03-09\n', null);
    expect(b[0].importKeys).toEqual(a[0].importKeys);
    expect(c[0].importKeys).toEqual(a[0].importKeys);
    expect(read('species,acquired\nCopiapoa cinerea,2024-03-10\n', null)[0].importKeys).not.toEqual(a[0].importKeys);
  });
});
