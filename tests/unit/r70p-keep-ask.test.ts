/**
 * Round seventy, agent P (triage-69 P3, R47-20): the "keep data" question is asked from the first plant's commit, not only
 * once a page has read the collection. On a loaded WebKit and Firefox run no page finished reading before the next one
 * opened, and nothing was asked (r67p-pages:21 received 0 asks; r60-grow:465 never said an answer); a grower on a slow
 * phone who moves on within a second is the same case. Failed on the base: `keepOnFirstPlant` did not exist, and a second
 * ask for the first plant on a page answered null, so the answer GrowLayer says was lost when the commit asked first.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

vi.mock('$app/environment', () => ({ browser: true, dev: false, building: false, version: 'test' }));

const GLOBALS = ['localStorage', 'sessionStorage', 'navigator'] as const;
const had = Object.fromEntries(GLOBALS.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
const def = (k: string, value: unknown) => Object.defineProperty(globalThis, k, { configurable: true, writable: true, value });
function store() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, String(v)), removeItem: (k: string) => void m.delete(k), clear: () => m.clear(), key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; } };
}
let asks = 0;
beforeAll(() => {
  def('localStorage', store());
  def('sessionStorage', store());
  def('navigator', { language: 'en-GB', storage: { persist: () => { asks++; return Promise.resolve(true); } } });
});
afterAll(() => { for (const k of GLOBALS) { const d = had[k]; if (d) Object.defineProperty(globalThis, k, d); else delete (globalThis as Record<string, unknown>)[k]; } });

/** A collection as `keepOnFirstPlant` reads it: its plants, and the listeners its commits tell. */
function fakeCollection() {
  const fns = new Set<(cs: Array<{ kind: string }>) => void>();
  const c = { accessions: [] as unknown[], onLocalChange(fn: (cs: Array<{ kind: string }>) => void) { fns.add(fn); return () => fns.delete(fn); } };
  const commit = (kind: string) => { if (kind === 'accession') c.accessions.push({}); for (const fn of fns) fn([{ kind }]); };
  return { c, commit, listeners: () => fns.size };
}

describe('the first plant\'s commit asks', () => {
  beforeEach(async () => { asks = 0; localStorage.clear(); (await import('$lib/ui/keep-ask')).forgetPageAsk(); });
  it('a commit that writes the first plant asks the browser, on the page that wrote it', async () => {
    const keep = await import('$lib/ui/keep-ask');
    const { c, commit } = fakeCollection();
    const stop = keep.keepOnFirstPlant(c, () => false);
    commit('location'); // a place is not a plant
    expect(asks).toBe(0);
    commit('accession');
    expect(asks).toBe(1);
    expect(localStorage.getItem(keep.PERSIST_ASKED)).not.toBeNull(); // the month's time, written before the ask
    commit('accession'); // a second plant on the same page asks nothing more
    expect(asks).toBe(1);
    stop();
  });
  it('GrowLayer\'s ask for the first plant, after the commit asked, is handed the same answer and asks nothing', async () => {
    const keep = await import('$lib/ui/keep-ask');
    const { c, commit } = fakeCollection();
    keep.keepOnFirstPlant(c, () => false);
    commit('accession');
    expect(await keep.askToKeep('first')).toBe(true); // the base answered null: nothing was said
    expect(asks).toBe(1);
    expect(await keep.askToKeep('load')).toBeNull(); // the load's ask stays one ask a page
  });
  it('no ask once the answer has been said on this device, and none inside the month', async () => {
    const keep = await import('$lib/ui/keep-ask');
    const a = fakeCollection();
    keep.keepOnFirstPlant(a.c, () => true);
    a.commit('accession');
    expect(asks).toBe(0);
    localStorage.setItem(keep.PERSIST_ASKED, String(Date.now() - 86_400_000));
    const b = fakeCollection();
    keep.keepOnFirstPlant(b.c, () => false);
    b.commit('accession');
    expect(asks).toBe(0);
  });
});
