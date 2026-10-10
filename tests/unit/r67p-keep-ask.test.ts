/**
 * The one gate for "keep this site's data" (round sixty-seven; triage-66 P1, contract C4). Firefox puts the question to
 * the person and answers only when they do, for good if it is dismissed: GrowLayer's first-plant ask, gated only by the
 * key written once the answer was said, came back on every full page load (S-E4, S-F2, R45-6, IND-2). Here `persist()`
 * never answers, as a dismissed Firefox question, and each "page load" is a fresh module.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

let demo = false;
vi.mock('$lib/db/demo', () => ({ inDemo: () => demo, get PAGE_IN_DEMO() { return demo; } })); // the page's reading (contract C3), as the merge wired it

const store = new Map<string, string>();
let storageThrows = false;
const localStorageStub = {
  getItem: (k: string) => { if (storageThrows) throw new Error('refused'); return store.get(k) ?? null; },
  setItem: (k: string, v: string) => { if (storageThrows) throw new Error('refused'); store.set(k, v); },
  removeItem: (k: string) => { if (storageThrows) throw new Error('refused'); store.delete(k); }
};
/** Each call to the browser, with what the gate had written by then. */
let calls: Array<string | null> = [];
let answer: 'never' | boolean = 'never';
const navigatorStub = {
  storage: {
    persist: () => {
      calls.push(store.get('cultifolio.persistAskedAt') ?? null);
      return answer === 'never' ? new Promise<boolean>(() => {}) : Promise.resolve(answer);
    },
    persisted: () => Promise.resolve(false)
  }
};
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 10, 12);

/** A full page load: the module and its page flag afresh, the device's storage kept. */
async function load() {
  vi.resetModules();
  return import('$lib/ui/keep-ask');
}

beforeEach(() => {
  store.clear();
  calls = [];
  answer = 'never';
  demo = false;
  storageThrows = false;
  vi.stubGlobal('localStorage', localStorageStub);
  vi.stubGlobal('navigator', navigatorStub);
  vi.useFakeTimers({ now: T0, toFake: ['Date'] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('askToKeep: one gate for every ask', () => {
  it('writes the time before the browser is called, and a question never answered is not put again on the next five loads', async () => {
    const k = await load();
    let settled = false;
    void k.askToKeep('first').then(() => (settled = true));
    await Promise.resolve();
    expect(calls).toEqual([String(T0)]); // the time was there when the browser was called
    expect(settled).toBe(false); // Firefox, question dismissed: no answer, ever
    for (let i = 0; i < 5; i++) {
      const again = await load();
      expect(await again.askToKeep('load')).toBeNull();
      expect(await again.askToKeep('first')).toBeNull();
    }
    expect(calls.length).toBe(1);
  });

  it('the monthly rule: not again within 30 days of the last ask, whichever reason asked; again at 30 days', async () => {
    answer = false;
    expect(await (await load()).askToKeep('load')).toBe(false);
    vi.setSystemTime(T0 + 29 * DAY + 23 * 3_600_000);
    expect(await (await load()).askToKeep('first')).toBeNull();
    expect(calls.length).toBe(1);
    vi.setSystemTime(T0 + 30 * DAY);
    expect(await (await load()).askToKeep('first')).toBe(false);
    expect(calls.length).toBe(2);
    expect(store.get('cultifolio.persistAskedAt')).toBe(String(T0 + 30 * DAY));
  });

  it('one page asks once, even when both the load and the first plant ask', async () => {
    answer = true;
    const k = await load();
    expect(await k.askToKeep('load')).toBe(true);
    expect(await k.askToKeep('first')).toBeNull();
    expect(calls.length).toBe(1);
  });

  it('where storage refuses the time, a page still asks only once', async () => {
    storageThrows = true;
    const k = await load();
    void k.askToKeep('load');
    expect(await k.askToKeep('first')).toBeNull();
    expect(calls).toEqual([null]);
  });

  it('nothing is asked or written in the example collection', async () => {
    demo = true;
    expect(await (await load()).askToKeep('first')).toBeNull();
    expect(calls).toEqual([]);
    expect(store.has('cultifolio.persistAskedAt')).toBe(false);
  });

  it('a time stored by a clock that was ahead, and since put right, does not hold the ask back for months', async () => {
    store.set('cultifolio.persistAskedAt', String(T0 + 200 * DAY));
    answer = false;
    expect(await (await load()).askToKeep('load')).toBe(false);
    expect(calls.length).toBe(1);
  });

  it('a browser with no persist() is not asked, and nothing is written', async () => {
    vi.stubGlobal('navigator', { storage: {} });
    expect(await (await load()).askToKeep('first')).toBeNull();
    expect(store.has('cultifolio.persistAskedAt')).toBe(false);
  });
});

describe('every ask in the app goes through the gate', () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (/\.(ts|svelte)$/.test(f)) out.push(p.replace(/\\/g, '/'));
    }
    return out;
  }
  it("GrowLayer's first-plant ask calls askToKeep and never persist() itself", () => {
    const g = readFileSync('src/lib/ui/grow/GrowLayer.svelte', 'utf8');
    expect(g).toMatch(/askToKeep\('first'\)/);
    expect(g).not.toMatch(/\.persist\(\)/);
  });
  it('no other file calls persist() (vault.ts until the load goes through the gate at the merge)', () => {
    const callers = walk('src').filter((f) => /\.persist\(\)/.test(readFileSync(f, 'utf8')));
    // vault.ts's requestPersistence is the load's, behind its own month on the same key; R routes the load through
    // askToKeep (contract C4), after which only keep-ask.ts remains.
    expect(callers.filter((f) => !f.endsWith('src/lib/ui/keep-ask.ts') && !f.endsWith('src/lib/db/vault.ts'))).toEqual([]);
  });
});
