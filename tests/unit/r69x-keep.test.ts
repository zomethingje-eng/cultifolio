/**
 * Round sixty-nine, agent X: triage-68 X3 (S-C2, IND-4, R46-5). "Keep it as my own" carries every field of the add form,
 * the place included, in one key of the tab's session storage that the grower's form reads once; nothing typed goes in
 * the address; the form's own guard is set aside before leaving, so the browser does not ask "Leave site?"; Propagation
 * and Places do the same. The collection and sync are stood in, as tests/unit/r67v-example.test.ts does.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const col = { ready: true, accessions: [] as unknown[], sowings: [] as unknown[], locations: [] as unknown[], taxa: [] as unknown[], heldWaiting: 0, parkedRecords: 0, recordCount: 0 };
vi.mock('$lib/db/collection.svelte', () => ({ collection: col }));
vi.mock('$app/environment', () => ({ browser: true, dev: false, building: false, version: 'test' }));
vi.mock('$lib/sync/engine.svelte', () => ({ sync: { configured: false, busy: null } }));
vi.mock('$app/navigation', () => ({ goto: async () => {} }));
const sampleEdits = vi.fn(async () => 0);

const mk = () => { const m = new Map<string, string>(); return { m, s: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, String(v)), removeItem: (k: string) => void m.delete(k), key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; } } }; };
const session = mk(), local = mk();
const asked: string[] = [];
const loc = { pathname: '/plants/new', get href() { return `http://x${this.pathname}`; }, set href(v: string) { asked.push(v); }, reload() {} };
const KEYS = ['sessionStorage', 'localStorage', 'location', 'addEventListener', 'removeEventListener', 'confirm', 'document'] as const;
const had = Object.fromEntries(KEYS.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
const def = (k: string, value: unknown) => Object.defineProperty(globalThis, k, { configurable: true, writable: true, value });
let answer = true;
beforeEach(() => {
  session.m.clear(); local.m.clear(); asked.length = 0; answer = true;
  const page = new EventTarget();
  def('sessionStorage', session.s);
  def('localStorage', local.s);
  def('location', loc);
  def('addEventListener', page.addEventListener.bind(page));
  def('removeEventListener', page.removeEventListener.bind(page));
  def('document', { visibilityState: 'visible' });
  def('confirm', () => answer);
  vi.resetModules();
  vi.doMock('$lib/db/demo', async (orig) => ({ ...(await orig<typeof import('$lib/db/demo')>()), sampleEdits }));
});
afterEach(() => {
  for (const k of KEYS) { const d = had[k]; if (d) Object.defineProperty(globalThis, k, d); else delete (globalThis as Record<string, unknown>)[k]; }
});

const typed = { name: 'Copiapoa cinerea', taxonKey: 5384013, sourceFrom: 'Mesa Garden', price: '42', notes: 'Visitor note to retain', acquired: '2026-03-02', lastWatered: '2026-10-01', count: 3, provenance: 'f1', sourceForm: 'seedling', fieldNumber: 'KK 1462' };

describe('"Keep it as my own" (X3)', () => {
  it('carries every field and the place in the tab\'s storage, nothing typed in the address, with the form\'s guard set aside', async () => {
    session.m.set('cultifolio.demo', '1');
    const { keepAsOwn, DRAFT } = await import('$lib/ui/grow/keep-draft');
    const holds: boolean[] = [];
    expect(await keepAsOwn({ form: 'plant', fields: typed, place: { name: 'Bench 1', kind: 'bench' } }, (on) => holds.push(on))).toBe(true);
    expect(holds).toEqual([true]); // set aside before the navigation: no "Leave site?" (base: the guard asked)
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatch(/^\/plants\/new\?kept=1&left=[a-z0-9]+$/);
    for (const v of ['Mesa', '42', 'Visitor', 'Copiapoa', 'KK']) expect(asked[0]).not.toContain(v); // base: ?species=…, the rest dropped
    expect(JSON.parse(session.m.get(DRAFT)!)).toEqual({ form: 'plant', fields: typed, place: { name: 'Bench 1', kind: 'bench' } });
  });
  it('the grower\'s form reads it once, and only when its address says one is waiting', async () => {
    session.m.set('cultifolio.keepDraft', JSON.stringify({ form: 'batch', fields: { name: 'Astrophytum asterias', notes: 'n' }, place: null }));
    const { takeDraft } = await import('$lib/ui/grow/keep-draft');
    expect(takeDraft('batch', new URL('http://x/propagation/new'))).toBeNull(); // an ordinary visit
    const d = takeDraft('batch', new URL('http://x/propagation/new?kept=1'));
    expect(d?.fields).toEqual({ name: 'Astrophytum asterias', notes: 'n' });
    expect(takeDraft('batch', new URL('http://x/propagation/new?kept=1'))).toBeNull(); // once
  });
  it('a draft for another form is not read, and goes', async () => {
    session.m.set('cultifolio.keepDraft', JSON.stringify({ form: 'place', fields: { name: 'Shelf' }, place: null }));
    const { takeDraft } = await import('$lib/ui/grow/keep-draft');
    expect(takeDraft('plant', new URL('http://x/plants/new?kept=1'))).toBeNull();
    expect(session.m.has('cultifolio.keepDraft')).toBe(false);
  });
  it('a Leave the visitor declines puts the guard back and drops the draft', async () => {
    session.m.set('cultifolio.demo', '1');
    sampleEdits.mockResolvedValueOnce(2);
    answer = false;
    const { keepAsOwn, DRAFT } = await import('$lib/ui/grow/keep-draft');
    const holds: boolean[] = [];
    expect(await keepAsOwn({ form: 'place', fields: { name: 'My real cold frame', kind: 'frame' }, place: null }, (on) => holds.push(on))).toBe(false);
    expect(holds).toEqual([true, false]);
    expect(asked).toEqual([]);
    expect(session.m.has(DRAFT)).toBe(false);
  });
  it('the grower\'s own place of that name is picked; another is opened in "New…"', async () => {
    const { ownPlaceNamed } = await import('$lib/ui/grow/keep-draft');
    expect(ownPlaceNamed({ name: 'bench 1 ' }, [{ id: 'l1', name: 'Shelf' }, { id: 'l2', name: 'Bench 1' }])).toBe('l2');
    expect(ownPlaceNamed({ name: 'Kitchen windowsill' }, [{ id: 'l1', name: 'Shelf' }])).toBeNull();
  });
});

describe('every field the add forms bind is carried (X3; S-C2\'s list)', () => {
  /** The names a form binds its fields to, less the ones that are the example's own (its place's id, its parent plant) or the form's own state. */
  function bound(file: string, own: string[]): string[] {
    const s = readFileSync(file, 'utf8');
    const names = [...s.matchAll(/bind:(?:value|checked|open)=\{(\w+)\}/g)].map((m) => m[1]);
    return [...new Set(names)].filter((n) => !own.includes(n));
  }
  function carried(file: string): string {
    const s = readFileSync(file, 'utf8');
    const at = s.indexOf('function draftOf()');
    return at < 0 ? '' : s.slice(at, s.indexOf('\n  }', at));
  }
  it('the plant form: name, place, date, source, price, form, count, provenance, field number, own number, last watered, notes', () => {
    const f = 'src/routes/plants/new/+page.svelte';
    const fields = bound(f, ['locationId']);
    expect(fields.length).toBeGreaterThan(10);
    const c = carried(f);
    expect(fields.filter((n) => !new RegExp(`\\b${n}\\b`).test(c))).toEqual([]); // base: no draft; the address carried the species alone
    expect(c).toMatch(/place/);
  });
  it('the batch form, but its parent plant, which is the example\'s', () => {
    const f = 'src/routes/propagation/new/+page.svelte';
    const fields = bound(f, ['locationId', 'parentAcc', 'parentQ']);
    const c = carried(f);
    expect(c).not.toBe('');
    expect(fields.filter((n) => !new RegExp(`\\b${n}\\b`).test(c))).toEqual([]);
  });
  it('Places: the name, the kind and the place it goes inside', () => {
    const c = carried('src/routes/places/+page.svelte');
    expect(c).toMatch(/fields: \{ name, kind \}/);
    expect(c).toMatch(/place: inside/);
  });
});
