/**
 * Round sixty-two, agent G: the import keeps its promises (docs/REVIEW-TRIAGE-61.md, decision 4). Numbers given
 * explicitly, import keys for restarts, one year rule, passes over 2,000 lines, "Use it", open names, unread fields, the
 * place paths, the dates, Qty and the price of a Qty row. Adopts the self-review's reproductions (grower--import-numbers,
 * records--r61-import-restart, records--r61-names-dates' import parts, triage--import-year-seam) and review B's 6.
 * The commit runs against an in-memory vault, as the collection's own tests stand it in.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Change } from '$core/log';
import { parseName, tidyName } from '$core/names';
import { yearOf } from '$core/year';
import { parseCsv, readDate, detectHeader, guessMapping, ambiguousDates } from '$lib/import/csv';
import { parsePaste } from '$lib/import/paste';
import { rowsFromSheet, rowsFromPaste } from '$lib/import/rows';
import { planNumbers, markAlreadyImported, markImported, passOf, keyLines, lineHash, loosePaths, asPath, useSpecies, type ImportRow } from '$lib/import/plan';
import { recordOf } from '$lib/import/commit';

const TODAY = '2026-10-07';
const sheetOf = (text: string) => { const s = parseCsv(text); const h = detectHeader(s); return rowsFromSheet(s, guessMapping(s, h), h, TODAY).rows; };

type Mem = { changes: Change[]; meta: Map<string, unknown>; appends: number; failAt: number };
let mem: Mem = { changes: [], meta: new Map(), appends: 0, failAt: Infinity };
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
  Object.assign(m, { onOtherTabWrite: () => () => {}, readFold: async () => undefined, writeFold: async () => false, foldGen: async () => 0, dropFold: async () => {}, parkStamps: async (st: string[]) => st, lastArrival: async () => 0, arrivalsAfter: async () => ({ changes: [...mem.changes], seq: 0, gen: 0 }), changeKeys: async () => mem.changes.map((c) => c.t), changesByKeys: async (ts: string[]) => mem.changes.filter((c) => ts.includes(c.t)), updateMeta: async (k: string, fn: (had: unknown) => unknown) => { const next = fn(mem.meta.get(k)); mem.meta.set(k, next); return next; }, changesOf: async (kind: string, id: string) => mem.changes.filter((c) => c.kind === kind && c.id === id), holdVault: async (work: () => Promise<unknown>) => work(), announceSyncForgotten: () => {} });
  return m;
});

async function fresh() {
  vi.resetModules();
  mem = { changes: [], meta: new Map(), appends: 0, failAt: Infinity };
  const { collection } = await import('$lib/db/collection.svelte');
  await collection.load();
  const { commitImport } = await import('$lib/import/commit');
  /** What the import page does with a sheet's rows: the keys, the warning, one pass, the plan. */
  const review = (rows: ImportRow[], max = 2000) => {
    const here = new Set(collection.accessions.map((a) => a.importKey).filter((k): k is string => !!k));
    const marked = markAlreadyImported(markImported(rows, (k) => here.has(k), (id) => collection.accession(id)?.id === id), (no) => collection.withNumber('accession', no) as never);
    const pass = passOf(marked, max);
    const plan = planNumbers(pass.rows, collection.accessions.map((a) => a.acc!), collection.scheme, 2026, (n) => collection.isNumberTaken(n));
    return { ...pass, plan };
  };
  const run = async (rows: ImportRow[], max = 2000, chunk = 50) => { const r = review(rows, max); return { ...r, res: await commitImport(r.rows, new Map(), r.plan, { makePlaces: false, chunk }) }; };
  const names = () => collection.accessions.map((a) => `${a.acc} ${a.taxonName}`).sort();
  return { collection, commitImport, review, run, names };
}

describe('numbers given explicitly: the numbers the review shows are the numbers given, plant by plant (the grower review, 2)', () => {
  it('an unnumbered line before a numbered Qty row keeps the number it was shown', async () => {
    const { collection, commitImport } = await fresh();
    const rows = sheetOf('number,species,qty\n,Aloe vera,1\n0002,Copiapoa cinerea,3\n');
    const plan = planNumbers(rows, [], collection.scheme, 2026, (n) => collection.isNumberTaken(n));
    const shown = Object.fromEntries(rows.map((r) => [r.name, plan.byRow.get(r.key)!.numbers]));
    const res = await commitImport(rows, new Map(), plan, { makePlaces: false });
    const given: Record<string, string[]> = {};
    for (const a of res.added) (given[a.taxonName] ??= []).push(a.acc!);
    expect(given).toEqual(shown); // base: Aloe vera 2026-0003, and "line 2, 2026-0001 → 2026-0003" said as taken
    expect(res.renumbered).toEqual([]);
  });
  it('a number taken by another tab after the review gets the next free one, said', async () => {
    const { collection, commitImport } = await fresh();
    const rows = sheetOf('species,qty\nAloe vera,2\n');
    const plan = planNumbers(rows, [], collection.scheme, 2026, (n) => collection.isNumberTaken(n));
    await collection.addAccession({ taxonName: 'Lithops lesliei', acc: '2026-0002' });
    const res = await commitImport(rows, new Map(), plan, { makePlaces: false });
    expect(res.failed).toBeNull();
    expect(res.added.map((a) => a.acc)).toEqual(['2026-0001', '2026-0003']);
    expect(res.renumbered).toEqual([{ line: 2, given: '2026-0002', got: '2026-0003' }]);
  });
  it('a year-only row of three is one commit, numbered for its year (the records review, 10; the triage, 2; B6)', async () => {
    const { run } = await fresh();
    const before = mem.appends;
    const { res } = await run(sheetOf('species,acquired,qty\nCopiapoa cinerea,2009,3\n'));
    expect(res.added.map((a) => a.acc)).toEqual(['2009-0001', '2009-0002', '2009-0003']);
    expect(mem.appends - before).toBe(1 + 1); // the species record, then the row: base 1 + 3
  });
  it('one year rule: "2024" as well as "2024-05" and "2024-05-01"', () => {
    expect([yearOf('2024'), yearOf('2024-05'), yearOf('2024-05-01'), yearOf('24/05/2024'), yearOf(null)]).toEqual([2024, 2024, 2024, undefined, undefined]);
  });
});

describe('lines in groups: the cost that grew with every commit (A, decision 3)', () => {
  it('120 lines are three commits of up to 50 plants, numbered as the review showed', async () => {
    const { run, collection } = await fresh();
    const rows = sheetOf('species,qty\n' + Array.from({ length: 120 }, (_, i) => `Aloe vera,${i === 0 ? 3 : 1}`).join('\n') + '\n');
    const before = mem.appends;
    const { res, plan } = await run(rows);
    expect(mem.appends - before).toBe(1 + 3); // the species record, then 50 + 50 + 22 plants; base: 120 commits
    expect(res.added.map((a) => a.acc)).toEqual(rows.flatMap((r) => plan.byRow.get(r.key)!.numbers));
    expect(collection.accessions).toHaveLength(122);
  });
  it('a group that cannot be written is written again a line at a time: the lines before the failure land, and it is said by its line', async () => {
    const { run, collection } = await fresh();
    const rows = sheetOf('species\nAloe vera\nAloe ferox\nAloe striata\nAloe polyphylla\n');
    mem.failAt = mem.appends + 2; // the species record lands; the group and everything after are refused
    const { res } = await run(rows, 2000, 4);
    expect([res.failed?.line, res.added.length, collection.accessions.length]).toEqual([2, 0, 0]);
  });
});

describe('import keys: a second run adds only what the first did not (the records review, 1; the grower review, 3; A18; B6)', () => {
  it('a sheet with no numbers, cut off after two lines, then run again: each plant once', async () => {
    const { run, names } = await fresh();
    const sheet = 'species,acquired\nCopiapoa cinerea,2019\nCopiapoa humilis,2020-05\nLithops lesliei,2021-03-04\nAloe vera,\n';
    mem.failAt = mem.appends + 3; // the species records and the first group of two lines, then the tab closes
    const first = await run(sheetOf(sheet), 2000, 2);
    expect(first.res.added.map((a) => a.taxonName)).toEqual(['Copiapoa cinerea', 'Copiapoa humilis']);
    mem.failAt = Infinity;
    const again = await run(sheetOf(sheet));
    expect(again.done).toBe(2);
    expect(names()).toEqual(['2019-0001 Copiapoa cinerea', '2020-0001 Copiapoa humilis', '2021-0001 Lithops lesliei', '2026-0001 Aloe vera']);
    expect((await run(sheetOf(sheet))).rows).toEqual([]); // a third run: nothing left
  });
  it('the same list pasted twice adds it once', async () => {
    const { run, names } = await fresh();
    const rows = () => rowsFromPaste(parsePaste('Copiapoa cinerea\nHaworthia truncata; Lime Green\n'), { placeId: null, acquired: null, source: null });
    await run(rows());
    const again = await run(rows());
    expect(again.done).toBe(2);
    expect(names()).toEqual(['2026-0001 Copiapoa cinerea', '2026-0002 Haworthia truncata']);
  });
  it('a line the first run renumbered (its number was used here) is known on the second', async () => {
    const { collection, run } = await fresh();
    await collection.addAccession({ taxonName: 'Aloe vera', acc: '0010' });
    const sheet = 'number,species\n0010,Haworthia truncata\n';
    const first = await run(sheetOf(sheet));
    expect(first.res.added.map((a) => a.acc)).toEqual(['0011']); // in the sheet's own numbering since round sixty-three (L3); 2026-0001 before
    const again = await run(sheetOf(sheet));
    expect(again.done).toBe(1);
    expect(collection.accessions.filter((a) => a.taxonName === 'Haworthia truncata')).toHaveLength(1);
  });
  it('a line renamed with "Use it" is known on the second run, and keeps the sheet\'s name as received', async () => {
    const { collection, run } = await fresh();
    const sheet = 'number,species\n2024-0001,Copiapoa cinera\n';
    const rows = sheetOf(sheet);
    rows[0] = { ...rows[0], name: useSpecies(rows[0].name, 'Copiapoa cinerea') };
    await run(rows);
    expect(collection.accessions[0]).toMatchObject({ acc: '2024-0001', taxonName: 'Copiapoa cinerea', nameAsReceived: 'Copiapoa cinera' });
    const again = await run(sheetOf(sheet));
    expect(again.done).toBe(1);
    expect(collection.accessions).toHaveLength(1);
  });
  it('two identical lines, cut off after the first: the second is still offered', async () => {
    const { collection, run } = await fresh();
    const sheet = 'species,source\nLithops lesliei,club sale\nLithops lesliei,club sale\n';
    mem.failAt = mem.appends + 3; // the species record and the first line, a line a commit
    await run(sheetOf(sheet), 2000, 1);
    expect(collection.accessions).toHaveLength(1);
    mem.failAt = Infinity;
    const again = await run(sheetOf(sheet));
    expect([again.done, again.rows.length]).toEqual([1, 1]); // base: both lines skipped, or both added
    expect(collection.accessions).toHaveLength(2);
  });
  it('a second sheet that starts its numbering again: "7 Lithops lesliei" starts dropped, and "Add anyway" adds it as another plant', async () => {
    const { collection, run, review, commitImport } = await fresh();
    await run(sheetOf('number,species,source\n7,Lithops lesliei,Bob\n'));
    const second = review(sheetOf('number,species,source\n7,Lithops lesliei,Mesa Garden\n'));
    // Round sixty-seven (triage-66 R3, the outside review's 15): a line whose number and name match a plant here starts
    // dropped whatever the plant's import key; round sixty-two kept it, and an edited sheet's CF-001 came back as CF-004.
    expect(second.rows.map((r) => [r.already, r.drop])).toEqual([[true, true]]);
    const kept = second.rows.map((r) => ({ ...r, drop: false })); // "Add anyway"
    await commitImport(kept, new Map(), planNumbers(kept, collection.accessions.map((a) => a.acc!), collection.scheme, 2026, (n) => collection.isNumberTaken(n)), { makePlaces: false });
    expect(collection.accessions.map((a) => a.acc).sort()).toEqual(['7', '8']); // numbered on in the sheet's own numbering since round sixty-three (L3); 2026-0001 before
  });
  it('a backup\'s own plants.csv read back into its collection is every plant here already, by its record id', async () => {
    const { collection, run } = await fresh();
    await run(sheetOf('species,qty\nCopiapoa cinerea,2\nLithops lesliei,1\n'));
    const { plantsCsv } = await import('$lib/backup/backup');
    const csv = plantsCsv(collection.accessions as never, new Map());
    const again = await run(sheetOf(csv));
    expect([again.done, again.rows.length]).toEqual([3, 0]);
    expect(collection.accessions).toHaveLength(3);
  });
  it('the old warning stays for a plant with no import key, with its override', async () => {
    const { collection, review } = await fresh();
    await collection.addAccession({ taxonName: 'Lithops lesliei', acc: '7' });
    const r = review(sheetOf('number,species\n7,Lithops lesliei\n'));
    expect(r.rows.map((x) => [x.already, x.drop])).toEqual([[true, true]]);
  });
  it('B6: a Qty 3 row whose write is refused leaves no part of the line; read again, it offers all three', async () => {
    const { collection, run } = await fresh();
    const sheet = 'number,species,qty,acquired\n2024-0001,Copiapoa cinerea,3,2024\n';
    mem.failAt = mem.appends + 2; // the species record lands; the row's one commit is refused
    const first = await run(sheetOf(sheet));
    expect(first.res.failed?.line).toBe(2);
    expect(collection.accessions).toHaveLength(0);
    mem.failAt = Infinity;
    const again = await run(sheetOf(sheet));
    expect(again.rows.map((r) => [r.qty, r.drop])).toEqual([[3, false]]);
    expect(collection.accessions.map((a) => a.acc).sort()).toEqual(['2024-0001', '2024-0002', '2024-0003']);
  });
  it('B6: a Qty 3 row of which one plant is here (an older build wrote plant by plant) offers the other two, under new numbers', async () => {
    const { collection, run } = await fresh();
    const sheet = 'number,species,qty,acquired\n2024-0001,Copiapoa cinerea,3,2024\n';
    const keys = sheetOf(sheet)[0].importKeys!;
    await collection.addAccession({ taxonName: 'Copiapoa cinerea', acc: '2024-0001', acquired: '2024', importKey: keys[0] });
    const again = await run(sheetOf(sheet));
    expect(again.rows.map((r) => [r.qty, r.partDone, r.numberUsed, r.drop])).toEqual([[2, 1, true, false]]); // base: the whole row "already imported"; the line's own number is marked used, not dropped from the row (round sixty-seven; triage-66 R5)
    expect(collection.accessions.map((a) => [a.acc, a.importKey]).sort()).toEqual([['2024-0001', keys[0]], ['2024-0002', keys[1]], ['2024-0003', keys[2]]]);
  });
  it('the key is the line\'s cells: case, spaces, a guard apostrophe and empty cells at the end do not change it', () => {
    expect(lineHash(['Copiapoa cinerea', ' 2024 ', '', ''])).toBe(lineHash(['copiapoa  cinerea', '2024']));
    expect(lineHash(["'-5 °C"])).toBe(lineHash(['-5 °C']));
    expect(lineHash(['Copiapoa cinerea', '2024'])).not.toBe(lineHash(['Copiapoa cinerea', '2025']));
    expect(keyLines([{ cells: ['a'], qty: 2 }, { cells: ['b'], qty: 1 }, { cells: ['a'], qty: 2 }]).map((ks) => ks.map((k) => k.split('#')[1]))).toEqual([['1', '2'], ['1'], ['3', '4']]);
  });
});

describe('passes: a sheet over 2,000 lines is taken in passes (the records review, 5)', () => {
  it('the lines here are left out first, then the next lines up to the pass size', async () => {
    const { run, names } = await fresh();
    const sheet = 'species\n' + Array.from({ length: 7 }, (_, i) => `Aloe ${['vera', 'ferox', 'dichotoma', 'arborescens', 'aristata', 'striata', 'polyphylla'][i]}`).join('\n') + '\n';
    const p1 = await run(sheetOf(sheet), 3);
    expect([p1.done, p1.rows.length, p1.later]).toEqual([0, 3, 4]);
    const p2 = await run(sheetOf(sheet), 3);
    expect([p2.done, p2.rows.length, p2.later]).toEqual([3, 3, 1]);
    const p3 = await run(sheetOf(sheet), 3);
    expect([p3.done, p3.rows.length, p3.later]).toEqual([6, 1, 0]);
    expect(names()).toHaveLength(7);
  });
  it('lines that look already imported (an older collection) do not count toward the pass', () => {
    const rows = sheetOf('number,species\n1,Aloe vera\n2,Aloe ferox\n3,Aloe striata\n');
    const marked = markAlreadyImported(rows, (no) => (no === '3' ? [] : [{ taxonName: no === '1' ? 'Aloe vera' : 'Aloe ferox' }]));
    const pass = passOf(marked, 1);
    expect([pass.rows.map((r) => r.line), pass.later]).toEqual([[2, 3, 4], 0]);
  });
});

describe('"Use it" keeps what the sheet said beyond the species (the records review, 2)', () => {
  it.each([
    ['Copiapoa cf. cinera', 'Copiapoa cf. cinerea'],
    ['Copiapoa cinera subsp. haseltoniana (white spines)', 'Copiapoa cinerea subsp. haseltoniana (white spines)'],
    ["Haworthia truncatta 'Lime Green'", "Haworthia truncata 'Lime Green'"],
    ['Copiapoa cinera', 'Copiapoa cinerea']
  ])('%s becomes %s', (typed, want) => {
    const got = useSpecies(typed, typed.startsWith('Haworthia') ? 'Haworthia truncata' : 'Copiapoa cinerea');
    expect(got).toBe(want);
  });
  it('the filed record keeps the qualifier with no key, and the sheet\'s text as received', () => {
    const row = sheetOf('species\nCopiapoa cinera subsp. haseltoniana (white spines)\n')[0];
    const rec = recordOf({ ...row, name: useSpecies(row.name, 'Copiapoa cinerea') }, { s: 'found', slug: 'copiapoa-cinerea', refName: 'Copiapoa cinerea', key: null }, null);
    expect(rec).toMatchObject({ taxonName: 'Copiapoa cinerea subsp. haseltoniana', taxonKey: null, nameAsReceived: 'Copiapoa cinera subsp. haseltoniana (white spines)' });
    const cf = sheetOf('species\nCopiapoa cf. cinera\n')[0];
    expect(recordOf({ ...cf, name: useSpecies(cf.name, 'Copiapoa cinerea') }, { s: 'found', slug: 'copiapoa-cinerea', refName: 'Copiapoa cinerea', key: null }, null)).toMatchObject({ taxonName: 'Copiapoa cf. cinerea', taxonKey: null, nameAsReceived: 'Copiapoa cf. cinera' });
  });
  it('a name filed as the sheet wrote it records no name as received', () => {
    expect(recordOf(sheetOf("species,cultivar\nhaworthia  truncata,Lime Green\n")[0], undefined, null).nameAsReceived).toBeNull();
    expect(recordOf(sheetOf('species\nMammillaria sp. nov. "Sierra Gorda"\n')[0], undefined, null).nameAsReceived).toBeNull();
  });
});

describe('open names (the records review, 3 and 14; the grower review, 7; A21)', () => {
  it.each([
    ['Mammillaria nr. bombycina', 'Mammillaria nr. bombycina', 'nr.'],
    ['Mammillaria near bombycina', 'Mammillaria nr. bombycina', 'nr.'],
    ['Mammillaria cfr. bombycina', 'Mammillaria cf. bombycina', 'cf.'],
    ['Mammillaria vel aff. bombycina', 'Mammillaria vel aff. bombycina', 'vel aff.'],
    ['cf. Mammillaria bombycina', 'Mammillaria cf. bombycina', 'cf.'],
    ['aff. Aloe vera', 'Aloe aff. vera', 'aff.']
  ])('%s is %s, with the qualifier %s and the compared species', (typed, sci, q) => {
    const p = parseName(typed);
    expect([p.scientific, p.qualifier, p.genus]).toEqual([sci, q, sci.split(' ')[0]]);
    expect(p.epithet).toBe(sci.split(' ').at(-1));
    expect(parseName(p.scientific).scientific).toBe(sci); // a second parse changes nothing
  });
  it('a nr. plant is filed with no key, a cfr. one too', () => {
    for (const typed of ['Mammillaria nr. bombycina', 'Mammillaria cfr. bombycina']) {
      const rec = recordOf(sheetOf(`species\n${typed}\n`)[0], { s: 'found', slug: 'mammillaria-bombycina', refName: 'Mammillaria bombycina', key: 7 }, null);
      expect(rec.taxonName).not.toBe('Mammillaria bombycina');
      expect(rec.taxonKey).toBeNull();
    }
  });
  it.each([["Copiapoa sp. 'Pan de Azúcar'", "Copiapoa sp. 'Pan de Azúcar'"], ['Mammillaria sp. nov. "Sierra Gorda"', "Mammillaria sp. nov. 'Sierra Gorda'"], ["Gymnocalycium sp. 'LB 1234'", "Gymnocalycium sp. 'LB 1234'"]])('%s is an undescribed species with a provisional name, not a cross', (typed, sci) => {
    const p = parseName(typed);
    expect([p.scientific, p.qualifier, p.kind, p.cultivar]).toEqual([sci, 'sp.', 'species', undefined]);
    expect(recordOf(sheetOf(`species\n"${typed.replace(/"/g, '""')}"\n`)[0], undefined, null)).toMatchObject({ taxonName: sci, nameKind: 'species', cultivar: null });
  });
  it('a second word the reader leaves out goes to the name as received', () => {
    const rec = recordOf(sheetOf('species\nMammillaria ssp. bombycina\n')[0], undefined, null);
    expect(rec.taxonName).toBe('Mammillaria bombycina');
    expect(rec.nameAsReceived).toBe('Mammillaria ssp. bombycina');
  });
  it('after "sp." no rank is rewritten', () => {
    expect(tidyName('Lithops sp. v 036')).toBe('Lithops sp. v 036');
    expect(tidyName('Copiapoa  cinerea ssp alboviridis')).toBe('Copiapoa cinerea subsp. alboviridis');
  });
});

describe('unread fields and place paths (the records review, 4; the grower review, 6)', () => {
  it('Status "sold" and "Died 2023", and Kind "Cactus", reach the notes', () => {
    const rows = sheetOf('species,kind,status\nCopiapoa cinerea,Cactus,sold\nAloe vera,,Died 2023\n');
    expect(rows[0].notes).toBe('Kind: Cactus\nStatus: sold');
    expect(rows[1].notes).toBe('Status: Died 2023');
    expect(rows[0].status).toBe('growing');
  });
  it('">" and "/" between words are asked about once, yes by default when the first part is a place here or repeats', () => {
    const places = [{ id: 'g', name: 'Greenhouse', parentId: null }];
    expect(loosePaths(['Greenhouse > Bench 2', 'Shelf >1 m', null], places)).toEqual({ paths: 1, yes: true, example: 'Greenhouse > Bench 2' });
    // A "/" with no spaces is a step only after a place here (round sixty-two, second pass; the verification grower review, 6).
    expect(loosePaths(['Front/back'], places)).toEqual({ paths: 0, yes: false, example: null });
    expect(loosePaths(['Shed/Top', 'Shed/Bottom'], []).paths).toBe(0);
    expect(loosePaths(['Shed/Top', 'Shed/Bottom'], [{ id: 's', name: 'Shed', parentId: null }])).toEqual({ paths: 2, yes: true, example: 'Shed/Top' });
    expect(loosePaths(['Front/back'], [{ id: 'f', name: 'Front/back', parentId: null }]).paths).toBe(0);
    expect(asPath('Greenhouse/Bench 2 > Tray 1', places)).toBe('Greenhouse › Bench 2 › Tray 1');
    expect(asPath('Greenhouse/Bench 2 > Tray 1')).toBe('Greenhouse/Bench 2 › Tray 1');
  });
});

describe('dates (A20; the records review, 14)', () => {
  it.each([
    ['15/06/27', null], ['1/1/27', null], ['24/03/09', null], ['24.03.09', null], ['24-03-09', null],
    ['00/01/2020', null], ['01/00/2020', null], ['2019.5', null], ['2019.12', null],
    ['30/09/09', '2009-09-30'], ['09/03/2024 10:15', null], ['22/10/2023 10:15', '2023-10-22'], ['9/3/2024 0:00', null],
    ['2024-03-09 10:15:00', '2024-03-09'], ['17-Feb-17', '2017-02-17'], ['17-Feb-27', null], ['2019-05', '2019-05'], ['05.2019', '2019-05']
  ])('%s → %s', (cell, want) => {
    expect(readDate(cell, TODAY).d).toBe(want);
  });
  it('says why, never "0 January" or "1 undefined"', () => {
    expect(readDate('00/01/2020', TODAY).why).toBe('"00/01/2020" is not a date, so it was not read');
    expect(readDate('1/1/27', TODAY).why).toBe('"1/1/27" has a two-digit year that could be 1927 or 2027, so it was not read');
    expect(readDate('24/03/09', TODAY).why).toMatch(/year first or year last/);
  });
  it('a date with a time is held as ambiguous like one without, so the sheet\'s choice reaches it', () => {
    expect(readDate('09/03/2024 10:15', TODAY)).toMatchObject({ ambiguous: true, year: 2024 });
    expect(readDate('09/03/2024 10:15', TODAY, 'dmy').d).toBe('2024-03-09');
    const s = parseCsv('species,acquired\nAloe vera,09/03/2024 10:15\nAloe ferox,24/03/09\n');
    expect(ambiguousDates(s, guessMapping(s, true), true, TODAY)).toMatchObject({ n: 1, first: '09/03/2024 10:15' });
  });
  it('Qty "3.0" is three plants', () => {
    expect(sheetOf('species,qty\nAloe vera,3.0\nAloe ferox,3.5\n').map((r) => r.qty)).toEqual([3, 1]);
  });
});

describe('a Qty row\'s price is spent once (the grower review, 8; A39)', () => {
  beforeEach(() => void 0);
  it('the price is on the first plant; the others say where it is', async () => {
    const { run } = await fresh();
    const { res } = await run(sheetOf('species,qty,price,notes\nCopiapoa cinerea,3,£12,from Bob\n'));
    expect(res.added.map((a) => [a.acc, a.price ?? null, a.notes])).toEqual([
      ['2026-0001', '£12', 'from Bob'],
      ['2026-0002', null, 'from Bob\nBought with 2026-0001, whose record holds the price.'],
      ['2026-0003', null, 'from Bob\nBought with 2026-0001, whose record holds the price.']
    ]);
  });
});
