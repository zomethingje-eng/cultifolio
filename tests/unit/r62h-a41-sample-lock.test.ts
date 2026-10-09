/**
 * Round sixty-two, agent H (triage decision 10; outside review A41, 6): a sample collection left behind is deleted on the
 * next load outside the sample only when no sample tab is open, which the browser says through a Web Lock that every
 * open sample tab holds (`keepSampleOpen`, `dropLeftoverSample`, src/lib/db/demo.ts). Reverted (the `if (!lock)` check
 * dropped), the deletion went ahead under an open sample tab, and no test saw it.
 *
 * A small lock manager stands in for the browser's (shared and exclusive modes, `ifAvailable`), and fake-indexeddb for
 * its databases. Without locks at all the leftover is never deleted (r61g-sample's case); this file is the lock's.
 */
import 'fake-indexeddb/auto';
import { it, expect, beforeEach, afterEach, vi } from 'vitest';

type Mode = 'shared' | 'exclusive';
/** Shared holders count up; an exclusive request with `ifAvailable` gets null while anyone holds the name. */
class Locks {
  held = new Map<string, { mode: Mode; n: number }>();
  async request(name: string, a: unknown, b?: unknown): Promise<unknown> {
    const opts = (typeof a === 'function' ? {} : a) as { mode?: Mode; ifAvailable?: boolean };
    const cb = (typeof a === 'function' ? a : b) as (lock: unknown) => unknown;
    const mode = opts.mode ?? 'exclusive';
    const h = this.held.get(name);
    if (h && !(mode === 'shared' && h.mode === 'shared')) {
      if (opts.ifAvailable) return cb(null);
      throw new Error('this stand-in does not queue');
    }
    this.held.set(name, { mode, n: (h?.n ?? 0) + 1 });
    try {
      return await cb({ name, mode });
    } finally {
      const now = this.held.get(name)!;
      if (now.n > 1) now.n--; else this.held.delete(name);
    }
  }
}
const hadNav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
let locks: Locks;
beforeEach(() => {
  locks = new Locks();
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks } });
});
afterEach(() => {
  if (hadNav) Object.defineProperty(globalThis, 'navigator', hadNav); else delete (globalThis as { navigator?: unknown }).navigator;
});
const exists = async (name: string) => (await indexedDB.databases()).some((d) => d.name === name);
async function leftover(name: string) {
  await new Promise<void>((res, rej) => { const r = indexedDB.open(name); r.onupgradeneeded = () => r.result.createObjectStore('changes'); r.onsuccess = () => { r.result.close(); res(); }; r.onerror = () => rej(r.error); });
}

it('a leftover sample is kept while a sample tab holds the lock, and deleted once none does', async () => {
  vi.resetModules();
  const demo = await import('$lib/db/demo');
  await leftover(demo.DEMO_DB);
  const stop = demo.keepSampleOpen(); // a sample tab, open: it holds the lock for its page's life
  await Promise.resolve();
  expect(await demo.dropLeftoverSample()).toBe(false);
  expect(await exists(demo.DEMO_DB)).toBe(true); // not deleted from under the open tab
  stop(); // that tab closes
  await new Promise((r) => setTimeout(r, 0));
  expect(await demo.dropLeftoverSample()).toBe(true);
  expect(await exists(demo.DEMO_DB)).toBe(false);
});
