/**
 * Harness review of round sixty: the snapshot's `checked` key (collection.svelte.ts saveFold writes `checked:
 * clockChecked()`, fromFold compares it). The round's test (r60-clock-review B4) shows a snapshot taken under an
 * unchecked clock is not read once the clock is confirmed. Nothing shows the other half: a snapshot taken under a
 * confirmed clock IS read under it. Writing `checked: false` always passed the suite (under load an unrelated timeout
 * hid this in a first pass); every synced device would then fold its whole log on every load, the snapshot never used.
 * PASSES on round-sixty code; FAILS under that mutation.
 * Setup copied from r60-clock-review.test.ts (a localStorage stand-in so the confirmation survives a reboot).
 * Run: copy to tests/unit/ and `npx vitest run tests/unit/harness--snapshot-checked.test.ts`.
 */
import 'fake-indexeddb/auto';
import { wipeMeta } from './helpers/isolate';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { hlcEncode } from '$core/hlc';
import type { Change } from '$core/log';

type Store = typeof import('$lib/db/collection.svelte');
type Vault = typeof import('$lib/db/vault');
type Hlc = typeof import('$core/hlc');

const DEV = 'aaaaaaaaaaaa';
const PEER = 'bbbbbbbbbbbbq0q0';
const DAY = 86_400_000;
const YEAR = 365 * DAY;

const ls = new Map<string, string>();
const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

async function boot(): Promise<{ store: Store; vault: Vault; hlc: Hlc }> {
  vi.resetModules();
  const vault = await import('$lib/db/vault');
  const store = await import('$lib/db/collection.svelte');
  const hlc = await import('$core/hlc');
  return { store, vault, hlc };
}

beforeEach(async () => {
  vi.useRealTimers();
  ls.clear();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k: string) => ls.get(k) ?? null, setItem: (k: string, v: string) => void ls.set(k, v), removeItem: (k: string) => void ls.delete(k) } });
  const { vault, hlc } = await boot();
  hlc._resetClockOffset();
  await vault.wipeVault();
  await wipeMeta(vault);
  await vault.setMeta('device', DEV);
});
afterEach(() => {
  vi.useRealTimers();
  if (had) Object.defineProperty(globalThis, 'localStorage', had); else delete (globalThis as { localStorage?: unknown }).localStorage;
});

describe('the snapshot under a confirmed clock (harness review)', () => {
  it('is written as confirmed and read at the next load under the same confirmed clock', async () => {
    let b = await boot();
    b.hlc.trustServerTime(Date.now()); // a sync run's reading: the clock is confirmed, and the confirmation is stored
    await b.store.collection.load();
    await b.store.collection.addAccession({ taxonName: 'Copiapoa cinerea' } as never);
    b = await boot();
    expect(b.hlc.clockChecked()).toBe(true);
    await b.store.collection.load();
    await b.store.collection.snapshotWritten;
    b = await boot();
    expect(b.hlc.clockChecked()).toBe(true);
    await b.store.collection.load();
    expect(b.store.collection.loaded?.from).toBe('snapshot');
    expect(b.store.collection.accessions.map((a) => a.taxonName)).toEqual(['Copiapoa cinerea']);
  });
});
