/**
 * Round seventy-seven (F), item 2: entering the example is done by the page its address opens, as Leave has been since
 * round seventy-five (docs/review-75/H.md, item 1; "`enterDemo` has the same 3 s Cancel guess"). On r77base `enterDemo`
 * set the tab's flag before the navigation and took it off again once the page was known to stay: by `navigateerror`, or
 * in a browser that does not say a Cancel, when "Leave site?" had been asked and the page still showed 3 s later. A reload
 * before that opened the example in a tab that had answered Cancel. Now the button writes only a one-use token, the
 * address carries it, and app.html's first script sets the flag when the two match. The page's storage, events and first
 * script are stood in, as tests/unit/r69x-left.test.ts does; tests/e2e/r77f-enter.spec.ts holds it in Chromium.
 * Each case FAILED on r77base unless it says "guard".
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const mk = () => { const m = new Map<string, string>(); return { m, s: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, String(v)), removeItem: (k: string) => void m.delete(k), key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; }, clear: () => m.clear() } }; };
const session = mk(), local = mk();
let asked: string[] = [];
const loc = { get href() { return 'http://x/plants'; }, set href(v: string) { asked.push(v); }, reload() {} };
let page: EventTarget;
const KEYS = ['sessionStorage', 'localStorage', 'location', 'addEventListener', 'removeEventListener', 'navigation', 'document'] as const;
const had = Object.fromEntries(KEYS.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
const def = (k: string, value: unknown) => Object.defineProperty(globalThis, k, { configurable: true, writable: true, value });
vi.mock('$app/environment', () => ({ browser: true, dev: false, building: false, version: 'test' }));

beforeEach(() => {
  session.m.clear(); local.m.clear(); asked = [];
  page = new EventTarget();
  def('sessionStorage', session.s);
  def('localStorage', local.s);
  def('location', loc);
  def('addEventListener', page.addEventListener.bind(page));
  def('removeEventListener', page.removeEventListener.bind(page));
  def('document', { visibilityState: 'visible' });
  delete (globalThis as { navigation?: unknown }).navigation; // a browser that does not say a Cancel
  vi.resetModules();
});
afterEach(() => {
  vi.useRealTimers();
  for (const k of KEYS) { const d = had[k]; if (d) Object.defineProperty(globalThis, k, d); else delete (globalThis as Record<string, unknown>)[k]; }
});

/** app.html's first script, run as a new page in this tab loads at `search`. */
function firstScript(search: string): Record<string, string> {
  const html = readFileSync('src/app.html', 'utf8');
  const code = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
  const dataset: Record<string, string> = {};
  new Function('localStorage', 'sessionStorage', 'document', 'location', 'navigator', 'window', code)(local.s, session.s, { documentElement: { dataset } }, { search }, {}, {});
  return dataset;
}
/** A "Leave site?" asked and answered Cancel: the page's own listener asks, and the page stays. */
function askedAndCancelled() {
  const e = new Event('beforeunload', { cancelable: true });
  e.preventDefault();
  page.dispatchEvent(e);
}

describe('the button writes only its token; the page its address opens enters', () => {
  it('a Cancel, then a reload at once, before anything has said the Cancel: the tab stays out of the example', async () => {
    vi.useFakeTimers();
    const demo = await import('$lib/db/demo');
    let stayed = 0;
    expect(demo.enterDemo('/plants', () => stayed++)).toBe(true);
    askedAndCancelled();
    expect(session.m.get('cultifolio.demo')).toBeUndefined(); // r77base: '1', set before the page went
    // The reload: the page's own address, which carries no token.
    const d = firstScript('');
    expect([d.demo, session.m.get('cultifolio.demo')]).toEqual([undefined, undefined]); // r77base: ['1', '1'], the example opened
    expect(stayed).toBe(0);
    vi.advanceTimersByTime(3000); // what decided it on r77base now decides only the button's words
    expect(stayed).toBe(1);
  });
  it('the entry\'s own address enters, notes the device\'s generation, takes the token off, and says an older close no more', async () => {
    local.m.set('cultifolio.sampleGen', 'g4');
    session.m.set('cultifolio.sampleClosed', '1'); // a close not yet said would take the new flag off
    const demo = await import('$lib/db/demo');
    demo.enterDemo('/plants#add');
    const token = session.m.get(demo.ENTERING)!;
    expect(token).toMatch(/^[a-z0-9]{6,}$/);
    expect(asked).toEqual([`/plants?enter=${token}#add`]); // r77base: ['/plants#add']
    expect([session.m.get('cultifolio.demo'), session.m.get(demo.TAB_GEN)]).toEqual([undefined, undefined]); // r77base: ['1', 'g4'] before the page went
    page.dispatchEvent(new Event('pagehide'));
    const d = firstScript(`?enter=${token}`);
    expect([d.demo, session.m.get('cultifolio.demo'), session.m.get(demo.TAB_GEN), session.m.get('cultifolio.sampleClosed'), session.m.has(demo.ENTERING)]).toEqual(['1', '1', 'g4', undefined, false]);
  });
  it('a copied link, the history or another token enters nothing, and the token is used once', async () => {
    const demo = await import('$lib/db/demo');
    demo.enterDemo('/today');
    const token = session.m.get(demo.ENTERING)!;
    expect(firstScript('?enter=zzz999').demo).toBeUndefined();
    expect(session.m.has(demo.ENTERING)).toBe(false); // read once, matched or not
    expect(firstScript(`?enter=${token}`).demo).toBeUndefined(); // the right token, once it is gone
    session.m.clear();
    expect(firstScript(`?enter=${token}`).demo).toBeUndefined(); // guard: another tab, which never had it
  });
  it('guard: an address that also says the tab left enters nothing', async () => {
    const demo = await import('$lib/db/demo');
    demo.enterDemo('/today');
    const token = session.m.get(demo.ENTERING)!;
    expect(firstScript(`?left=x&enter=${token}`).demo).toBeUndefined();
  });
  it('guard: a tab whose storage refuses the token is not sent anywhere', async () => {
    const demo = await import('$lib/db/demo');
    def('sessionStorage', { ...session.s, setItem: () => { throw new Error('refused'); } });
    expect(demo.enterDemo('/today')).toBe(false);
    expect(asked).toEqual([]);
  });
  it('the example\'s bar takes `enter=` off the address, as it takes `left=` (read from its source)', () => {
    const bar = readFileSync('src/lib/ui/grow/DemoBar.svelte', 'utf8');
    expect(bar).toMatch(/\[LEFT_PARAM, ENTER_PARAM\]\.filter/);
  });
});
