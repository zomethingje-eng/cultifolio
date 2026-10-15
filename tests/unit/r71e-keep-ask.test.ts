/**
 * Round seventy-one, agent E (self-review E9): the answer to the "keep data" question is said. The collection's load asks
 * once something is recorded (a place, say), and the first plant's ask on that page was then answered null, so GrowLayer
 * said nothing; and a first plant on a later page within the month was answered null too, so the grower never heard
 * whether the browser had promised. Failed on the base: both `askToKeep('first')` below answered null.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('$lib/db/demo', () => ({ inDemo: () => false, PAGE_IN_DEMO: false }));

const store = new Map<string, string>();
let persistCalls = 0;
let persistedCalls = 0;
const nav = {
  storage: {
    persist: () => { persistCalls++; return Promise.resolve(true); },
    persisted: () => { persistedCalls++; return Promise.resolve(true); }
  }
};
const T0 = Date.UTC(2026, 9, 16, 12);
async function load() { vi.resetModules(); return import('$lib/ui/keep-ask'); }

beforeEach(() => {
  store.clear(); persistCalls = 0; persistedCalls = 0;
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
  vi.stubGlobal('navigator', nav);
  vi.useFakeTimers({ now: T0, toFake: ['Date'] });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('E9: the keep-data answer is said', () => {
  it('the load asked (a place was recorded); the first plant on the same page is handed that answer, and nothing more is asked', async () => {
    const k = await load();
    expect(await k.askToKeep('load')).toBe(true);
    expect(await k.askToKeep('first')).toBe(true); // base: null
    expect(persistCalls).toBe(1);
  });
  it('asked on an earlier page this month: the first plant reads the browser\'s standing answer, putting no question', async () => {
    expect(await (await load()).askToKeep('load')).toBe(true);
    vi.setSystemTime(T0 + 3 * 86_400_000);
    const k = await load();
    expect(await k.askToKeep('first')).toBe(true); // base: null
    expect(persistCalls).toBe(1);
    expect(persistedCalls).toBe(1);
  });
  it('guard: never asked on this device, within the month or not, the load reads nothing without asking', async () => {
    const k = await load();
    store.set('cultifolio.persistAskedAt', String(T0 - 86_400_000));
    expect(await k.askToKeep('load')).toBeNull();
    expect(persistCalls + persistedCalls).toBe(0);
  });
});
