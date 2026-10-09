/**
 * Round sixty-two, second pass, agent G: two tabs importing the same sheet (the verification data review, 4). Each
 * tab's review is drawn before either writes; the second tab's Add now finds, as it writes, the plants the first wrote
 * by their import keys, and leaves them out, said in the result. Real vault over fake IndexedDB; two module instances
 * are two tabs sharing it. Adopted from /tmp/r62rev/out/tests/data--import-two-tabs.test.ts, with the tab that has not
 * caught up, and a line partly written by the other tab.
 */
import 'fake-indexeddb/auto';
import { wipeMeta } from './helpers/isolate';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const ls = new Map<string, string>();
const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const TODAY = '2026-10-07';
async function tab() {
  vi.resetModules();
  const vault = await import('$lib/db/vault');
  const { collection } = await import('$lib/db/collection.svelte');
  const { commitImport } = await import('$lib/import/commit');
  const plan = await import('$lib/import/plan');
  const csv = await import('$lib/import/csv');
  const { rowsFromSheet } = await import('$lib/import/rows');
  await collection.load();
  const sheetOf = (text: string) => { const s = csv.parseCsv(text); const h = csv.detectHeader(s); return rowsFromSheet(s, csv.guessMapping(s, h), h, TODAY).rows; };
  const review = (text: string) => {
    const rows = sheetOf(text);
    const here = new Set(collection.accessions.map((a) => a.importKey).filter((k): k is string => !!k));
    const marked = plan.markAlreadyImported(plan.markImported(rows, (k) => here.has(k), (id) => collection.accession(id)?.id === id), (no) => collection.withNumber('accession', no) as never);
    const pass = plan.passOf(marked, 2000);
    return { rows: pass.rows, plan: plan.planNumbers(pass.rows, collection.accessions.map((a) => a.acc!), collection.scheme, 2026, (n) => collection.isNumberTaken(n)) };
  };
  return { vault, collection, commitImport, review };
}
beforeEach(async () => {
  ls.clear();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k: string) => ls.get(k) ?? null, setItem: (k: string, v: string) => void ls.set(k, v), removeItem: (k: string) => void ls.delete(k) } });
  vi.resetModules();
  const vault = await import('$lib/db/vault');
  await vault.wipeVault();
  await wipeMeta(vault);
  await vault.setMeta('device', 'aaaaaaaaaaaa');
});
afterEach(() => { if (had) Object.defineProperty(globalThis, 'localStorage', had); else delete (globalThis as { localStorage?: unknown }).localStorage; });

const SHEET = 'species,qty\nCopiapoa cinerea,1\nLithops lesliei,2\nAloe vera,1\n';

describe('two tabs import the same sheet', () => {
  it('each plant once: the second tab, caught up, finds the lines the first wrote and says so', { timeout: 60_000 }, async () => {
    const B = await tab();
    const rb = B.review(SHEET);
    const A = await tab();
    const ra = A.review(SHEET);
    expect((await A.commitImport(ra.rows, new Map(), ra.plan, { makePlaces: false })).failed).toBeNull();
    await (B.collection as unknown as { catchUp(): Promise<void> }).catchUp();
    const resB = await B.commitImport(rb.rows, new Map(), rb.plan, { makePlaces: false });
    const keys = B.collection.accessions.map((a) => a.importKey);
    expect(new Set(keys).size).toBe(keys.length); // base: every key twice
    expect(B.collection.accessions).toHaveLength(4); // base: 8
    expect(resB.failed).toBeNull();
    expect(resB.added).toEqual([]);
    expect(resB.renumbered).toEqual([]); // base: four "renumbered" lines
    expect(resB.alreadyHere).toEqual([{ line: 2, plants: 1, whole: true }, { line: 3, plants: 2, whole: true }, { line: 4, plants: 1, whole: true }]);
    expect(resB.doneKeys.sort()).toEqual(rb.rows.map((r) => r.key).sort());
  });
  it('the second tab that has not heard the first\'s writes yet does the same, rather than stop at its first line', { timeout: 60_000 }, async () => {
    const B = await tab();
    const rb = B.review(SHEET);
    const A = await tab();
    const ra = A.review(SHEET);
    await A.commitImport(ra.rows, new Map(), ra.plan, { makePlaces: false });
    const resB = await B.commitImport(rb.rows, new Map(), rb.plan, { makePlaces: false }); // no catch-up first
    expect(resB.failed).toBeNull(); // base: "Plant number 2026-0001 is already used. A number is never reused; pick another."
    expect(resB.added).toEqual([]);
    expect(B.collection.accessions).toHaveLength(4);
  });
  it('a line the other tab wrote in part: the rest is written, under the numbers this review showed for them', { timeout: 60_000 }, async () => {
    const B = await tab();
    const rb = B.review('species,qty\nLithops lesliei,3\n');
    const shown = rb.plan.byRow.get(rb.rows[0].key)!.numbers;
    const A = await tab();
    const ra = A.review('species,qty\nLithops lesliei,3\n');
    // The other tab's import cut off after the line's first plant.
    const cut = [{ ...ra.rows[0], qty: 1, importKeys: ra.rows[0].importKeys!.slice(0, 1) }];
    await A.commitImport(cut, new Map(), { ...ra.plan, byRow: new Map([[ra.rows[0].key, { numbers: shown.slice(0, 1), kept: false, given: null }]]) }, { makePlaces: false });
    const resB = await B.commitImport(rb.rows, new Map(), rb.plan, { makePlaces: false });
    expect(resB.failed).toBeNull();
    expect(resB.alreadyHere).toEqual([{ line: 2, plants: 1, whole: false }]);
    expect(resB.added.map((a) => a.acc)).toEqual(shown.slice(1));
    expect(resB.renumbered).toEqual([]);
    const keys = B.collection.accessions.map((a) => a.importKey).sort();
    expect(keys).toEqual([...rb.rows[0].importKeys!].sort());
  });
  it('one tab alone is not slowed or changed: every line written, nothing said as here', { timeout: 60_000 }, async () => {
    const A = await tab();
    const ra = A.review(SHEET);
    const res = await A.commitImport(ra.rows, new Map(), ra.plan, { makePlaces: false });
    expect(res.alreadyHere).toEqual([]);
    expect(res.added).toHaveLength(4);
  });
});
