/**
 * Harness review of round sixty-one, mutation S5: the vault itself refuses to stage a replacement in the sample
 * collection (`openStaging`: "a guard in code, not only the locked page"). Removing it passed the unit suite: r61g-sample
 * stands the vault in (its `openStaging` throws by itself) and r61h-demo-isolation does not stage. Only the higher guard
 * in src/lib/backup/replace.ts is tested. (The per-collection staging name, mutation S7, is then unobservable: with this
 * guard no sample tab reaches the staging database. It is defence in depth, as the round says.)
 *
 * PASSES on f4ab4f8 (a guard; the first case fails under S5). Setup as r61h-demo-isolation.test.ts.
 * Adopted in round sixty-two (agent H; triage decision 10) from docs/review-61/tests/harness--sample-staging.test.ts.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const ss = new Map<string, string>();
const had = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
beforeEach(() => {
  ss.clear();
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: (k: string) => ss.get(k) ?? null, setItem: (k: string, v: string) => void ss.set(k, v), removeItem: (k: string) => void ss.delete(k), get length() { return ss.size; }, key: (i: number) => [...ss.keys()][i] ?? null } });
});
afterEach(() => {
  if (had) Object.defineProperty(globalThis, 'sessionStorage', had); else delete (globalThis as Record<string, unknown>).sessionStorage;
});
const names = async () => (await indexedDB.databases()).map((d) => d.name);

describe('staging a replacement, inside and outside the sample', () => {
  it('in the sample, the vault refuses to stage and opens no staging database at all', async () => {
    ss.set('cultifolio.demo', '1');
    vi.resetModules();
    const vault = await import('$lib/db/vault');
    await expect(vault.openStaging()).rejects.toThrow(/cannot be staged in the example collection/);
    expect((await names()).filter((n) => n?.includes('staging'))).toEqual([]);
  });
  it("outside the sample, staging opens the grower's own staging database, as before this round", async () => {
    vi.resetModules();
    const vault = await import('$lib/db/vault');
    const staged = await vault.openStaging();
    expect(await names()).toContain('cultifolio-staging');
    expect(await names()).not.toContain('cultifolio-demo-staging');
    await staged.discard();
  });
});
