/**
 * Round sixty-two, agent H (triage decision 10; the harness review's 2, outside reviews A44 and B13): the e2e seed helper
 * writes under the vault's own contract, and every spec uses it.
 *
 * The helper (tests/e2e/helpers/inject.ts) runs its body in the page through `page.evaluate`; here a stand-in page runs
 * the same body in Node over fake-indexeddb, against the real vault and collection. What it must keep:
 * - a load from a snapshot saved before the write still folds the rows (their arrival rows: a snapshot's tail is read
 *   from the arrival order);
 * - a snapshot the page began before the write, and saves after it, is refused (the fold counter moved), so the page's
 *   own first load, whose save is not awaited, cannot hide the rows whenever it lands;
 * - the numbers the rows carry are on the ledger of issued numbers, as a stored change's are.
 * The first case below is the race the four old copies left open, shown with the old write (changes, then the snapshot
 * deleted): the late save is accepted and the rows vanish from the next load. That is why no pause is needed.
 *
 * Adapted from docs/review-61/tests/harness--inject-order.test.ts, whose structural check (each spec's own transaction
 * names `order`) is replaced by the last case: no spec writes the log itself.
 */
import 'fake-indexeddb/auto';
import { wipeMeta } from './helpers/isolate';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import type { Page } from '@playwright/test';
import { inject, type Row } from '../e2e/helpers/inject';

type Store = typeof import('$lib/db/collection.svelte');
type Vault = typeof import('$lib/db/vault');
const DEV = 'aaaaaaaaaaaa';
const ls = new Map<string, string>();
const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
async function boot(): Promise<{ store: Store; vault: Vault }> {
  vi.resetModules();
  const vault = await import('$lib/db/vault');
  const store = await import('$lib/db/collection.svelte');
  return { store, vault };
}
/** A page whose `evaluate` runs the helper's body here, over fake-indexeddb, with its argument as Playwright passes it. */
const page = { evaluate: async (fn: (a: unknown) => unknown, arg: unknown) => fn(structuredClone(arg)) } as unknown as Page;
const plant = (id: string, no: string, name: string): Row[] => [['accession', id, 'acc', no], ['accession', id, 'taxonName', name], ['accession', id, 'status', 'growing']];

beforeEach(async () => {
  ls.clear();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k: string) => ls.get(k) ?? null, setItem: (k: string, v: string) => void ls.set(k, v), removeItem: (k: string) => void ls.delete(k) } });
  const { vault } = await boot();
  await vault.wipeVault();
  await wipeMeta(vault);
  await vault.setMeta('device', DEV);
});
afterEach(() => {
  if (had) Object.defineProperty(globalThis, 'localStorage', had); else delete (globalThis as { localStorage?: unknown }).localStorage;
});

/** The page's first load: it folds the (empty) log and takes its snapshot, which is what a late save would write. */
async function firstLoad() {
  const b = await boot();
  await b.store.collection.load();
  expect(await b.store.collection.snapshotWritten).toBe(true);
  const snap = (await b.vault.readFold())!;
  expect(snap).toBeTruthy();
  return { ...b, snap };
}
async function nextLoad() {
  const b = await boot();
  await b.store.collection.load();
  return b.store.collection;
}

describe('the shared e2e seed helper keeps the vault write contract', () => {
  it('the race it closes: with the old write (changes, then the snapshot deleted), a late save of the first load hides the rows', async () => {
    const { vault, snap } = await firstLoad();
    const db = await vault.openVault();
    const tx = db.transaction(['changes', 'meta'], 'readwrite');
    await Promise.all([...plant('p1', '2026-0042', 'Copiapoa cinerea').map(([kind, id, field, value], i) => tx.objectStore('changes').put({ t: `${Date.now() - 3_600_000 + i}-0000-abcdefabcdef0000`, kind, id, field, value } as never)), tx.objectStore('meta').delete('fold'), tx.done]);
    expect(await vault.writeFold(snap.fold, snap.gen)).toBe(true); // the page's save lands after the delete, and is taken
    const c = await nextLoad();
    expect(c.loaded?.from).toBe('snapshot');
    expect(c.accession('p1')).toBeUndefined(); // the rows are in the log and nowhere on the page
  });

  it("a late save of a load that began before the helper's write is refused, and the next load shows the rows", async () => {
    const { vault, snap } = await firstLoad();
    await inject(page, plant('p1', '2026-0042', 'Copiapoa cinerea'), Date.now() - 3_600_000);
    expect(await vault.writeFold(snap.fold, snap.gen)).toBe(false);
    expect(await vault.foldGen()).toBe(snap.gen + 1);
    const c = await nextLoad();
    expect(c.accession('p1')?.taxonName).toBe('Copiapoa cinerea');
  });

  it('a snapshot from before the write is brought up to date by the arrival rows the helper wrote', async () => {
    const { vault, snap } = await firstLoad();
    const stamps = await inject(page, plant('p1', '2026-0042', 'Copiapoa cinerea'), Date.now() - 3_600_000);
    expect((await vault.arrivalsAfter(snap.fold.seq)).changes.map((c) => c.t)).toEqual(stamps);
    // The old snapshot put back under the new counter: whatever saves a snapshot of the log before the write, its tail has the rows.
    const db = await vault.openVault();
    await db.put('meta', snap.fold, 'fold');
    const c = await nextLoad();
    expect(c.loaded?.from).toBe('snapshot');
    expect(c.accession('p1')?.taxonName).toBe('Copiapoa cinerea');
  });

  it('the numbers written go on the ledger, and parked stamps are added to what is parked', async () => {
    const { vault } = await boot();
    await vault.setMeta('parked', ['0000000000001-0000-ffffffffffff0000']);
    const stamps = await inject(page, [...plant('p1', '2026-0042', 'Copiapoa cinerea'), ['sowing', 's1', 'no', 'S2026-007']], Date.now() - 3_600_000, 'abcdefabcdef0000', true);
    expect(stamps).toHaveLength(4);
    expect(stamps[0]).toMatch(/^\d{13}-0000-abcdefabcdef0000$/);
    expect(await vault.getMeta('issued:accession')).toEqual(['2026-0042']);
    expect(await vault.getMeta('issued:sowing')).toEqual(['S2026-007']);
    expect(await vault.getMeta('parked')).toEqual(['0000000000001-0000-ffffffffffff0000', ...stamps]);
  });

  it('no spec writes the log itself: every seed goes through the shared helper', () => {
    const dir = 'tests/e2e';
    const bad: string[] = [];
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.ts'))) {
      const text = fs.readFileSync(`${dir}/${f}`, 'utf8');
      text.split('\n').forEach((line, i) => {
        // a put or add into the log, or a drop of the snapshot by hand (a wipe with clear() is not a seed, and is allowed)
        if (/objectStore\('changes'\)\.(put|add)\(|delete\('fold'\)|async function inject\(page[^)]*\)\s*\{\s*$/.test(line) && !/injectRows\(/.test(line)) bad.push(`${f}:${i + 1}`);
      });
    }
    expect(bad).toEqual([]);
  });
});
