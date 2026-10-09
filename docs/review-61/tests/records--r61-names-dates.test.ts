/**
 * Self-review of round sixty-one, records area: open names and partial dates.
 *
 * Reproductions (FAIL on f4ab4f8):
 *  - "nr." and "cfr." (the other common ways of writing "near" and "compare") are dropped from the name without a word,
 *    so "Mammillaria nr. bombycina" is filed as Mammillaria bombycina, at species rank, with the reference's key.
 *  - Today's and the plants list's "no photograph in twelve months" rule reads a year-only `acquired` as 1 January: a plant
 *    imported today with "2026" counts as kept six months or more (rule 3: no guessing).
 *  - A year-only row of several plants is written one plant at a time: commit.ts's `mintYear` was not given the
 *    merge's `yearOf` change, so the round's own "the collection mints that year's number" does not reach the import.
 *  - A Status or Kind the import cannot take ("sold", "Died 2023", "Cactus") is said on the row and then dropped: the
 *    plant is filed as growing and the word is in neither the record nor the notes (Provenance's is kept in the notes).
 * Guards (PASS): the qualifiers the round names; every partial date through the backup's sheet and back.
 *
 * Run: npx vitest run tests/unit/records--r61-names-dates.test.ts
 */
import { describe, it, expect, vi } from 'vitest';
import type { Change } from '$core/log';
import { parseName } from '$core/names';
import { photoDue } from '$lib/ui/photo-due';
import { parseCsv, detectHeader, guessMapping } from '$lib/import/csv';
import { rowsFromSheet } from '$lib/import/rows';
import { planNumbers } from '$lib/import/plan';
import { recordOf } from '$lib/import/commit';
import { plantsCsv } from '$lib/backup/backup';

const TODAY = '2026-10-07';
const sheetOf = (text: string) => { const s = parseCsv(text); const h = detectHeader(s); return rowsFromSheet(s, guessMapping(s, h), h, TODAY).rows; };

describe('open names (decision 3: "cf.", "aff.", "sp." and "nov." stay in the name)', () => {
  it.each(['Mammillaria nr. bombycina', 'Mammillaria cfr. bombycina'])('%s keeps its qualifier, and is not filed at species rank', (typed) => {
    const p = parseName(typed);
    // On f4ab4f8: "Mammillaria bombycina", the qualifier gone, and nothing in the record says the sheet doubted it.
    expect(p.scientific).not.toBe('Mammillaria bombycina');
    const rec = recordOf(sheetOf(`species\n${typed}\n`)[0], { s: 'found', slug: 'mammillaria-bombycina', refName: 'Mammillaria bombycina', key: 7 }, null);
    expect(rec.taxonKey === null || rec.nameAsReceived === typed).toBe(true);
  });
  it.each([['Mammillaria cf. bombycina', 'cf.'], ['Mammillaria aff. bombycina', 'aff.'], ['Lithops sp. C 036', 'sp.'], ['Conophytum sp nov', 'sp.']])('GUARD: %s keeps %s', (typed, q) => {
    expect(parseName(typed).qualifier).toBe(q);
    expect(parseName(typed).scientific).toContain(q);
  });
});

describe('a value a field cannot take is kept (rows.ts: "its text kept in the notes, never guessed and never dropped")', () => {
  it('Status "sold" and "Died 2023", and Kind "Cactus", reach the notes', () => {
    const rows = sheetOf('species,kind,status\nCopiapoa cinerea,Cactus,sold\nAloe vera,,Died 2023\n');
    // On f4ab4f8: both filed as growing, notes null; the words are only in the review's problem text.
    expect(rows[0].notes ?? '').toContain('sold');
    expect(rows[0].notes ?? '').toContain('Cactus');
    expect(rows[1].notes ?? '').toContain('Died 2023');
  });
});

describe('a partial date through its readers', () => {
  const src = { photos: () => [], madeOn: () => '2026-10-07' };
  const days = { yearAgo: '2025-10-07', halfYearAgo: '2026-04-07' };
  it('the photo rule does not read "2026" or "2026-04" as the first day of the period (a plant imported today)', () => {
    // On f4ab4f8 both count: "2026" < "2026-04-07" and "2026-04" < "2026-04-07" as strings.
    expect(photoDue({ id: 'r1', status: 'growing', acquired: '2026' }, src, days)).toBe(false);
    expect(photoDue({ id: 'r2', status: 'growing', acquired: '2026-04' }, src, days)).toBe(false);
  });
  it('GUARD: a period that ended six months ago or more counts', () => {
    expect(photoDue({ id: 'r3', status: 'growing', acquired: '2025' }, src, days)).toBe(true);
    expect(photoDue({ id: 'r4', status: 'growing', acquired: '2026-03' }, src, days)).toBe(true);
  });
  it('GUARD: "2009", "2017-08" and a full date go out in plants.csv and come back as they were', () => {
    const accs = [['r1', '2009-0001', '2009'], ['r2', '2017-0001', '2017-08'], ['r3', '2024-0001', '2024-03-09']].map(([id, acc, acquired]) => ({ id, kind: 'accession', _t: '0', acc, taxonName: 'Copiapoa cinerea', status: 'growing', acquired }));
    const csv = plantsCsv(accs as never, new Map());
    expect(sheetOf(csv).map((r) => r.acquired)).toEqual(['2009', '2017-08', '2024-03-09']);
  });
});

const mem: { changes: Change[]; meta: Map<string, unknown>; appends: number } = { changes: [], meta: new Map(), appends: 0 };
vi.mock('$lib/db/vault', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m: any = { allChanges: async () => [...mem.changes], appendChanges: async (c: Change[]) => { mem.appends++; mem.changes.push(...c); return { kept: c, replaced: [] }; }, getMeta: async (k: string) => mem.meta.get(k), setMeta: async (k: string, v: unknown) => void mem.meta.set(k, v), deviceId: async () => 'testdevice', requestPersistence: async () => true };
  m.appendChangesClaiming = async (_k: string, known: Set<string>, build: (s: Set<string>) => { changes: Change[]; result: unknown }) => { const b = build(new Set(known)); await m.appendChanges(b.changes); return b.result; };
  Object.assign(m, { onOtherTabWrite: () => () => {}, readFold: async () => undefined, writeFold: async () => false, foldGen: async () => 0, dropFold: async () => {}, parkStamps: async (st: string[]) => st, lastArrival: async () => 0, arrivalsAfter: async () => ({ changes: [...mem.changes], seq: 0, gen: 0 }), changeKeys: async () => mem.changes.map((c) => c.t), changesByKeys: async (ts: string[]) => mem.changes.filter((c) => ts.includes(c.t)), updateMeta: async (k: string, fn: (had: unknown) => unknown) => { const next = fn(mem.meta.get(k)); mem.meta.set(k, next); return next; }, changesOf: async (kind: string, id: string) => mem.changes.filter((c) => c.kind === kind && c.id === id), holdVault: async (work: () => Promise<unknown>) => work(), announceSyncForgotten: () => {} });
  return m;
});

describe('numbering a year-only row', () => {
  it('a row "Copiapoa cinerea, 2009, Qty 3" is three plants in one commit, numbered 2009, as the add form\'s "How many" is', async () => {
    const { collection } = await import('$lib/db/collection.svelte');
    const { commitImport } = await import('$lib/import/commit');
    await collection.load();
    const rows = sheetOf('species,acquired,qty\nCopiapoa cinerea,2009,3\n');
    const plan = planNumbers(rows, [], collection.scheme, 2026, (n) => collection.isNumberTaken(n));
    const before = mem.appends;
    const res = await commitImport(rows, new Map(), plan, { makePlaces: false, thisYear: 2026 });
    expect(res.added.map((a) => a.acc)).toEqual(['2009-0001', '2009-0002', '2009-0003']);
    // On f4ab4f8: 1 + 3 (the species record, then one commit per plant), so a stop between them leaves a part-row that
    // a second run then skips whole as "already imported".
    expect(mem.appends - before).toBe(1 + 1);
  });
});
