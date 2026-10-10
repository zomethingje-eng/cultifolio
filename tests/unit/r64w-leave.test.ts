/**
 * Round sixty-four, agent W: a Leave answered Cancel in a browser that has the Navigation API but does not say the Cancel
 * as `navigateerror` (Safari's engine in the first all-engines run: the button stayed "Leaving…" past 1.5 s). The 3 s
 * fallback was armed only without the Navigation API, so such a page waited for the 10 s one. The page's events and the
 * clock are stood in, as tests/unit/r62bg-sample.test.ts does.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mk = () => { const m = new Map<string, string>(); return { m, s: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, String(v)), removeItem: (k: string) => void m.delete(k), key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; }, clear: () => m.clear() } }; };
const session = mk();
const loc = { href: 'http://x/plants/r1', reload: vi.fn() };
let page: EventTarget;
const KEYS = ['sessionStorage', 'location', 'addEventListener', 'removeEventListener', 'navigation', 'document'] as const;
const had = Object.fromEntries(KEYS.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
const set = (k: string, value: unknown) => Object.defineProperty(globalThis, k, { configurable: true, writable: true, value });
beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  session.m.clear();
  session.m.set('cultifolio.demo', '1');
  page = new EventTarget();
  set('sessionStorage', session.s);
  set('location', loc);
  set('addEventListener', page.addEventListener.bind(page));
  set('removeEventListener', page.removeEventListener.bind(page));
  set('document', { visibilityState: 'visible' });
  set('navigation', new EventTarget()); // the API is there, and never says the Cancel
});
afterEach(() => {
  vi.useRealTimers();
  for (const k of KEYS) { const d = had[k]; if (d) Object.defineProperty(globalThis, k, d); else delete (globalThis as Record<string, unknown>)[k]; }
});

describe('a Leave answered Cancel where the Navigation API does not report it', () => {
  it('a page that asked "Leave site?" and is still showing 3 s later stayed (base: 10 s)', async () => {
    const { leaveDemo } = await import('$lib/db/demo');
    const stayed = vi.fn();
    page.addEventListener('beforeunload', (e) => e.preventDefault()); // the page's own guard, as a form's is
    leaveDemo('/', stayed);
    page.dispatchEvent(new Event('beforeunload', { cancelable: true }));
    vi.advanceTimersByTime(3100);
    expect(stayed).toHaveBeenCalledTimes(1);
    expect([session.m.get('cultifolio.demo'), session.m.get('cultifolio.sampleLeft')]).toEqual(['1', undefined]);
  });
  it('without a "Leave site?" the 3 s do not call it off', async () => {
    const { leaveDemo } = await import('$lib/db/demo');
    const stayed = vi.fn();
    leaveDemo('/', stayed);
    page.dispatchEvent(new Event('beforeunload', { cancelable: true }));
    vi.advanceTimersByTime(3100);
    expect(stayed).not.toHaveBeenCalled();
  });
});
