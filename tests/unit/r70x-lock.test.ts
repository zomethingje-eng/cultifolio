/**
 * Round seventy, agent X: triage-69 X1 (S-D1). An example tab held the "an example is open" lock only from its bar's
 * mount (`keepSampleOpen`), so from the moment a reloading example tab's old page went until its new page was drawn (1 to
 * 4.5 s on a slow phone) it held nothing. A page outside the example that loaded in that gap read the example as left:
 * with the visitor's records in it, it offered it back and "Delete it" deleted it; with nothing of theirs, it deleted it
 * silently and the reloading tab set out a second seed. Now app.html's first script takes the lock before anything else
 * runs, and the bar takes that hold over.
 *
 * The tabs are stood in as tests/unit/r67v-leftover.test.ts stands them in: one lock manager and one database for the
 * device, a session storage per tab, each tab's modules loaded afresh as its page loads. app.html's first script is run
 * from the file, as tests/unit/r69x-left.test.ts runs it.
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

describe('a reloading example tab holds the example open from its first script (X1; S-D1)', () => {
  it('another tab\'s page neither offers nor deletes it while the tab\'s scripts are still arriving', async () => {
    await exampleWith([ch(10, 'location', 'l9', 'name', 'Visitor shelf')]);
    firstScript();
    await tick();
    expect(locks.held.get(OPEN)?.mode).toBe('shared'); // base: undefined, nothing held until the bar is drawn
    const other = await page(B);
    const offered: number[] = [];
    expect(await other.dropLeftoverSample((n) => offered.push(n))).toBe(false);
    expect(offered).toEqual([]); // base: [1], "You left an example collection…" while it is open in a tab
    expect(await other.deleteLeftoverSample()).toBe('blocked'); // base: 'deleted', the visitor's shelf with it
    expect(await exists()).toBe(true);
  });
  it('with nothing of the visitor\'s in it, it is not deleted silently under the loading tab', async () => {
    await exampleWith([]);
    firstScript();
    await tick();
    const other = await page(B);
    expect(await other.dropLeftoverSample()).toBe(false); // base: true, deleted, and the reloading tab set out a second seed
    expect(await exists()).toBe(true);
  });
  it('the bar takes the hold over, asking for no second one, and lets it go when the example closes under the page', async () => {
    await exampleWith([ch(10, 'location', 'l9', 'name', 'Visitor shelf')]);
    firstScript();
    await tick();
    const mine = await page(A);
    const request = vi.spyOn(locks, 'request');
    const stop = mine.keepSampleOpen();
    await tick();
    expect(request).not.toHaveBeenCalled(); // base: a request of its own (the first script took none)
    expect(locks.held.get(OPEN)).toEqual({ mode: 'shared', n: 1 });
    mine.markExampleClosed();
    await tick();
    expect(locks.held.has(OPEN)).toBe(false);
    const offered: number[] = [];
    await (await page(B)).dropLeftoverSample((n) => offered.push(n));
    expect(offered).toEqual([1]); // once no tab holds it, it is a leftover, as before
    stop();
  });
  it('a delete already queued by the first page after a Leave waits for the loading tab, and goes once the example closes there', async () => {
    await exampleWith([]);
    firstScript();
    await tick();
    C.m.set('cultifolio.sampleLeft', '1'); // tab C pressed Leave; its next page deletes the example under the lock
    const leaving = await page(C);
    let left: string | null | undefined;
    void leaving.finishLeaving(60_000).then((r) => (left = r));
    await new Promise((r) => setTimeout(r, 300));
    expect(left).toBeUndefined(); // base: 'deleted', from under a tab whose page is still loading
    expect(await exists()).toBe(true);
    // Tab A's bar is drawn after C's Leave: its word on the channel came before the page listened, and the generation says it.
    const mine = await page(A);
    const stop = mine.keepSampleOpen();
    expect(mine.exampleClosed()).toBe(true);
    await vi.waitFor(() => expect(left).toBe('deleted'));
    expect(await exists()).toBe(false);
    stop();
  });
  it('MX6 (a guard): "Delete it" writes a new generation, so a tab away in that example opens the grower\'s own', async () => {
    await exampleWith([ch(10, 'location', 'l9', 'name', 'Visitor shelf')]);
    const other = await page(B);
    local.m.set('cultifolio.sampleGen', 'before');
    expect(await other.deleteLeftoverSample()).toBe('deleted');
    expect(local.m.get('cultifolio.sampleGen')).not.toBe('before'); // under the mutation: 'before', and the tab away set out a new example
  });
  it('R47-19 (a guard): a leftover answered "Not now" is offered again once the visitor has changed it since', async () => {
    await exampleWith([ch(10, 'location', 'l9', 'name', 'Visitor shelf')]);
    const offered: number[] = [];
    const first = await page(B);
    await first.dropLeftoverSample((n) => offered.push(n));
    await first.leftoverLater();
    await (await page(B)).dropLeftoverSample((n) => offered.push(n));
    expect(offered).toEqual([1]); // answered: not offered again
    tab = A;
    vi.resetModules();
    const vault = await import('$lib/db/vault');
    await vault.appendChanges([ch(20, 'location', 'l10', 'name', 'Second shelf')] as never);
    (await vault.openVault()).close();
    await (await page(B)).dropLeftoverSample((n) => offered.push(n));
    expect(offered).toEqual([1, 2]); // with the answer read as for good (R47-19's revert): [1]
  });
  it('without Web Locks the first script asks nothing and the page loads as before (a guard)', async () => {
    tab = A;
    A.m.set('cultifolio.demo', '1');
    const code = [...readFileSync('src/app.html', 'utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
    const dataset: Record<string, string> = {};
    const w: Record<string, unknown> = {};
    new Function('localStorage', 'sessionStorage', 'document', 'location', 'navigator', 'window', code)(local.s, A.s, { documentElement: { dataset } }, { search: '' }, {}, w);
    expect(dataset.demo).toBe('1');
    expect(w.__sampleOpen).toBeUndefined();
  });
});
