/**
 * Round seventy-two, reviewer E: guards for three survivors of the self-review's mutation run of round seventy-one's code
 * (triage, E "Gaps"). Each passes on r72base and fails under its mutant:
 * - the free count under a whole line (`markImported`'s `enough`, counting a plant a line found whole as free);
 * - the unsent list's deletion (`queueReadable` keeping the meta key when every stamp in it has left the log);
 * - the photograph wait's cap at sixteen minutes, which is in r72e-sync.test.ts with its harness.
 */
import 'fake-indexeddb/auto';
import { wipeMeta } from './helpers/isolate';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { parseCsv, detectHeader, guessMapping } from '$lib/import/csv';
import { rowsFromSheet } from '$lib/import/rows';
import { markSheet, type ImportRow } from '$lib/import/plan';

const TODAY = '2026-10-05';
const sheet = (text: string) => { const s = parseCsv(text); const h = detectHeader(s); return rowsFromSheet(s, guessMapping(s, h), h, TODAY, { dateOrder: null }).rows; };
type P = { taxonName: string; acquired: string | null; importKey: string; importKeyBare?: string };
const file = (rows: ImportRow[]): P[] => rows.flatMap((r) => (r.importKeys ?? []).map((k, i) => ({ taxonName: r.name, acquired: r.acquired ?? null, importKey: k, ...(r.importKeysBare?.[i] ? { importKeyBare: r.importKeysBare[i] } : {}) })));
const run = (rows: ImportRow[], plants: P[]) => { const here = new Map(plants.map((p) => [p.importKey, p])); return markSheet(rows, { has: (k) => here.get(k) as never, dropped: new Set(), held: () => [], plants: plants as never }); };
const show = (rows: ImportRow[]) => rows.map((r) => (r.done ? 'done' : r.changed ? 'changed' : 'NEW'));

describe('the free count under a whole line (mutant: a plant taken by a line found whole counted as free)', () => {
  it('two plants from two like lines; the sheet keeps one plain and adds two told apart by a column: one plant is free for two lines, so neither takes it', () => {
    const plants = file(sheet('species,acquired\nAloe vera,2024-05-01\nAloe vera,2024-05-01\n'));
    const again = run(sheet('species,acquired,locality\nAloe vera,2024-05-01,\nAloe vera,2024-05-01,Totoral\nAloe vera,2024-05-01,Paposo\n'), plants);
    expect(show(again)[0]).toBe('done');
    // Which of the two told apart is the second plant, the sheet does not say (rule 3): neither takes it. (The first may be
    // said to look already imported, `changed`, which offers it as a new plant with a word; never `done`.)
    expect(again.slice(1).map((r) => r.done ?? false)).toEqual([false, false]);
    expect(again.slice(1).map((r) => r.matchedKeys ?? null)).toEqual([null, null]);
  });
});

describe('the unsent list once every stamp in it has left the log (mutant: the key kept)', () => {
  vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });
  beforeEach(async () => { vi.resetModules(); const vault = await import('$lib/db/vault'); await vault.wipeVault(); await wipeMeta(vault); await vault.setMeta('device', 'aaaaaaaaaaaa'); });
  it('a list of stamps no longer in the log is forgotten, and nothing is queued', async () => {
    const vault = await import('$lib/db/vault');
    await vault.setMeta('unsentUnreadable', ['00000000001-0000-bbbbbbbbbbbb']);
    expect(await vault.queueReadable()).toEqual([]);
    expect(await vault.getMeta('unsentUnreadable')).toBeUndefined();
  });
});
