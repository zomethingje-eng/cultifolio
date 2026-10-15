/**
 * Round seventy-one, agent D: the key without the columns no field takes is stored by the import itself (the
 * self-review's mutation survivor MI15: `commit.ts` writing no `importKeyBare` passed every test, since the only test of
 * the stored key built its plants by hand). A sheet with a Locality column is imported through `commitImport`, then read
 * again without the column against the plants as the import page reads them. The case passes on r71base too (a guard):
 * it fails with the line in `commit.ts` that writes `importKeyBare` taken out.
 */
import 'fake-indexeddb/auto';
import { wipeMeta } from './helpers/isolate';
import { describe, it, expect, beforeEach, vi } from 'vitest';
vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });

async function boot() {
  vi.resetModules();
  const vault = await import('$lib/db/vault');
  const store = await import('$lib/db/collection.svelte');
  const plan = await import('$lib/import/plan');
  const commit = await import('$lib/import/commit');
  const csv = await import('$lib/import/csv');
  const rows = await import('$lib/import/rows');
  return { vault, collection: store.collection, plan, commit, csv, rows };
}
beforeEach(async () => {
  const { vault } = await boot();
  await vault.wipeVault();
  await wipeMeta(vault);
  await vault.setMeta('device', 'aaaaaaaaaaaa');
});
const TODAY = '2026-10-05';

describe('importKeyBare, stored by the import (MI15)', () => {
  it('guard: a sheet that has lost its Locality column finds both plants it filed', async () => {
    const b = await boot();
    const c = b.collection;
    await c.load();
    const read = (text: string) => { const s = b.csv.parseCsv(text); const h = b.csv.detectHeader(s); return b.rows.rowsFromSheet(s, b.csv.guessMapping(s, h), h, TODAY, { dateOrder: null }).rows; };
    const first = read('species,acquired,locality\nAloe vera,2024-05-01,Totoral\nAloe vera,2024-05-01,Paposo\n');
    const plan = b.plan.planNumbers(first, [], c.scheme, 2024, (no) => c.isNumberTaken(no));
    const r = await b.commit.commitImport(first, new Map(), plan, { makePlaces: false });
    expect(r.failed).toBeNull();
    const all = c.allAccessions();
    expect(all.map((a) => a.importKeyBare).sort()).toEqual([...first.flatMap((x) => x.importKeysBare ?? [])].sort());
    // As the import page marks a sheet (routes/plants/import/+page.svelte).
    const here = new Map(all.filter((a) => a.importKey).map((a) => [a.importKey!, a]));
    const again = b.plan.markSheet(read('species,acquired\nAloe vera,2024-05-01\nAloe vera,2024-05-01\n'), { has: (k) => here.get(k), dropped: new Set(), held: () => [], plants: all });
    expect(again.map((x) => !!x.done)).toEqual([true, true]);
  });
});
