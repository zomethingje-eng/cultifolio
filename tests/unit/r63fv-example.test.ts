/**
 * Round sixty-three, the fix pass (fixer V; review R1, findings 1, 2, 3, 5 and 7). Adopted from the reviewer's
 * reproductions (r1-trap.test.ts), inverted to assert the fix:
 * - A load into the example that the page calls off ("Leave site?" answered Cancel) leaves the tab as it was: out of the
 *   example, and no longer "entering" (R1, 1).
 * - A device whose records are all held or parked, or that has sync set up, is not empty (R1, 2 and 5).
 * - Nothing goes into the example while a restore, a merge, an import or a sync run is in progress, nor before the
 *   layout has read sync's key; a button pressed then says why (R1, 2 and 7).
 * - The menu's way in moves inside the app first, so the page being left asks about its own work; called off, nothing
 *   changes (R1, 1).
 * - A page the back-forward cache brings back into a tab whose mode changed loads afresh (R1, 3).
 */
import { it, expect, vi, beforeEach, afterEach, describe } from 'vitest';

const col = { ready: true, accessions: [] as unknown[], sowings: [] as unknown[], locations: [] as unknown[], taxa: [] as unknown[], mySpecies: new Map<string, unknown>(), heldWaiting: 0, parkedRecords: 0, recordCount: 0 };
vi.mock('$lib/db/collection.svelte', () => ({ collection: col }));
vi.mock('$app/environment', () => ({ browser: true, dev: false, building: false, version: 'test' }));
const syncState = { configured: false, busy: null as string | null };
vi.mock('$lib/sync/engine.svelte', () => ({ sync: syncState }));
/** The app's own move: `stays` is a page whose "Leave this page?" was answered Cancel, so the address does not change. */
const router = { stays: false, asked: [] as string[] };
vi.mock('$app/navigation', () => ({ goto: async (to: string) => { router.asked.push(to); if (!router.stays) loc.pathname = to; } }));

const ss = new Map<string, string>(), ls = new Map<string, string>();
const store = (m: Map<string, string>) => ({ getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, String(v)), removeItem: (k: string) => void m.delete(k), key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; } });
/** The window's events, and the Navigation API's, as a browser raises them. */
let win: EventTarget, nav: EventTarget | undefined;
/** What a navigation asked for does: 'cancel' raises `navigateerror` inside the assignment (Chromium's "Leave site?" answered Cancel), 'prompt' asks "Leave site?" and stays (a browser without the Navigation API), 'go' unloads. */
let onNavigate: 'cancel' | 'prompt' | 'go' = 'go';
let asked: string[] = [];
let reloads = 0;
const loc = {
  pathname: '/plants/new',
  get href() { return `http://x${this.pathname}`; },
  set href(v: string) {
    asked.push(v);
    if (onNavigate === 'cancel') nav?.dispatchEvent(new Event('navigateerror'));
    else if (onNavigate === 'prompt') { const e = new Event('beforeunload', { cancelable: true }); e.preventDefault(); win.dispatchEvent(e); }
    else win.dispatchEvent(new Event('pagehide'));
  },
  reload() { reloads++; }
};
const had = Object.fromEntries(['sessionStorage', 'localStorage', 'location', 'addEventListener', 'removeEventListener', 'navigation', 'document'].map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
const def = (k: string, value: unknown) => Object.defineProperty(globalThis, k, { configurable: true, writable: true, value });

beforeEach(async () => {
  ss.clear(); ls.clear(); asked = []; reloads = 0; onNavigate = 'go'; router.stays = false; router.asked = [];
  Object.assign(col, { ready: true, accessions: [], sowings: [], locations: [], taxa: [], mySpecies: new Map(), heldWaiting: 0, parkedRecords: 0, recordCount: 0 });
  Object.assign(syncState, { configured: false, busy: null });
  loc.pathname = '/plants/new';
  win = new EventTarget();
  nav = new EventTarget();
  def('sessionStorage', store(ss));
  def('localStorage', store(ls));
  def('location', loc);
  def('addEventListener', win.addEventListener.bind(win));
  def('removeEventListener', win.removeEventListener.bind(win));
  def('navigation', nav);
  def('document', { visibilityState: 'visible' });
  const { example } = await import('$lib/ui/grow/example.svelte');
  Object.assign(example, { seeding: false, entering: false, busy: 0, settled: true });
});
afterEach(() => {
  vi.useRealTimers();
  for (const [k, d] of Object.entries(had)) { if (d) Object.defineProperty(globalThis, k, d); else delete (globalThis as Record<string, unknown>)[k]; }
});

describe('a load into the example that is called off leaves the tab as it was (R1, 1)', () => {
  it('Chromium: "Leave site?" answered Cancel says navigateerror, and the flag and "entering" go back', async () => {
    const { enterExample, example } = await import('$lib/ui/grow/example.svelte');
    const { inDemo } = await import('$lib/db/demo');
    onNavigate = 'cancel';
    expect(enterExample('/today')).toBe(true);
    expect(asked).toEqual(['/today']);
    expect(inDemo()).toBe(false); // the reviewer's reproduction failed here: '1' stayed in session storage
    expect(example.entering).toBe(false);
  });
  it('a browser without the Navigation API: the page asked "Leave site?" and is still showing 3 seconds later', async () => {
    vi.useFakeTimers();
    def('navigation', undefined);
    nav = undefined;
    const { enterExample, example } = await import('$lib/ui/grow/example.svelte');
    const { inDemo } = await import('$lib/db/demo');
    // The page's own guard, added before the example's listener: it asks.
    win.addEventListener('beforeunload', (e) => e.preventDefault());
    onNavigate = 'prompt';
    expect(enterExample('/today')).toBe(true);
    expect(inDemo()).toBe(true); // not yet known to stay
    vi.advanceTimersByTime(3100);
    expect(inDemo()).toBe(false);
    expect(example.entering).toBe(false);
  });
  it('a load that goes ahead keeps the flag for the next page, even when it is slow', async () => {
    vi.useFakeTimers();
    def('navigation', undefined);
    nav = undefined;
    const { enterExample } = await import('$lib/ui/grow/example.svelte');
    const { inDemo } = await import('$lib/db/demo');
    onNavigate = 'go';
    expect(enterExample('/today')).toBe(true);
    vi.advanceTimersByTime(60_000);
    expect(inDemo()).toBe(true);
  });
});

describe('a device with records of its own, or work in progress, is never sent into the example (R1, 2 and 5)', () => {
  it('a device whose every record is held, or parked, is not empty', async () => {
    const { ownEmpty, entersHere } = await import('$lib/ui/grow/example.svelte');
    expect(ownEmpty()).toBe(true);
    col.heldWaiting = 40;
    expect(ownEmpty()).toBe(false); // the reviewer's reproduction failed here: the held records were not read
    expect(entersHere()).toBe(false);
    col.heldWaiting = 0;
    col.parkedRecords = 3;
    expect(ownEmpty()).toBe(false);
  });
  it('a device with sync set up is a grower\'s, and nothing is decided before sync\'s key has been read', async () => {
    const { ownEmpty, entersHere, example } = await import('$lib/ui/grow/example.svelte');
    syncState.configured = true;
    expect(ownEmpty()).toBe(false);
    syncState.configured = false;
    example.settled = false;
    expect(entersHere()).toBe(false);
    example.settled = true;
    expect(entersHere()).toBe(true);
  });
  it('while a restore, a merge or an import runs, or a sync, no page goes in by itself, and a button says why', async () => {
    const { entersHere, enterExample, keepWorking, notEnteredWords, example } = await import('$lib/ui/grow/example.svelte');
    const { inDemo } = await import('$lib/db/demo');
    let finish!: () => void;
    const restore = keepWorking(() => new Promise<void>((r) => (finish = r)));
    expect(example.busy).toBe(1);
    expect(entersHere()).toBe(false);
    expect(enterExample('/today')).toBe('busy');
    expect(asked).toEqual([]);
    expect(inDemo()).toBe(false);
    expect(notEnteredWords('busy')).toContain('opening the example now would cut it off');
    finish();
    await restore;
    expect(example.busy).toBe(0);
    expect(entersHere()).toBe(true);
    syncState.busy = 'Pulling…';
    expect(entersHere()).toBe(false);
    expect(enterExample('/today')).toBe('busy');
  });
  it('the work is counted, so one finishing does not clear another, and a failure clears its own', async () => {
    const { keepWorking, example } = await import('$lib/ui/grow/example.svelte');
    let a!: () => void;
    const one = keepWorking(() => new Promise<void>((r) => (a = r)));
    await expect(keepWorking(async () => { throw new Error('full'); })).rejects.toThrow('full');
    expect(example.busy).toBe(1);
    a();
    await one;
    expect(example.busy).toBe(0);
  });
  it('storage refused is said as that, not as nothing (R1, 7)', async () => {
    const { enterExample, notEnteredWords } = await import('$lib/ui/grow/example.svelte');
    def('sessionStorage', { ...store(ss), setItem: () => { throw new Error('refused'); } });
    expect(enterExample('/today')).toBe('refused');
    expect(notEnteredWords('refused')).toContain('needs this tab\'s own storage');
  });
});

describe('the menu\'s way in moves inside the app first (R1, 1)', () => {
  it('from a page whose "Leave this page?" is answered Cancel: nothing changes', async () => {
    const { openExample } = await import('$lib/ui/grow/example.svelte');
    const { inDemo } = await import('$lib/db/demo');
    router.stays = true;
    expect(await openExample('/today')).toBe('stayed');
    expect(router.asked).toEqual(['/today']);
    expect(asked).toEqual([]);
    expect(inDemo()).toBe(false);
  });
  it('once the move has happened, the example opens on Today', async () => {
    const { openExample } = await import('$lib/ui/grow/example.svelte');
    const { inDemo } = await import('$lib/db/demo');
    expect(await openExample('/today')).toBe(true);
    expect(asked).toEqual(['/today']);
    expect(inDemo()).toBe(true);
  });
  it('not while a restore runs: no move, and why', async () => {
    const { openExample, example } = await import('$lib/ui/grow/example.svelte');
    example.busy = 1;
    expect(await openExample('/today')).toBe('busy');
    expect(router.asked).toEqual([]);
  });
});

describe('the back-forward cache (R1, 3)', () => {
  it('a page restored into a tab whose mode changed since it was shown loads afresh; one whose mode is the same does not', async () => {
    const { freshOnRestore } = await import('$lib/db/demo');
    const stop = freshOnRestore(); // shown outside the example
    const show = (persisted: boolean) => { const e = new Event('pageshow'); Object.defineProperty(e, 'persisted', { value: persisted }); win.dispatchEvent(e); };
    show(true);
    expect(reloads).toBe(0);
    ss.set('cultifolio.demo', '1'); // a tap took the tab into the example, then Back
    show(false);
    expect(reloads).toBe(0); // an ordinary load is already the right mode
    show(true);
    expect(reloads).toBe(1);
    stop();
    show(true);
    expect(reloads).toBe(1);
  });
});
