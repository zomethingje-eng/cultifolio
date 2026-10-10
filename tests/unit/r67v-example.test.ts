/**
 * Round sixty-seven, agent V:
 * - triage-66 V4 (S-A2, R45-20, IND-3): "empty" means the grower's own log folds to nothing and no frost site is set.
 *   A removed plant, a species' own notes and a numbering scheme are records; a frost site is the grower's too. The
 *   bar's words come from the same test, noted as the example is opened (S-A11).
 * - triage-66 V1 (S-A1, R45-1): an "add" pressed inside the example leads out of it first, asking as Leave does.
 * The collection and sync are stood in, as tests/unit/r63fv-example.test.ts does.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const col = { ready: true, accessions: [] as unknown[], sowings: [] as unknown[], locations: [] as unknown[], taxa: [] as unknown[], heldWaiting: 0, parkedRecords: 0, recordCount: 0 };
vi.mock('$lib/db/collection.svelte', () => ({ collection: col }));
vi.mock('$app/environment', () => ({ browser: true, dev: false, building: false, version: 'test' }));
vi.mock('$lib/sync/engine.svelte', () => ({ sync: { configured: false, busy: null } }));
vi.mock('$app/navigation', () => ({ goto: async () => {} }));
const sampleEdits = vi.fn(async () => 0);

const mk = () => { const m = new Map<string, string>(); return { m, s: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, String(v)), removeItem: (k: string) => void m.delete(k), key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; } } }; };
const session = mk(), local = mk();
const asked: string[] = [];
const loc = { pathname: '/today', get href() { return `http://x${this.pathname}`; }, set href(v: string) { asked.push(v); }, reload() {} };
const KEYS = ['sessionStorage', 'localStorage', 'location', 'addEventListener', 'removeEventListener', 'confirm', 'document'] as const;
const had = Object.fromEntries(KEYS.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
const def = (k: string, value: unknown) => Object.defineProperty(globalThis, k, { configurable: true, writable: true, value });
let confirms: string[] = [];
let answer = true;
beforeEach(() => {
  session.m.clear(); local.m.clear(); asked.length = 0; confirms = []; answer = true;
  Object.assign(col, { ready: true, accessions: [], sowings: [], locations: [], taxa: [], heldWaiting: 0, parkedRecords: 0, recordCount: 0 });
  const page = new EventTarget();
  def('sessionStorage', session.s);
  def('localStorage', local.s);
  def('location', loc);
  def('addEventListener', page.addEventListener.bind(page));
  def('removeEventListener', page.removeEventListener.bind(page));
  def('document', { visibilityState: 'visible' });
  def('confirm', (q: string) => { confirms.push(q); return answer; });
  vi.resetModules();
  vi.doMock('$lib/db/demo', async (orig) => ({ ...(await orig<typeof import('$lib/db/demo')>()), sampleEdits }));
});
afterEach(() => {
  vi.useRealTimers();
  for (const k of KEYS) { const d = had[k]; if (d) Object.defineProperty(globalThis, k, d); else delete (globalThis as Record<string, unknown>)[k]; }
});
async function grower() {
  const m = await import('$lib/ui/grow/example.svelte');
  m.example.settled = true;
  return m;
}

describe('"empty" is the whole log and the frost site (V4)', () => {
  it('a removed plant, a species\' notes or a numbering scheme is a record: the device is not empty', async () => {
    const { ownEmpty, entersHere } = await grower();
    expect(ownEmpty()).toBe(true);
    expect(entersHere()).toBe(true);
    col.recordCount = 1; // one record in the fold, live or removed: a plant removed, notes on a species, the numbering scheme
    expect(ownEmpty()).toBe(false); // base: true, and Today opened the example over them (S-A2's A2 to A4)
    expect(entersHere()).toBe(false);
  });
  it('a frost site set with no plant is a grower\'s device (S-A2\'s A1)', async () => {
    local.m.set('cultifolio.frost.site', '{"lat":51.5,"lon":-0.1,"name":"Home"}');
    const { ownEmpty } = await grower();
    expect(ownEmpty()).toBe(false); // base: true, and the example's frost watch said "No site set"
  });
  it('the bar\'s words: the test is noted as the example is opened, places included (S-A11)', async () => {
    col.recordCount = 2; col.locations = [{}, {}]; // a grower who set out their benches first
    const { enterExample, OWN_NOTE } = await grower();
    expect(enterExample('/today')).toBe(true);
    expect(session.m.get(OWN_NOTE)).toBe('1'); // base: the bar read the plants-only hint and said "Your own starts when you add a plant"
    vi.resetModules();
    const inside = await import('$lib/ui/grow/example.svelte');
    expect(inside.hadOwn()).toBe(true);
  });
  it('a visitor\'s device is noted as empty', async () => {
    const { enterExample, OWN_NOTE } = await grower();
    enterExample('/today');
    expect(session.m.get(OWN_NOTE)).toBe('0');
  });
});

describe('an add inside the example leads out of it first (V1)', () => {
  it('outside the example an add is an ordinary link', async () => {
    const { addLeavesExample } = await grower();
    const e = new Event('click', { cancelable: true });
    expect(addLeavesExample(e, '/plants/new')).toBe(false);
    expect(e.defaultPrevented).toBe(false);
    expect(asked).toEqual([]);
  });
  it('inside it, the link is not followed: the example is left for the same address in the grower\'s own collection', async () => {
    session.m.set('cultifolio.demo', '1');
    const { addLeavesExample, example } = await grower();
    const e = new Event('click', { cancelable: true });
    expect(addLeavesExample(e, '/places#add')).toBe(true);
    expect(e.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(asked).toEqual(['/places?left=sample#add']));
    expect(example.leaving).toBe(true);
  });
  it('with records of the visitor\'s in it, it asks first, as Leave does; answered no, nothing happens', async () => {
    session.m.set('cultifolio.demo', '1');
    sampleEdits.mockResolvedValueOnce(3);
    answer = false;
    const { leaveExample, example } = await grower();
    expect(await leaveExample('/plants/new')).toBe(false);
    expect(confirms).toEqual(['Leave the example collection? The 3 records you added or changed here are deleted with it.']);
    expect(asked).toEqual([]);
    expect(example.leaving).toBe(false);
  });
});
