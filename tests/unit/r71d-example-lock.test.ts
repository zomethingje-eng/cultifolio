/**
 * Round seventy-one, agent D: tests for the survivors of the self-review's mutation run in the example's lock (finding
 * 7). app.html's first script takes the "an example is open" hold, and the bar takes it over (round seventy, X1); four
 * mutations of that takeover passed every unit test and the example's browser specs:
 *  - MD2: a page whose example closes before its bar is drawn lets the first script's hold go;
 *  - MD3: the bar takes the hold over once: a bar drawn again holds a hold of its own, not the one it let go;
 *  - MD5: a first script whose request the browser refused leaves the bar to ask for its own;
 *  - MD6: a hold let go before the browser granted it is let go when granted, not kept for the page's life, where it
 *    held up every later delete of the example.
 * Tabs are stood in as r70x-lock.test.ts stands them in. Each passes on r71base and fails under its mutation (guards).
 */
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Locks } from './r67v-locks';

const mk = () => { const m = new Map<string, string>(); return { m, s: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, String(v)), removeItem: (k: string) => void m.delete(k), key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; } } }; };
/** The example's tab, the other tab, and the tab a Leave was pressed in; one local storage for the device. */
const A = mk(), B = mk(), C = mk(), local = mk();
let tab = A;
const KEYS = ['sessionStorage', 'localStorage', 'navigator', 'location', '__sampleOpen'] as const;
const had = Object.fromEntries(KEYS.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
let locks: Locks;
beforeEach(() => {
  for (const t of [A, B, C, local]) t.m.clear();
  tab = A;
  locks = new Locks();
  globalThis.indexedDB = new IDBFactory();
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, get: () => tab.s });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: local.s });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks } });
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { href: 'http://x/', search: '' } });
});
afterEach(() => {
  for (const k of KEYS) { const d = had[k]; if (d) Object.defineProperty(globalThis, k, d); else delete (globalThis as Record<string, unknown>)[k]; }
});

const OPEN = 'cultifolio-sample-open';
type Ch = { t: string; kind: string; id: string; field: string; value: unknown };
const DAY_AGO = Date.now() - 86_400_000;
const ch = (n: number, kind: string, id: string, field: string, value: unknown): Ch => ({ t: `${DAY_AGO + n}-0000-aaaaaaaaaaaa0000`, kind, id, field, value });
const seed: Ch[] = [ch(0, 'accession', 'r1sampleseeds0', 'taxonName', 'Copiapoa cinerea'), ch(1, 'event', 'e1', 'acc', 's1sampleseeds0'), ch(2, 'event', 'e1', 't', 'potup'), ch(3, 'event', 'e1', 'plants', ['r2sampleseeds0'])];

/** The example as tab A's page left it: the seed, marked, and `visitor`'s changes after it. */
async function exampleWith(visitor: Ch[]) {
  tab = A;
  A.m.set('cultifolio.demo', '1');
  vi.resetModules();
  const vault = await import('$lib/db/vault');
  await vault.appendChanges(seed as never);
  await vault.setMeta('demoSeedSeq', await vault.lastArrival());
  if (visitor.length) await vault.appendChanges(visitor as never);
  (await vault.openVault()).close();
}
/** app.html's first script, as tab A's page reloads: the page's scripts have not arrived yet. */
function firstScript() {
  tab = A;
  const code = [...readFileSync('src/app.html', 'utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
  new Function('localStorage', 'sessionStorage', 'document', 'location', 'navigator', 'window', code)(local.s, A.s, { documentElement: { dataset: {} } }, { search: '' }, { locks }, globalThis);
}
/** A page of `t` loading: its modules, read with its own storage. */
async function page(t: typeof A) {
  tab = t;
  vi.resetModules();
  return import('$lib/db/demo');
}
const tick = () => new Promise((r) => setTimeout(r, 0));
const exists = async () => (await indexedDB.databases()).some((d) => d.name === 'cultifolio-demo');

describe('the first script\'s hold, taken over by the bar (guards)', () => {
  it('MD2: an example closed under the page before its bar is drawn lets the first script\'s hold go', async () => {
    await exampleWith([]);
    firstScript();
    await tick();
    expect(locks.held.get(OPEN)).toEqual({ mode: 'shared', n: 1 });
    const mine = await page(A);
    mine.markExampleClosed();
    await tick();
    expect(locks.held.has(OPEN)).toBe(false);
  });
  it('MD3: a bar drawn again after it let go holds a hold of its own', async () => {
    await exampleWith([]);
    firstScript();
    await tick();
    const mine = await page(A);
    mine.keepSampleOpen()();
    await tick();
    expect(locks.held.has(OPEN)).toBe(false);
    const again = mine.keepSampleOpen();
    await tick();
    expect(locks.held.get(OPEN)).toEqual({ mode: 'shared', n: 1 });
    again();
  });
  it('MD5: a first script whose request was refused leaves the bar to ask for its own', async () => {
    await exampleWith([]);
    (globalThis as { __sampleOpen?: unknown }).__sampleOpen = { r: null, done: false, failed: true };
    const mine = await page(A);
    const stop = mine.keepSampleOpen();
    await tick();
    expect(locks.held.get(OPEN)).toEqual({ mode: 'shared', n: 1 });
    stop();
  });
  it('MD6: a hold let go before it was granted is let go as soon as it is granted', async () => {
    await exampleWith([]);
    let free!: () => void;
    void locks.request(OPEN, () => new Promise<void>((r) => (free = r))); // another page's delete, holding the lock
    await tick();
    firstScript(); // queued behind it
    await tick();
    const mine = await page(A);
    const stop = mine.keepSampleOpen();
    mine.markExampleClosed(); // the example closed under the page before the hold was granted
    stop();
    free();
    await new Promise((r) => setTimeout(r, 20));
    expect(locks.held.has(OPEN)).toBe(false);
  });
});
