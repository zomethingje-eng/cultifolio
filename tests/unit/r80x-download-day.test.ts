/**
 * Round eighty, agent X: a page's records are dated by the day GBIF made the download, not by its key's digits.
 *
 * `downloadDay` read "0006100-260916113435855" as made on 2026-09-16. GBIF says it was made on 2026-09-19, and the full
 * build's download, "0036848-260928105237408", was made on 2026-10-20 (GBIF's /occurrence/download/<key>, `created`): the
 * key's second half is the day GBIF's download service last started. So every page built from it would say its records
 * are of 2026-09-28. The day is now GBIF's `created`, which bulk-fetch.ts keeps when it fetches a download and the build
 * asks of GBIF once for a download fetched before (round seventy-nine's), else the day it was fetched. FAILED on r80base:
 * the first case gave 2026-09-28, and `addCreated` did not exist.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { downloadDay, SQL_SELECT } from '$lib/dossier/bulk';
import * as load from '../../scripts/bulk-load';
import { writeZip } from '../../scripts/dev/zip-store';

const KEY = '0036848-260928105237408';

describe('round eighty, X: the download\'s day', () => {
  it('is the day GBIF made it, else the day it was fetched, never the key\'s digits', () => {
    expect(downloadDay({ key: KEY, created: '2026-10-20T13:31:13.148+00:00', fetched: '2026-10-22T08:00:00.000Z' })).toBe('2026-10-20');
    expect(downloadDay({ key: KEY, fetched: '2026-10-22T08:00:00.000Z' })).toBe('2026-10-22');
    expect(downloadDay({ key: '0006100-260916113435855', created: '2026-09-19T20:08:28.384+00:00' })).toBe('2026-09-19');
    expect(downloadDay({ key: KEY })).toBeUndefined();
  });

  it('a download fetched without it is asked of GBIF once, kept in download.json, and read into every record', async () => {
    const add = (load as { addCreated?: (dir: string, ask: (k: string) => Promise<string | undefined>) => Promise<string | null> }).addCreated;
    expect(add).toBeTypeOf('function');
    const dir = mkdtempSync(join(tmpdir(), 'r80x-day-'));
    const header = SQL_SELECT.map(([, a]) => a).join('\t');
    writeZip(join(dir, 'occurrence.zip'), { [`${KEY}.csv`]: `${header}\n4152362378\t3832175\t3832175\t3832175\t-31.11986\t-64.45786\t31.0\t\t2021\tAR\tHUMAN_OBSERVATION\tCC_BY_4_0\t50c9509d-22c7-4a22-a47d-8c48425ef4a7\t\t\n` });
    // As round seventy-nine's bulk-fetch.ts wrote it on fetching: the key and the fetching day, no `created`.
    writeFileSync(join(dir, 'download.json'), JSON.stringify({ key: KEY, format: 'SQL_TSV_ZIP', doi: '10.15468/dl.example', records: 1, taxa: 1, csv: `${KEY}.csv`, fetched: '2026-10-22T08:00:00.000Z' }));
    const asked: string[] = [];
    const said = await add!(dir, async (k) => { asked.push(k); return '2026-10-20T13:31:13.148+00:00'; });
    expect(asked).toEqual([KEY]);
    expect(said).toContain(`${KEY} 2026-10-20`);
    expect(JSON.parse(readFileSync(join(dir, 'download.json'), 'utf8')).created).toBe('2026-10-20T13:31:13.148+00:00');
    // Asked once: a second build asks nothing.
    expect(await add!(dir, async (k) => { asked.push(k); return undefined; })).toBeNull();
    expect(asked).toHaveLength(1);
    const l = await load.loadOccurrences(dir, 2000, new Set([3832175]));
    expect(l!.occ.get(3832175)![0]).toMatchObject({ downloadDoi: '10.15468/dl.example', downloadDay: '2026-10-20' });
  });

  it('a download GBIF does not answer for keeps its fetching day, and says so', async () => {
    const add = (load as { addCreated?: (dir: string, ask: (k: string) => Promise<string | undefined>) => Promise<string | null> }).addCreated;
    const dir = mkdtempSync(join(tmpdir(), 'r80x-day-'));
    writeFileSync(join(dir, 'download.json'), JSON.stringify({ format: 'SQL_TSV_ZIP', parts: [{ key: 'A-1', fetched: '2026-10-22T08:00:00.000Z' }, { key: 'B-2', created: '2026-10-19T01:00:00.000Z', fetched: '2026-10-22T08:00:00.000Z' }] }));
    const said = await add!(dir, async () => { throw new Error('offline'); });
    expect(said).toMatch(/GBIF did not say the day it made 1 download \(A-1\): its records are dated by the day it was fetched/);
    expect(JSON.parse(readFileSync(join(dir, 'download.json'), 'utf8')).parts[0].created).toBeUndefined();
  });
});
