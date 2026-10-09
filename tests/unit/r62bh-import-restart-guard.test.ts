// Triage-self review of round sixty-two: a GUARD (passes on the merge). The records review 1 scenario (a sheet with no number column, cut off, run again) through the import page's own composition (markImported, markAlreadyImported, passOf, planNumbers, commitImport). The review's own reproduction calls markAlreadyImported alone, which is now only the warning. Adopted by the harness as a guard (round sixty-two second pass; the verification triage-self review). Run: npx vitest run tests/unit/r62bh-import-restart-guard.test.ts
/**
 * Self-review of round sixty-one, records area: the import's restart claim.
 *
 * /about/formats says: "Each line is its own change, so an import cut off partway keeps the lines before it, and running
 * it again skips them." `markAlreadyImported` skips only a line whose own number a live plant here holds under the same
 * name, so a second run files again every line that had no number in the sheet, and every line whose name the review
 * changed ("Use it", or an edit of the name box).
 *
 * FAILS on f4ab4f8 (both tests are reproductions). Run: npx vitest run tests/unit/records--r61-import-restart.test.ts
 */
import { describe, it, expect, vi } from 'vitest';
import type { Change } from '$core/log';
import { parseCsv, detectHeader, guessMapping } from '$lib/import/csv';
import { rowsFromSheet } from '$lib/import/rows';
import { planNumbers, markAlreadyImported, markImported, passOf } from '$lib/import/plan';

const TODAY = '2026-10-07';
const sheetOf = (text: string) => { const s = parseCsv(text); const h = detectHeader(s); return rowsFromSheet(s, guessMapping(s, h), h, TODAY).rows; };

const mem: { changes: Change[]; meta: Map<string, unknown>; appends: number; failAt: number } = { changes: [], meta: new Map(), appends: 0, failAt: Infinity };
vi.mock('$lib/db/vault', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m: any = {
    allChanges: async () => [...mem.changes],
    appendChanges: async (c: Change[]) => { if (++mem.appends >= mem.failAt) throw new Error('the tab was closed'); mem.changes.push(...c); return { kept: c, replaced: [] }; },
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


// As the import page composes it (src/routes/plants/import/+page.svelte, review()).
async function review(text: string) {
  const { collection } = await import('$lib/db/collection.svelte');
  const here = new Set<string>();
  for (const a of collection.accessions) if ((a as { importKey?: string }).importKey) here.add((a as { importKey?: string }).importKey!);
  const marked = markAlreadyImported(markImported(sheetOf(text), (k) => here.has(k), () => false), (no) => collection.withNumber('accession', no) as never);
  const pass = passOf(marked, 2000);
  const live = pass.rows.filter((r) => !r.drop);
  return { rows: pass.rows, live, plan: planNumbers(pass.rows, collection.accessions.map((a) => a.acc!), collection.scheme, 2026, (n) => collection.isNumberTaken(n)) };
}
describe('triage-self: the records review 1 and grower 3, through the page composition of round sixty-two', () => {
  it('a sheet with no number column cut off partway: the second run adds only the rest', async () => {
    const { collection } = await import('$lib/db/collection.svelte');
    const { commitImport } = await import('$lib/import/commit');
    await collection.load();
    const sheet = 'species,acquired\nCopiapoa cinerea,2019\nCopiapoa humilis,2020-05\nLithops lesliei,2021-03-04\nAloe vera,\n';
    const a = await review(sheet);
    mem.failAt = mem.appends + 3;
    await commitImport(a.rows, new Map(), a.plan, { makePlaces: false, thisYear: 2026, chunk: 1 }).catch(() => null);
    const first = collection.accessions.map((x) => x.taxonName).sort();
    mem.failAt = Infinity;
    const b = await review(sheet);
    await commitImport(b.rows, new Map(), b.plan, { makePlaces: false, thisYear: 2026 });
    const names = collection.accessions.map((x) => x.taxonName).sort();
    expect({ first: first.length > 0 && first.length < 4, names }).toEqual({ first: true, names: ['Aloe vera', 'Copiapoa cinerea', 'Copiapoa humilis', 'Lithops lesliei'] });
  });
});
