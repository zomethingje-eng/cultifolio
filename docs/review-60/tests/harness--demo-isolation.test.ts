/**
 * Harness review of round sixty: the sample collection's isolation (src/lib/db/demo.ts, vault.ts DB_NAME). The unit
 * test of the sample (r60f-demo.test.ts) replaces the whole vault with an in-memory stand-in, so nothing in the unit
 * suite reaches the two guards that keep the sample apart: which database a page opens, and that leaving deletes it.
 * Single-line mutations of both passed the unit suite (the database name the same for both; leaveDemo deleting another
 * name). The e2e tests r60 11 and r60 12 catch the first (checked); r60 12 reads the browser's database list and should
 * catch the second too (not run under that mutation).
 * PASSES on round-sixty code; FAILS under each mutation.
 * Run: copy to tests/unit/ and `npx vitest run tests/unit/harness--demo-isolation.test.ts`.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const ss = new Map<string, string>();
const had = { ss: Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage'), loc: Object.getOwnPropertyDescriptor(globalThis, 'location') };
const loc = { href: 'http://x/plants' };
beforeEach(() => {
  ss.clear();
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: (k: string) => ss.get(k) ?? null, setItem: (k: string, v: string) => void ss.set(k, v), removeItem: (k: string) => void ss.delete(k) } });
  Object.defineProperty(globalThis, 'location', { configurable: true, value: loc });
});
afterEach(() => {
  for (const [k, d] of [['sessionStorage', had.ss], ['location', had.loc]] as const) { if (d) Object.defineProperty(globalThis, k, d); else delete (globalThis as Record<string, unknown>)[k]; }
});
const names = async () => (await indexedDB.databases()).map((d) => d.name).sort();

describe('the sample collection is a database of its own (harness review)', () => {
  it('a page in the sample opens cultifolio-demo, never the grower\'s cultifolio; leaving deletes it and clears the flag', async () => {
    ss.set('cultifolio.demo', '1');
    vi.resetModules();
    const vault = await import('$lib/db/vault');
    await vault.setMeta('device', 'demodemodemo');
    expect(await names()).toContain('cultifolio-demo');
    expect(await names()).not.toContain('cultifolio');
    (await vault.openVault()).close();
    const { leaveDemo } = await import('$lib/db/demo');
    await leaveDemo('/');
    expect(ss.has('cultifolio.demo')).toBe(false);
    expect(loc.href).toBe('/');
    expect(await names()).not.toContain('cultifolio-demo');
  });
  it('a page outside the sample opens the grower\'s own database', async () => {
    vi.resetModules();
    const vault = await import('$lib/db/vault');
    await vault.setMeta('device', 'growergrower');
    expect(await names()).toContain('cultifolio');
    expect(await names()).not.toContain('cultifolio-demo');
  });
});
