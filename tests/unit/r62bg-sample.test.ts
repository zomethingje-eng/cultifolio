/**
 * Round sixty-two, second pass, agent G: a Leave the page stays through is no Leave (triage-outside 1, the verification
 * grower review, 4). `leaveDemo` armed a `pagehide` listener and never took it off, so after a "Leave site?" answered
 * Cancel the next reload or tab close left the sample and the next page deleted it. The page's events, the Navigation
 * API's `navigateerror` and the clock are stood in; the browser run is tests/e2e/r62bg-import.spec.ts, test 1.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const mk = () => { const m = new Map<string, string>(); return { m, s: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, String(v)), removeItem: (k: string) => void m.delete(k), key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; }, clear: () => m.clear() } }; };
const session = mk(), local = mk();
const loc = { href: 'http://x/plants/r1', reload: vi.fn() };
let page: EventTarget;
let doc: { visibilityState: string };
const KEYS = ['sessionStorage', 'localStorage', 'location', 'addEventListener', 'removeEventListener', 'navigation', 'document'] as const;
const had = Object.fromEntries(KEYS.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
const set = (k: string, value: unknown) => Object.defineProperty(globalThis, k, { configurable: true, writable: true, value });
beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  session.m.clear();
  local.m.clear();
  session.m.set('cultifolio.demo', '1');
  loc.href = 'http://x/plants/r1';
  page = new EventTarget();
  doc = { visibilityState: 'visible' };
  set('sessionStorage', session.s);
  set('localStorage', local.s);
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
/**
 * The next page in this tab, loaded at the address Leave asked for: app.html's first script, which since round
 * seventy-five is what takes the tab out of the sample (the page Leave was pressed on writes only the token).
 */
function nextPage(): void {
  const html = readFileSync('src/app.html', 'utf8');
  const code = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
  const search = new URL(loc.href, 'http://x').search;
  new Function('localStorage', 'sessionStorage', 'document', 'location', code)(local.s, session.s, { documentElement: { dataset: {} } }, { search });
}

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
    expect([session.m.get('cultifolio.demo'), session.m.get('cultifolio.sampleLeft')]).toEqual(['1', undefined]); // put back
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
  it('no question: the page goes, and the next page takes the tab out of the sample', async () => {
    set('navigation', new EventTarget());
    const { leaveDemo } = await import('$lib/db/demo');
    const stayed = vi.fn();
    leaveDemo('/', stayed);
    expect(loc.href).toMatch(/^\/\?left=[a-z0-9]+$/); // Leave's own token (round sixty-nine; triage-68 X1)
    beforeunload();
    page.dispatchEvent(new Event('pagehide'));
    // The page that goes writes nothing but the token (round seventy-five): the next page, at Leave's address, leaves.
    expect([session.m.get('cultifolio.demo'), session.m.get('cultifolio.sampleLeft')]).toEqual(['1', undefined]); // r75base: [undefined, '1'], written by this page
    nextPage();
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
    nextPage();
    expect(left()).toBe(true);
  });
  it('brought back from the back-forward cache after it left, the page loads afresh', async () => {
    const { leaveDemo, freshOnRestore } = await import('$lib/db/demo');
    freshOnRestore(); // the layout's, on every page
    leaveDemo('/');
    page.dispatchEvent(new Event('pagehide'));
    nextPage();
    const e = new Event('pageshow');
    Object.defineProperty(e, 'persisted', { value: true });
    page.dispatchEvent(e);
    expect(loc.reload).toHaveBeenCalled();
  });
});

describe('a Leave answered Cancel decides nothing by time (round seventy-five; the harness, H)', () => {
  it('a reload before any rule has said the Cancel stays in the sample, and nothing is marked for deletion', async () => {
    // Firefox or Safari's engine: no `navigateerror` for the Cancel, and the reload comes before the 3 s (a slow machine's
    // timer, a quick visitor). r75base: the flag was already off and the delete marked, so the reload opened the
    // grower's own collection and that page deleted the example with the visitor's edit.
    const { leaveDemo } = await import('$lib/db/demo');
    const stayed = vi.fn();
    guard();
    leaveDemo('/', stayed);
    beforeunload(); // "Leave site?" … Cancel, said by nothing
    expect(stayed).not.toHaveBeenCalled();
    page.dispatchEvent(new Event('pagehide')); // the visitor reloads
    loc.href = 'http://x/plants/r1'; // the reload's address: the page's own, not Leave's
    nextPage();
    expect(left()).toBe(false);
  });
  it('the first press on the page after "Leave site?" brings the button back, with no wait', async () => {
    const { leaveDemo } = await import('$lib/db/demo');
    const stayed = vi.fn();
    guard();
    leaveDemo('/', stayed);
    page.dispatchEvent(new Event('pointerdown'));
    expect(stayed).not.toHaveBeenCalled(); // no question asked yet: a press is not an answer
    beforeunload();
    page.dispatchEvent(new Event('pointerdown'));
    expect(stayed).toHaveBeenCalledTimes(1); // r75base: only after 3 s
  });
});
