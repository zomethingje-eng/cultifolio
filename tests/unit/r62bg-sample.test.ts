/**
 * Round sixty-two, second pass, agent G: a Leave the page stays through is no Leave (triage-outside 1, the verification
 * grower review, 4). `leaveDemo` armed a `pagehide` listener and never took it off, so after a "Leave site?" answered
 * Cancel the next reload or tab close left the sample and the next page deleted it. The page's events, the Navigation
 * API's `navigateerror` and the clock are stood in; the browser run is tests/e2e/r62bg-import.spec.ts, test 1.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mk = () => { const m = new Map<string, string>(); return { m, s: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, String(v)), removeItem: (k: string) => void m.delete(k), key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; }, clear: () => m.clear() } }; };
const session = mk();
const loc = { href: 'http://x/plants/r1', reload: vi.fn() };
let page: EventTarget;
let doc: { visibilityState: string };
const KEYS = ['sessionStorage', 'location', 'addEventListener', 'removeEventListener', 'navigation', 'document'] as const;
const had = Object.fromEntries(KEYS.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
const set = (k: string, value: unknown) => Object.defineProperty(globalThis, k, { configurable: true, writable: true, value });
beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  session.m.clear();
  session.m.set('cultifolio.demo', '1');
  loc.href = 'http://x/plants/r1';
  page = new EventTarget();
  doc = { visibilityState: 'visible' };
  set('sessionStorage', session.s);
  set('location', loc);
  set('addEventListener', page.addEventListener.bind(page));
  set('removeEventListener', page.removeEventListener.bind(page));
  set('document', doc);
  delete (globalThis as { navigation?: unknown }).navigation;
});
afterEach(() => {
  vi.useRealTimers();
  for (const k of KEYS) { const d = had[k]; if (d) Object.defineProperty(globalThis, k, d); else delete (globalThis as Record<string, unknown>)[k]; }
});
/** The page's own "Leave site?" guard, added before Leave is pressed, as a form's is. */
const guard = () => page.addEventListener('beforeunload', (e) => e.preventDefault());
const beforeunload = () => page.dispatchEvent(new Event('beforeunload', { cancelable: true }));
const left = () => session.m.get('cultifolio.demo') !== '1' || session.m.get('cultifolio.sampleLeft') === '1';

describe('a Leave answered Cancel is called off', () => {
  it('the Navigation API says the navigation was cancelled: the button comes back at once, and a later reload stays in the sample', async () => {
    const nav = new EventTarget();
    set('navigation', nav);
    const { leaveDemo } = await import('$lib/db/demo');
    const stayed = vi.fn();
    guard();
    leaveDemo('/', stayed);
    beforeunload();
    nav.dispatchEvent(new Event('navigateerror')); // "Leave site?" answered Cancel
    expect(stayed).toHaveBeenCalledTimes(1); // base: no way to hear it; the bar said "Leaving…" for 4 s
    page.dispatchEvent(new Event('pagehide')); // the visitor reloads, or closes the tab
    expect(left()).toBe(false); // base: the flag cleared and the sample marked for deletion
  });
  it('without the Navigation API: a page that asked "Leave site?" and is still showing 3 s later stayed', async () => {
    const { leaveDemo } = await import('$lib/db/demo');
    const stayed = vi.fn();
    guard();
    leaveDemo('/', stayed);
    beforeunload();
    vi.advanceTimersByTime(2900);
    expect(stayed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(stayed).toHaveBeenCalledTimes(1);
    page.dispatchEvent(new Event('pagehide'));
    expect(left()).toBe(false);
  });
  it('any page still showing 10 s after Leave stayed', async () => {
    const { leaveDemo } = await import('$lib/db/demo');
    const stayed = vi.fn();
    leaveDemo('/', stayed);
    vi.advanceTimersByTime(10_000);
    expect(stayed).toHaveBeenCalledTimes(1);
    page.dispatchEvent(new Event('pagehide'));
    expect(left()).toBe(false);
  });
  it('the returned function calls it off too', async () => {
    const { leaveDemo } = await import('$lib/db/demo');
    const off = leaveDemo('/');
    off();
    page.dispatchEvent(new Event('pagehide'));
    expect(left()).toBe(false);
  });
});

describe('a Leave that goes still leaves', () => {
  it('no question: the page goes, and the tab leaves the sample', async () => {
    set('navigation', new EventTarget());
    const { leaveDemo } = await import('$lib/db/demo');
    const stayed = vi.fn();
    leaveDemo('/', stayed);
    expect(loc.href).toBe('/');
    beforeunload();
    page.dispatchEvent(new Event('pagehide'));
    expect([session.m.get('cultifolio.demo'), session.m.get('cultifolio.sampleLeft')]).toEqual([undefined, '1']);
    vi.advanceTimersByTime(20_000);
    expect(stayed).not.toHaveBeenCalled(); // gone, not stayed
  });
  it('"Leave site?" answered Leave, without the Navigation API: the page goes before the 3 s, and the tab leaves', async () => {
    const { leaveDemo } = await import('$lib/db/demo');
    guard();
    leaveDemo('/');
    beforeunload();
    vi.advanceTimersByTime(1000);
    doc.visibilityState = 'hidden';
    page.dispatchEvent(new Event('pagehide'));
    expect(left()).toBe(true);
  });
  it('brought back from the back-forward cache after it left, the page loads afresh', async () => {
    const { leaveDemo } = await import('$lib/db/demo');
    leaveDemo('/');
    page.dispatchEvent(new Event('pagehide'));
    const e = new Event('pageshow');
    Object.defineProperty(e, 'persisted', { value: true });
    page.dispatchEvent(e);
    expect(loc.reload).toHaveBeenCalled();
  });
});
