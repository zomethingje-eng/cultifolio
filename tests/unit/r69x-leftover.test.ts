/**
 * Round sixty-nine, agent X: triage-68 X2 (R46-19). A leftover example holding the visitor's records is offered back, and
 * the offer is noted only when it is answered: it was noted as it was shown, so a tab closed without an answer kept the
 * leftover for good, never offered or deleted again. Untouched for 30 days it is deleted, answered or not, and a tab
 * still away in it opens the grower's own collection (a new generation). The harness is tests/unit/r67v-leftover.test.ts's.
 */
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Locks } from './r67v-locks';

const ss = new Map<string, string>(), ls = new Map<string, string>();
const st = (m: Map<string, string>) => ({ getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, String(v)), removeItem: (k: string) => void m.delete(k), key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; } });
const KEYS = ['sessionStorage', 'localStorage', 'navigator', 'location'] as const;
const had = Object.fromEntries(KEYS.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
beforeEach(() => {
  ss.clear(); ls.clear();
  globalThis.indexedDB = new IDBFactory();
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: st(ss) });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: st(ls) });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: new Locks() } });
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { href: 'http://x/' } });
});
afterEach(() => {
  for (const k of KEYS) { const d = had[k]; if (d) Object.defineProperty(globalThis, k, d); else delete (globalThis as Record<string, unknown>)[k]; }
});
type C = { t: string; kind: string; id: string; field: string; value: unknown };
/** An example left behind, its newest change `daysAgo` old: the seed, then a plant of the visitor's. */
async function leftBehind(daysAgo: number) {
  const at = Date.now() - daysAgo * 86_400_000;
  const ch = (n: number, kind: string, id: string, field: string, value: unknown): C => ({ t: `${at - 100 + n}-0000-aaaaaaaaaaaa0000`, kind, id, field, value });
  ss.set('cultifolio.demo', '1');
  vi.resetModules();
  const vault = await import('$lib/db/vault');
  await vault.appendChanges([ch(0, 'accession', 'r1sampleseeds0', 'taxonName', 'Copiapoa cinerea'), ch(1, 'event', 'e1', 'acc', 's1sampleseeds0'), ch(2, 'event', 'e1', 't', 'potup'), ch(3, 'event', 'e1', 'plants', ['r2sampleseeds0'])] as never);
  await vault.setMeta('demoSeedSeq', await vault.lastArrival());
  await vault.appendChanges([ch(10, 'accession', 'r9', 'taxonName', 'Lithops lesliei')] as never);
  (await vault.openVault()).close();
  ss.clear();
  vi.resetModules();
  return import('$lib/db/demo');
}
const exists = async () => (await indexedDB.databases()).some((d) => d.name === 'cultifolio-demo');

describe('the leftover\'s offer and its age (X2; R46-19)', () => {
  it('unanswered, it is offered again on the next page; "Not now" notes it', async () => {
    const demo = await leftBehind(1);
    const offered: number[] = [];
    await demo.dropLeftoverSample((n) => offered.push(n));
    await demo.dropLeftoverSample((n) => offered.push(n));
    expect(offered).toEqual([1, 1]); // base: [1], and never again
    await demo.leftoverLater();
    await demo.dropLeftoverSample((n) => offered.push(n));
    expect(offered).toEqual([1, 1]);
    expect(await exists()).toBe(true);
  });
  it('untouched for more than 30 days it is deleted, answered or not, and a tab away in it opens the grower\'s own', async () => {
    const demo = await leftBehind(31);
    const offered: number[] = [];
    expect(await demo.dropLeftoverSample((n) => offered.push(n))).toBe(true); // base: false, kept for good
    expect(offered).toEqual([]);
    expect(await exists()).toBe(false);
    expect(ls.get('cultifolio.sampleGen')).toBeTruthy();
  });
  it('at 29 days it is still kept and offered', async () => {
    const demo = await leftBehind(29);
    const offered: number[] = [];
    expect(await demo.dropLeftoverSample((n) => offered.push(n))).toBe(false);
    expect(offered).toEqual([1]);
    expect(await exists()).toBe(true);
  });
});
