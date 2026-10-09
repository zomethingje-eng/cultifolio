/**
 * Self-review of round sixty-one, records area: the mark (bit 0x800000 of a stamp's counter) and partial dates through a
 * backup. PASSES on f4ab4f8: a guard worth adopting.
 *  - changes.json carries marked stamps byte for byte; the fold of the file gives the marked edit the field, past the
 *    far stamp it was placed after; a merge's `fresh` keeps them; the manifest's `parked` lists only what was given.
 *  - plants.csv writes a year, a year-month, 12 digits, a leading zero, "3-12", "1E5" and "1/2/24" so the import reads
 *    them back as they were.
 * Run: npx vitest run tests/unit/records--r61-backup-mark.test.ts
 */
import { it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { hlcEncode, hlcPast, isPastStamp, hlcCompare, isHlc } from '$core/hlc';
import { materialise, type Change } from '$core/log';
import { buildBackup, readBackup, previewMerge } from '$lib/backup/backup';
import { parseCsv, detectHeader, guessMapping } from '$lib/import/csv';
import { rowsFromSheet } from '$lib/import/rows';

const DEV = 'aaaaaaaaaaaa0000';
const now = Date.now();
const far = hlcEncode({ wall: now + 400 * 86_400_000, count: 2, device: 'bbbbbbbbbbbbq0q0' });
const marked = hlcPast(far, DEV);
const marked2 = hlcPast(marked, DEV);
let w = now - 86_400_000;
const t = () => hlcEncode({ wall: w++, count: 0, device: DEV });
const acc = (id: string, f: Record<string, unknown>): Change[] => Object.entries(f).map(([field, value]) => ({ t: t(), kind: 'accession', id, field, value }));
const changes: Change[] = [
  ...acc('r1', { acc: '2009-0001', taxonName: 'Copiapoa cinerea', status: 'growing', acquired: '2009', fieldNumber: '123456789012' }),
  ...acc('r2', { acc: '2017-0001', taxonName: 'Mammillaria cf. bombycina', status: 'growing', acquired: '2017-08', sourceRef: '0012', notes: "'=already quoted" }),
  ...acc('r3', { acc: '2026-0001', taxonName: 'Lithops sp. C 036', status: 'dead', acquired: '2026-03-09', sourceRef: '3-12', notes: '1/2/24', price: '1E5' }),
  { t: far, kind: 'accession', id: 'r1', field: 'price', value: 'fast clock' },
  { t: marked, kind: 'accession', id: 'r1', field: 'price', value: 'edited past it' },
  { t: marked2, kind: 'accession', id: 'r1', field: 'notes', value: 'past twice' },
  { t: t(), kind: 'event', id: 'e1', field: 'acc', value: 'r1' }, { t: t(), kind: 'event', id: 'e1', field: 'd', value: '2009' }, { t: t(), kind: 'event', id: 'e1', field: 't', value: 'acquire' }
];

it('marked stamps and partial dates survive the backup, the fold, a merge and the sheet', async () => {
  expect([marked, marked2].every((s) => isHlc(s) && isPastStamp(s))).toBe(true);
  expect(hlcCompare(marked, far)).toBe(1);
  expect(hlcCompare(marked2, marked)).toBe(1);
  const built = await buildBackup({ changes, readPhoto: async () => null, parked: [far] });
  const file = await readBackup(built.bytes);
  expect(file.changes).toEqual(changes);
  expect(file.manifest.parked).toEqual([far]);
  const r1 = materialise(file.changes).state.get('accession:r1')!;
  expect([r1.price, r1.notes, isPastStamp(String(r1._t))]).toEqual(['edited past it', 'past twice', true]);
  const fresh = previewMerge(changes.slice(0, 5), file.changes).fresh;
  expect(fresh.map((c) => c.t)).toEqual(expect.arrayContaining([marked, marked2]));
  const csv = strFromU8(unzipSync(built.bytes)['plants.csv']);
  const s = parseCsv(csv); const h = detectHeader(s);
  const back = rowsFromSheet(s, guessMapping(s, h), h, '2026-10-07').rows.map((r) => [r.number, r.name, r.acquired, r.fieldNumber, r.lot, r.notes, r.price, r.status]);
  expect(back).toEqual([
    ['2009-0001', 'Copiapoa cinerea', '2009', '123456789012', null, 'past twice', 'edited past it', 'growing'],
    ['2017-0001', 'Mammillaria cf. bombycina', '2017-08', null, '0012', "'=already quoted", null, 'growing'],
    ['2026-0001', 'Lithops sp. C 036', '2026-03-09', null, '3-12', '1/2/24', '1E5', 'dead']
  ]);
});
