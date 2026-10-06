/**
 * Harness review of round sixty: two parts of the backup's number handling that no test reached.
 *   - csvCell writes a run of sixteen or more digits as ="…" (a spreadsheet keeps fifteen significant digits and turns the
 *     rest to zeros). Dropping that clause passed the suite: the round's test checks "0012", "1E5" and "3-12" only.
 *   - previewMerge's sharedNumbers leaves out removed records. Dropping `r._deleted ||` passed the suite: the preview then
 *     promises a shared number with a plant the grower removed.
 * PASSES on round-sixty code; each test FAILS under its mutation.
 * Run: copy to tests/unit/ and `npx vitest run tests/unit/harness--backup-numbers.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import { previewMerge, plantsCsv } from '$lib/backup/backup';
import { materialise, live, type Change, type Record_ } from '$core/log';
import type { Accession } from '$lib/db/types';

const t = (n: number) => `${String(1700000000000 + n).padStart(13, '0')}-0000-dev1`;
const c = (n: number, kind: Change['kind'], id: string, field: string, value: unknown): Change => ({ t: t(n), kind, id, field, value });
const plant = (n: number, id: string, no: string, name: string): Change[] => [c(n, 'accession', id, 'taxonName', name), c(n + 1, 'accession', id, 'status', 'growing'), c(n + 2, 'accession', id, 'acc', no)];

describe('the backup\'s numbers (harness review)', () => {
  it('a field number of sixteen digits or more is written as ="…", so a spreadsheet does not round it; fifteen stays as it is', () => {
    const log = [...plant(1, 'r1', '2026-0001', 'Copiapoa cinerea'), c(10, 'accession', 'r1', 'fieldNumber', '1234567890123456789'), ...plant(20, 'r2', '2026-0002', 'Lithops lesliei'), c(30, 'accession', 'r2', 'fieldNumber', '123456789012345')];
    const { state } = materialise(log);
    const rows = plantsCsv(live<Accession & Record_>(state, 'accession'), state).slice(1).split('\r\n');
    const r1 = rows.find((l) => l.startsWith('2026-0001'))!;
    const r2 = rows.find((l) => l.startsWith('2026-0002'))!;
    expect(r1).toContain(',"=""1234567890123456789""",');
    expect(r2).toContain(',123456789012345,');
  });

  it('the preview lists no shared number with a plant removed here', () => {
    const here = [...plant(1, 'r-here', '2026-0007', 'Copiapoa cinerea'), c(10, 'accession', 'r-here', '_deleted', true)];
    const file = plant(40, 'r-file', '2026-0007', 'Aloe vera');
    expect(previewMerge(here, file).sharedNumbers).toEqual([]);
    // and the same plant not removed is listed
    expect(previewMerge(plant(1, 'r-here', '2026-0007', 'Copiapoa cinerea'), file).sharedNumbers.map((s) => s.name)).toEqual(['Copiapoa cinerea', 'Aloe vera']);
  });
});
