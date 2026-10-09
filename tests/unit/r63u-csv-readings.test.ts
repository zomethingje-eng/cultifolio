/**
 * Round sixty-three, agent U (U5): what plants.csv writes for the two spreadsheet readings the triage closed as stated.
 *
 * - A price is written as typed and never quoted: LibreOffice and Excel read `12.50` as the number 12.5 and show it so.
 *   That is the spreadsheet's reading of a plain CSV; quoting it as text would break other readers (outside review A35).
 * - A full date is written as `2017-08-14`, which a spreadsheet takes for a date and shows in its own short form (Excel:
 *   14/08/2017 in en-GB). A date kept as a month or a year is not shown as "Aug-17": `2017-08` is written `="2017-08"`
 *   (round sixty-one), which Excel, LibreOffice and Google Sheets show as the text itself; a year alone is a number.
 * These pin what /about/formats says, so the page and the sheet cannot drift apart.
 */
import { describe, it, expect } from 'vitest';
import { plantsCsv } from '$lib/backup/backup';
import { parseCsv, cellText } from '$lib/import/csv';
import type { Record_ } from '$core/log';
import type { Accession } from '$lib/db/types';

const plant = (f: Partial<Accession>) => ({ kind: 'accession', id: 'r1', acc: '2026-0001', taxonName: 'Copiapoa cinerea', status: 'growing', provenance: 'unknown', ...f }) as unknown as Accession & Record_;
const row = (f: Partial<Accession>) => {
  const sheet = parseCsv(plantsCsv([plant(f)], new Map()));
  const head = sheet[0];
  return (name: string) => sheet[1][head.indexOf(name)];
};

describe('plants.csv: the readings /about/formats states (round sixty-three, U5)', () => {
  it('a price is written as typed, never quoted (a spreadsheet shows 12.50 as 12.5)', () => {
    expect(row({ price: '12.50' })('price')).toBe('12.50');
    expect(row({ price: '£12.50' })('price')).toBe('£12.50');
  });
  it('a full date is written bare (a spreadsheet takes it for a date and shows it short)', () => {
    expect(row({ acquired: '2017-08-14' })('acquired')).toBe('2017-08-14');
  });
  it('a month is written ="2017-08", so no spreadsheet shows it as Aug-17, and the import reads it back as written', () => {
    const c = row({ acquired: '2017-08' })('acquired');
    expect(c).toBe('="2017-08"');
    expect(cellText(c)).toBe('2017-08');
  });
  it('a year alone is written bare: a spreadsheet reads 2017 as the number it is', () => {
    expect(row({ acquired: '2017' })('acquired')).toBe('2017');
  });
});
