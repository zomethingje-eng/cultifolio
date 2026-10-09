/**
 * Triage reviewer, round sixty-one self-review. FAILS on f4ab4f8 (a reproduction of a seam): the import's commit keeps its
 * own copy of the collection's "which year does the collection mint for" rule (`mintYear` in src/lib/import/commit.ts,
 * regex /^\d{4}-/), written before the merge changed the collection's `yearOf` to /^\d{4}(?:-|$)/ (agent G's need 3).
 * So a sheet row of three plants acquired "2009" is still written one plant at a time (three commits, and a stop part way
 * leaves part of a line), though one `addAccessions(3, ...)` now mints 2009-0001..0003 itself.
 * Run: npx vitest run tests/unit/triage--import-year-seam.test.ts
 */
import { describe, it, expect, vi } from 'vitest';
import type { Change } from '$core/log';
import { parseCsv, readDate, detectHeader, guessMapping, cellText, SheetError } from '$lib/import/csv';
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


describe('import commit and the collection agree on the year a year-only date mints for', () => {
  it('a row of three plants acquired "2009" is one commit, numbered 2009-0001 to 2009-0003', async () => {
    const { collection, commitImport } = await fresh();
    const s = parseCsv('species,qty,acquired\nCopiapoa cinerea,3,2009\n');
    const h = detectHeader(s);
    const { rows } = rowsFromSheet(s, guessMapping(s, h), h, '2026-10-05');
    expect(rows[0].qty).toBe(3);
    expect(rows[0].acquired).toBe('2009');
    const plan = planNumbers(rows, [], collection.scheme, 2026, (n) => collection.isNumberTaken(n));
    const before = mem.writes;
    const res = await commitImport(rows, new Map(), plan, { makePlaces: true, thisYear: 2026 });
    expect(res.failed).toBeNull();
    expect(collection.accessions.map((a) => a.acc).sort()).toEqual(['2009-0001', '2009-0002', '2009-0003']);
    // the species record is one write; the plants should be one more (one line, one change), not three
    expect(mem.writes - before).toBe(2);
  });
});
