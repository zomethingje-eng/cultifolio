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
import { planNumbers, markAlreadyImported } from '$lib/import/plan';

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

describe('running an import again after it was cut off (records self-review of round 61)', () => {
  it('a sheet with no number column: the lines the first run added are not filed a second time', async () => {
    const { collection } = await import('$lib/db/collection.svelte');
    const { commitImport } = await import('$lib/import/commit');
    await collection.load();
    const sheet = 'species,acquired\nCopiapoa cinerea,2019\nCopiapoa humilis,2020-05\nLithops lesliei,2021-03-04\nAloe vera,\n';
    const first = markAlreadyImported(sheetOf(sheet), (no) => collection.withNumber('accession', no) as never);
    const plan1 = planNumbers(first, [], collection.scheme, 2026, (n) => collection.isNumberTaken(n));
    mem.failAt = mem.appends + 4; // the species records and two plants are written, then the tab closes
    const r1 = await commitImport(first, new Map(), plan1, { makePlaces: false, thisYear: 2026 });
    expect(r1.added.map((a) => a.taxonName)).toEqual(['Copiapoa cinerea', 'Copiapoa humilis']);
    mem.failAt = Infinity;
    // The grower opens Import again and gives it the same sheet.
    const again = markAlreadyImported(sheetOf(sheet), (no) => collection.withNumber('accession', no) as never);
    const plan2 = planNumbers(again, collection.accessions.map((a) => a.acc!), collection.scheme, 2026, (n) => collection.isNumberTaken(n));
    await commitImport(again, new Map(), plan2, { makePlaces: false, thisYear: 2026 });
    // On f4ab4f8: two of each, 2019-0001 and 2019-0002, 2020-0001 and 2020-0002.
    expect(collection.accessions.filter((a) => a.taxonName === 'Copiapoa cinerea').length).toBe(1);
    expect(collection.accessions.filter((a) => a.taxonName === 'Copiapoa humilis').length).toBe(1);
  });

  it('a numbered line whose name the review changed ("Use it": cinera to cinerea) is recognised on the second run', async () => {
    const { recordOf } = await import('$lib/import/commit');
    const sheet = 'number,species\n2024-0001,Copiapoa cinera\n';
    // First run: the review offered "did you mean Copiapoa cinerea?" and the grower pressed Use it (the page's
    // useSuggestion replaces the row's name), then Add filed this record.
    const row = { ...sheetOf(sheet)[0], name: 'Copiapoa cinerea' };
    const filed = recordOf(row, { s: 'found', slug: 'copiapoa-cinerea', refName: 'Copiapoa cinerea', key: 5384013 }, null);
    const held = (no: string) => (no === '2024-0001' ? [filed] : []);
    const again = markAlreadyImported(sheetOf(sheet), held as never);
    // On f4ab4f8: not marked, so the review renumbers it (2024-0001 -> 2024-0002) and files the plant twice.
    expect(again[0].already).toBe(true);
  });
});
