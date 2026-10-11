/**
 * Round sixty-nine, agent X: the example's Leave and the tabs it leaves behind.
 * - triage-68 X1 (S-C1): the address marks the example for deletion only with the one-use token that Leave wrote in that
 *   same tab. `?left=sample` marked it in any tab that had ever been out of the example, so a copied link, or the closed
 *   bar's own "Go to my own collection", deleted an example opened afterwards in another tab.
 * - triage-68 X2 (R46-19, R46-28): Leave writes a new generation that every tab shares; a tab that was away when another
 *   left (another site, the back-forward cache, discarded) opens the grower's own collection, not a new example; a page
 *   with something typed on it is not navigated away when the example closes under it (X9, S-C5).
 * The page's storage, events and first script are stood in, as tests/unit/r67v-leftover.test.ts does.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const mk = () => { const m = new Map<string, string>(); return { m, s: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, String(v)), removeItem: (k: string) => void m.delete(k), key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; }, clear: () => m.clear() } }; };
const session = mk(), local = mk();
let asked: string[] = [];
let reloads = 0;
const loc = { get href() { return 'http://x/today'; }, set href(v: string) { asked.push(v); }, reload() { reloads++; } };
let page: EventTarget;
const KEYS = ['sessionStorage', 'localStorage', 'location', 'addEventListener', 'removeEventListener', 'navigation', 'document'] as const;
const had = Object.fromEntries(KEYS.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
const def = (k: string, value: unknown) => Object.defineProperty(globalThis, k, { configurable: true, writable: true, value });
vi.mock('$app/environment', () => ({ browser: true, dev: false, building: false, version: 'test' }));

beforeEach(() => {
  session.m.clear(); local.m.clear(); asked = []; reloads = 0;
  page = new EventTarget();
  def('sessionStorage', session.s);
  def('localStorage', local.s);
  def('location', loc);
  def('addEventListener', page.addEventListener.bind(page));
  def('removeEventListener', page.removeEventListener.bind(page));
  def('document', { visibilityState: 'visible' });
  delete (globalThis as { navigation?: unknown }).navigation;
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
  new Function('localStorage', 'sessionStorage', 'document', 'location', code)(local.s, session.s, { documentElement: { dataset } }, { search });
  return dataset;
}
/** A page loaded in the example, its modules reading the flag as they load. */
async function examplePage() {
  session.m.set('cultifolio.demo', '1');
  vi.resetModules();
  return import('$lib/db/demo');
}

describe('the delete mark is Leave\'s own token (X1; S-C1)', () => {
  it('a tab that was out of the example before marks nothing by a plain `?left=sample` (a copied link, the closed bar\'s old address)', () => {
    session.m.set('cultifolio.sampleOut', '1'); // sent home by another tab's Leave once, or a Leave called off
    const d = firstScript('?left=sample');
    expect(session.m.get('cultifolio.sampleLeft')).toBeUndefined(); // base: '1', and the next page deleted an example opened since in another tab
    expect(d.demo).toBeUndefined();
  });
  it('Leave writes a token and its address carries it; the first page marks the delete by it, once', async () => {
    const demo = await examplePage();
    demo.leaveDemo('/');
    const token = session.m.get(demo.LEAVING);
    expect(token).toMatch(/^[a-z0-9]{6,}$/); // base: no token
    expect(asked).toEqual([`/?left=${token}`]);
    page.dispatchEvent(new Event('pagehide'));
    session.m.delete('cultifolio.sampleLeft'); // Leave's storage mark lost to its own timers (r62g 8): the address still says it
    firstScript(`?left=${token}`);
    expect(session.m.get('cultifolio.sampleLeft')).toBe('1');
    expect(session.m.has(demo.LEAVING)).toBe(false); // one use
    session.m.delete('cultifolio.sampleLeft');
    firstScript(`?left=${token}`); // a reload of that address, or a copy of it
    expect(session.m.get('cultifolio.sampleLeft')).toBeUndefined();
  });
  it('another token, or none, marks nothing and still takes the tab out of the example', () => {
    session.m.set('cultifolio.demo', '1');
    session.m.set('cultifolio.sampleLeaving', 'abc123');
    const d = firstScript('?left=zzz999');
    expect([session.m.get('cultifolio.sampleLeft'), session.m.get('cultifolio.demo'), d.demo, session.m.get('cultifolio.sampleOut')]).toEqual([undefined, undefined, undefined, '1']);
  });
  it('a tab sent home goes to `/`, an address that marks nothing (S-C1\'s smallest fix)', async () => {
    const demo = await examplePage();
    demo.sampleClosedHere();
    expect(asked).toEqual(['/']); // base: '/?left=sample'
    const bar = readFileSync('src/lib/ui/grow/DemoBar.svelte', 'utf8');
    expect(bar).toMatch(/href="\/" id="demo-home"/); // base: href="/?left=sample"
  });
});

describe('a tab that was away when another tab left (X2; R46-19)', () => {
  it('Leave writes a new generation as its page goes; a Leave called off writes none', async () => {
    local.m.set('cultifolio.sampleGen', 'g1');
    const demo = await examplePage();
    demo.leaveDemo('/');
    expect(local.m.get(demo.GEN)).toBe('g1'); // not before the page goes: a Leave called off is no Leave
    page.dispatchEvent(new Event('pagehide'));
    expect(local.m.get(demo.GEN)).not.toBe('g1'); // base: no generation at all
    expect(local.m.get(demo.GEN)).toBeTruthy();
  });
  it('a tab whose example is older than the last Leave opens the grower\'s own collection, and is told why', () => {
    session.m.set('cultifolio.demo', '1');
    session.m.set('cultifolio.demo.gen', 'g1');
    local.m.set('cultifolio.sampleGen', 'g2'); // another tab left since
    const d = firstScript('');
    expect([d.demo, session.m.get('cultifolio.demo'), session.m.get('cultifolio.sampleClosed'), session.m.get('cultifolio.sampleOut')]).toEqual([undefined, undefined, '1', '1']); // base: '1' and the example set out again, twelve plants
  });
  it('a tab of the same generation stays in the example; so does one from before any Leave was noted', () => {
    session.m.set('cultifolio.demo', '1');
    session.m.set('cultifolio.demo.gen', 'g2');
    local.m.set('cultifolio.sampleGen', 'g2');
    expect(firstScript('').demo).toBe('1');
    session.m.delete('cultifolio.demo.gen');
    local.m.delete('cultifolio.sampleGen');
    expect(firstScript('').demo).toBe('1');
  });
  it('entering notes the device\'s generation, so a tab opened from it (its storage copied) is of the same one', async () => {
    local.m.set('cultifolio.sampleGen', 'g7');
    const demo = await import('$lib/db/demo');
    expect(demo.enterDemo('/today')).toBe(true);
    expect(session.m.get(demo.TAB_GEN)).toBe('g7'); // base: not noted
  });
  it('a page brought back from the back-forward cache into a stale example reloads, so its first script sends it home', async () => {
    session.m.set('cultifolio.demo.gen', 'g1');
    const demo = await examplePage();
    demo.freshOnRestore();
    local.m.set('cultifolio.sampleGen', 'g2');
    const e = new Event('pageshow');
    Object.defineProperty(e, 'persisted', { value: true });
    page.dispatchEvent(e);
    expect(reloads).toBe(1); // base: shown as it was, and its next write re-created the deleted example
  });
  it('a live tab hears a new generation in another tab\'s storage, where there is no channel', async () => {
    session.m.set('cultifolio.demo.gen', 'g1');
    const demo = await examplePage();
    const stop = demo.keepSampleOpen();
    local.m.set('cultifolio.sampleGen', 'g2');
    const e = new Event('storage');
    Object.defineProperty(e, 'key', { value: 'cultifolio.sampleGen' });
    page.dispatchEvent(e);
    expect(demo.exampleClosed()).toBe(true);
    stop();
  });
});

describe('what was typed stays when the example closes under the page (X2, X9; S-C5)', () => {
  it('a page with input is not navigated: it stays, closed, with the bar\'s way home', async () => {
    const demo = await examplePage();
    const stop = demo.keepSampleOpen();
    page.dispatchEvent(new Event('input')); // a place's name typed on Places, a note on a batch's page
    demo.sampleClosedHere();
    expect(demo.exampleClosed()).toBe(true);
    expect(asked).toEqual([]); // base: ['/?left=sample'], and the text was gone with no question
    expect(session.m.get(demo.CLOSED_NOTE)).toBe('1'); // its next page is the grower's own
    stop();
  });
  it('a page with nothing typed goes home', async () => {
    const demo = await examplePage();
    const stop = demo.keepSampleOpen();
    demo.sampleClosedHere();
    expect(asked).toEqual(['/']);
    stop();
  });
});
