/**
 * Round sixty-one self-review, the grower: an import's numbers and its second run.
 *
 * FAILS on f4ab4f8 (reproductions):
 *  1. The review shows each plant's number from `planNumbers`, which numbers rows in sheet order; `commitImport` writes rows
 *     that keep their own number first, and lets the collection mint the extra plants of a Qty row. So a plant without a
 *     number planned as 2026-0001 is given 2026-0003, and the result says its number "was taken". /about/formats says
 *     "The numbers shown in the review are the numbers given."
 *  2. A second run of the same sheet adds again every line that had no number of its own, every line the first run had to
 *     renumber, and every line whose name the grower corrected in the review: none is "already imported".
 * Run: npx vitest run tests/unit/grower--import-numbers.test.ts   (lives in tests/unit/)
 */
import { describe, it, expect, vi } from 'vitest';
import type { Change } from '$core/log';
import { parseCsv, detectHeader, guessMapping } from '$lib/import/csv';
import { rowsFromSheet } from '$lib/import/rows';
import { planNumbers, markAlreadyImported } from '$lib/import/plan';

const TODAY = '2026-10-07';
const sheetOf = (text: string) => { const s = parseCsv(text); const h = detectHeader(s); return rowsFromSheet(s, guessMapping(s, h), h, TODAY).rows; };

const mem: { changes: Change[]; meta: Map<string, unknown> } = { changes: [], meta: new Map() };
vi.mock('$lib/db/vault', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m: any = {
    allChanges: async () => [...mem.changes],
    appendChanges: async (c: Change[]) => { mem.changes.push(...c); return { kept: c, replaced: [] }; },
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

describe('an import gives the numbers its review showed, and a second run adds nothing twice', () => {
  it('each plant is given the number the review showed it (sheet order vs write order)', async () => {
    const { collection } = await import('$lib/db/collection.svelte');
    const { commitImport } = await import('$lib/import/commit');
    await collection.load();
    // Line 2 has no number; line 3 keeps its own and is three plants. Neither has a date: both mint for this year.
    const rows = sheetOf('number,species,qty\n,Aloe vera,1\n0002,Copiapoa cinerea,3\n');
    const plan = planNumbers(rows, [], collection.scheme, 2026, (n) => collection.isNumberTaken(n));
    const shown = Object.fromEntries(rows.map((r) => [r.name, plan.byRow.get(r.key)!.numbers]));
    // On f4ab4f8 the review shows Aloe vera 2026-0001 and Copiapoa cinerea 0002, 2026-0002, 2026-0003.
    const res = await commitImport(rows, new Map(), plan, { makePlaces: false, thisYear: 2026 });
    const given: Record<string, string[]> = {};
    for (const a of res.added) (given[a.taxonName] ??= []).push(a.acc);
    expect(given).toEqual(shown); // on f4ab4f8 given: Aloe vera 2026-0003, Copiapoa cinerea 0002, 2026-0001, 2026-0002
    expect(res.renumbered).toEqual([]); // on f4ab4f8: "line 2, 2026-0001 → 2026-0003": "taken", by this import itself
  });

  it('a second run of the same sheet finds every line the first run added', async () => {
    const { collection } = await import('$lib/db/collection.svelte');
    const { commitImport } = await import('$lib/import/commit');
    // A line with no number, two lines giving the same number, and a misspelt name the grower corrects in the review.
    const text = 'number,species\n,Lithops lesliei\n0010,Haworthia truncata\n0010,Haworthia cooperi\n0011,Copiapoa cinera\n';
    const first = sheetOf(text);
    first[3] = { ...first[3], name: 'Copiapoa cinerea' }; // "did you mean Copiapoa cinerea? Use it"
    const plan = planNumbers(first, collection.accessions.map((a) => a.acc), collection.scheme, 2026, (n) => collection.isNumberTaken(n));
    const res = await commitImport(first, new Map(), plan, { makePlaces: false, thisYear: 2026 });
    expect(res.failed).toBeNull();
    const again = markAlreadyImported(sheetOf(text), (no) => collection.withNumber('accession', no) as Array<{ taxonName: string; cultivar?: string | null }>);
    // On f4ab4f8 only line 3 (0010 Haworthia truncata) is found; lines 2, 4 and 5 would be added a second time.
    expect(again.filter((r) => !r.already).map((r) => r.line)).toEqual([]);
  });
});
