/**
 * Round sixty-two, second pass, agent G: the import's words and names (the verification grower review's smaller
 * notes; triage-self N10). Invisible characters and compatibility forms in a name cell; one verdict for a row and the
 * summary; the done sentence's numbers; progress in plants; dates a spreadsheet writes on its own, and what a sheet's
 * other dates show of its order.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Change } from '$core/log';
import { parseCsv, readDate, detectHeader, guessMapping, ambiguousDates } from '$lib/import/csv';
import { parsePaste } from '$lib/import/paste';
import { rowsFromSheet, rowsFromPaste, cleanName } from '$lib/import/rows';
import { planNumbers } from '$lib/import/plan';
import { recordOf, numbersSaid } from '$lib/import/commit';
import { nameVerdict, checkKey, type NameCheck } from '$lib/import/check';

const TODAY = '2026-10-07';
const sheet = (text: string) => { const s = parseCsv(text); const h = detectHeader(s); return rowsFromSheet(s, guessMapping(s, h), h, TODAY); };
const sheetOf = (text: string) => sheet(text).rows;

let mem: { changes: Change[]; meta: Map<string, unknown> } = { changes: [], meta: new Map() };
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
  Object.assign(m, { onOtherTabWrite: () => () => {}, readFold: async () => undefined, writeFold: async () => false, foldGen: async () => 0, dropFold: async () => {}, parkStamps: async (st: string[]) => st, lastArrival: async () => 0, arrivalsAfter: async () => ({ changes: [...mem.changes], seq: 0, gen: 0 }), changeKeys: async () => mem.changes.map((c) => c.t), changesByKeys: async (ts: string[]) => mem.changes.filter((c) => ts.includes(c.t)), updateMeta: async (k: string, fn: (had: unknown) => unknown) => { const next = fn(mem.meta.get(k)); mem.meta.set(k, next); return next; }, changesOf: async (kind: string, id: string) => mem.changes.filter((c) => c.kind === kind && c.id === id), holdVault: async (work: () => Promise<unknown>) => work(), announceSyncForgotten: () => {} });
  return m;
});

describe('a name cell with invisible characters or compatibility forms (the verification grower review)', () => {
  it.each([
    ['soft hyphen', 'Copia\u00adpoa cinerea'],
    ['zero-width space', 'Copia\u200bpoa cinerea'],
    ['full-width letters', 'Ｃｏｐｉａｐｏａ cinerea']
  ])('%s: read as Copiapoa cinerea, and the text as received kept', (_w, typed) => {
    const [r] = sheetOf(`species\n${typed}\n`);
    expect(r.name).toBe('Copiapoa cinerea'); // base: the invisible character kept, "not in the reference; added as typed"
    expect(checkKey(r.name)).toBe('Copiapoa cinerea');
    const rec = recordOf(r, { s: 'found', slug: 'copiapoa-cinerea', refName: 'Copiapoa cinerea', key: 7 }, null);
    expect(rec.taxonName).toBe('Copiapoa cinerea');
    expect(rec.taxonKey).toBe(7);
    expect(rec.nameAsReceived).toBe(typed.trim()); // the sheet's text, as it came
  });
  it.each([['byte order mark', '\ufeffCopiapoa cinerea'], ['no-break space', 'Copiapoa\u00a0cinerea']])('%s: a space or a mark a cell is trimmed of; no name as received', (_w, typed) => {
    const [r] = sheetOf(`species\n${typed}\n`);
    expect(r.name).toBe('Copiapoa cinerea');
    expect(recordOf(r, undefined, null).nameAsReceived).toBeNull();
  });
  it('a pasted line too', () => {
    const [r] = rowsFromPaste(parsePaste('Copia\u00adpoa cinerea; ; ; ; two heads'), { placeId: null, acquired: null, source: null });
    expect(r.name).toBe('Copiapoa cinerea');
    expect(recordOf(r, undefined, null).nameAsReceived).toBe('Copia\u00adpoa cinerea');
  });
  it('a clean name keeps no name as received; a genus column is cleaned too', () => {
    const [a, b] = sheetOf('genus,species\nCopiapoa,cinerea\nCopia\u200bpoa,cinerea\n');
    expect(recordOf(a, undefined, null).nameAsReceived).toBeNull();
    expect(b.name).toBe('Copiapoa cinerea');
  });
  it('a name of invisible characters only is a line with no name', () => {
    const r = sheet('species,notes\n\u200b\u00ad,x\nAloe vera,\n');
    expect(r.rows.map((x) => x.name)).toEqual(['Aloe vera']);
    expect(r.noName).toBe(1);
  });
  it('the import key is the line\'s, whatever the cleaning: a second run finds the same line', () => {
    expect(sheetOf('species\nCopia\u00adpoa cinerea\n')[0].importKeys).toEqual(sheetOf('species\nCopia\u00adpoa cinerea\n')[0].importKeys);
  });
  it('an emoji keeps its joiner', () => {
    expect(cleanName('Aloe vera \u{1f468}\u200d\u{1f469}')).toBe('Aloe vera \u{1f468}\u200d\u{1f469}');
  });
});

describe('one verdict for a row and for the summary (the verification grower review)', () => {
  const found = (refName: string, key: number | null): NameCheck => ({ s: 'found', slug: 'x', refName, key });
  it.each([
    ['Copiapoa sp.', { s: 'missing' } as NameCheck, 'keyless'], // base: counted "not in the reference, added as typed"; its row said "filed as written"
    ['Copiapoa cf. cinerea', found('Copiapoa cinerea', null), 'keyless'], // base: counted as matched
    ['Copiapoa aff. cinerea', found('Copiapoa cinerea', 7), 'keyless'],
    ['Copiapoa cinerea var. albispina', found('Copiapoa cinerea', null), 'keyless'], // base: "matched as Copiapoa cinerea", filed with no key
    ['Copiapoa cinerea', found('Copiapoa cinerea', 7), 'found'],
    ['Copiapoa cinera', { s: 'near', suggestion: 'Copiapoa cinerea', key: 7, why: 'spelling' } as NameCheck, 'near'],
    ['Copiapoa sp. nova', { s: 'unchecked' } as NameCheck, 'keyless'],
    ['Copiapoa nonesuch', { s: 'unchecked' } as NameCheck, 'unchecked'],
    ['Copiapoa nonesuch', { s: 'missing' } as NameCheck, 'missing'],
    ['Copiapoa nonesuch', undefined, 'waiting']
  ])('%s', (name, c, v) => {
    expect(nameVerdict(c, name)).toBe(v);
    // and the key filed agrees: "found" is the only verdict filed with a key
    if (c) expect(recordOf(sheetOf(`species\n${name}\n`)[0], c, null).taxonKey !== null).toBe(v === 'found');
  });
});

describe('the done sentence names the numbers given (the verification grower review)', () => {
  it('a fourth run is named, never "and others" for one plant', () => {
    const nos = ['A-7', ...Array.from({ length: 7 }, (_, i) => `2024-000${i + 1}`), '2023-0001', '2023-0002', '2023-0003', '2026-0001'];
    expect(numbersSaid(nos)).toBe('A-7, 2024-0001 to 2024-0007, 2023-0001 to 2023-0003 and 2026-0001'); // base: "… and others"
  });
  it('past four runs, the plants left are counted', () => {
    expect(numbersSaid(['A-1', 'B-1', 'C-1', 'D-1', 'D-2', 'E-1'])).toBe('A-1, B-1, C-1 and 3 other plants');
  });
  it('one run, and two', () => {
    expect(numbersSaid(['2026-0002', '2026-0001'])).toBe('2026-0001 to 2026-0002');
    expect(numbersSaid(['0001', 'A1'])).toBe('0001 and A1');
    expect(numbersSaid([])).toBe('');
  });
});

describe('progress is counted in plants, as the button counts them (the verification grower review)', () => {
  it('"Adding 5 of 7", for 3 lines of 7 plants', async () => {
    vi.resetModules();
    mem = { changes: [], meta: new Map() };
    const { collection } = await import('$lib/db/collection.svelte');
    await collection.load();
    const { commitImport } = await import('$lib/import/commit');
    const rows = sheetOf('species,qty\nAloe vera,2\nCopiapoa cinerea,3\nLithops lesliei,2\n');
    const plan = planNumbers(rows, [], collection.scheme, 2026, (n) => collection.isNumberTaken(n));
    const seen: Array<[number, number]> = [];
    await commitImport(rows, new Map(), plan, { makePlaces: false, chunk: 5, onProgress: (d, t) => seen.push([d, t]) });
    expect(seen).toEqual([[5, 7], [7, 7]]); // base: [[2, 3], [3, 3]], lines
  });
});

describe('dates a spreadsheet writes on its own are said for what they are (triage-self N10)', () => {
  it('"Aug-17": a month and a two-digit year, or a day; not read, and why', () => {
    const d = readDate('Aug-17', TODAY);
    expect(d.d).toBeNull();
    expect(d.why).toBe('"Aug-17" looks like a spreadsheet\'s month and two-digit year (August 2017), but it could as well be 17 August of a year not given, so it was not read: give the column a four-digit year in the spreadsheet and save the CSV again'); // base: 'the date "Aug-17" was not read'
    expect(readDate('Sep 30', TODAY).why).toContain('(September 1930 or 2030)');
  });
  it('"45123": a count of days, said with the date it would be; not read', () => {
    const d = readDate('45123', TODAY);
    expect(d.d).toBeNull();
    expect(d.why).toBe('"45123" is a number, perhaps a date a spreadsheet keeps as a count of days (in the usual count it would be 16 July 2023), so it was not read: show the column as dates in the spreadsheet and save the CSV again'); // base: 'the date "45123" was not read'
    expect(readDate('45123.25', TODAY).why).toContain('16 July 2023');
  });
  it('the row says it, and the text is in the notes', () => {
    const [r] = sheetOf('species,acquired\nAloe vera,Aug-17\n');
    expect(r.notes).toBe('Acquired (as written): Aug-17');
    expect(r.problems[0]).toMatch(/^"Aug-17" looks like a spreadsheet's month/);
  });
});

describe('what the sheet\'s other dates show of its order (triage-self N10)', () => {
  const amb = (cells: string[]) => { const s = parseCsv(`species,acquired\n${cells.map((c) => `Aloe vera,${c}`).join('\n')}\n`); return ambiguousDates(s, guessMapping(s, true), true, TODAY); };
  it('a date over 12 first can only be day first', () => {
    expect(amb(['09/03/2024', '17/11/2007', '22/10/2023'])).toEqual({ n: 1, first: '09/03/2024', dayFirst: { n: 2, first: '17/11/2007' }, monthFirst: { n: 0, first: null } }); // base: no evidence
  });
  it('a date over 12 second can only be month first; both can be in one sheet', () => {
    expect(amb(['09/03/2024', '11/17/2007'])).toMatchObject({ monthFirst: { n: 1, first: '11/17/2007' }, dayFirst: { n: 0 } });
    expect(amb(['09/03/2024', '11/17/2007', '17/11/2007'])).toMatchObject({ monthFirst: { n: 1 }, dayFirst: { n: 1 } });
  });
  it('a date the same either way, or written with its year first, shows nothing', () => {
    expect(amb(['09/03/2024', '09/09/2024', '2024-11-17'])).toMatchObject({ dayFirst: { n: 0 }, monthFirst: { n: 0 } });
  });
});
