/**
 * Round sixty-nine, agent X:
 * - triage-68 X4 (S-C3): a replacement from a backup waiting to finish is not an empty collection. A Replace stopped by a
 *   full device leaves the live log wiped and the collection waiting in staging; the example opened over it by itself,
 *   dropped the notice saying why, and set out some 150 changes on a device out of space. The full device is stood in as
 *   tests/unit/r67r-replace-pending.test.ts does; the collection and vault are the real ones.
 * - triage-68 X5 (IND-7): a collection still opening is not known to be empty. A grower with only places who opened the
 *   example before the layout had settled was noted as having none (the front page's hint counts plants only), and the
 *   bar said "Add your first plant". The press now waits for the settled test, and the hint is never read as a no.
 */
import 'fake-indexeddb/auto';
import { wipeMeta } from './helpers/isolate';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { hlcEncode } from '$core/hlc';
import type { Change } from '$core/log';

vi.mock('$app/environment', () => ({ browser: true, dev: false, building: false, version: 'test' }));
vi.mock('$lib/sync/engine.svelte', () => ({ sync: { configured: false, busy: null } }));
vi.mock('$app/navigation', () => ({ goto: async () => {} }));

const DEV = 'aaaaaaaaaaaa';
const stamp = (wall: number, count = 0, device = 'bbbbbbbbbbbb') => hlcEncode({ wall, count, device });
const plant = (id: string, no: string, base: number, device = 'bbbbbbbbbbbb'): Change[] => [
  { t: stamp(base, 0, device), kind: 'accession', id, field: 'taxonName', value: 'Lithops ' + id },
  { t: stamp(base, 1, device), kind: 'accession', id, field: 'status', value: 'growing' },
  { t: stamp(base, 2, device), kind: 'accession', id, field: 'acc', value: no }
];
const jpeg = (n: number) => new Blob([new Uint8Array([0xff, 0xd8, 0xff, n, 0xff, 0xd9])], { type: 'image/jpeg' });
const realPut = IDBObjectStore.prototype.put;
/** A full device: the live log's puts refused, so the copy from staging stops with nothing of the file folded (S-C3's reproduction). */
const fullLiveLog = () =>
  vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, v: unknown, k?: IDBValidKey) {
    if (this.name === 'changes' && this.transaction.db.name === 'cultifolio') throw new DOMException('', 'QuotaExceededError');
    return realPut.call(this, v, k);
  });
async function boot() {
  vi.resetModules();
  const vault = await import('$lib/db/vault');
  const store = await import('$lib/db/collection.svelte');
  return { vault, collection: store.collection };
}
afterEach(() => vi.restoreAllMocks());

describe('a pending Replace is not "empty" (X4; S-C3)', () => {
  beforeEach(async () => {
    const { vault } = await boot();
    await vault.wipeVault();
    await wipeMeta(vault);
    await vault.setMeta('device', DEV);
  });
  it('the collection opens with nothing folded and the replacement waiting: it is neither offered the example nor sent into it', async () => {
    const base = Date.now() - 86_400_000;
    const a = await boot();
    await a.vault.appendChanges(plant('mine', '2026-0001', base, DEV), true);
    await a.collection.load();
    const st = await a.vault.openStaging();
    await st.putPhoto({ id: 'pfile', blob: jpeg(1), thumb: jpeg(2) });
    await st.appendChanges(plant('file', '2025-0001', base - 1000));
    fullLiveLog();
    await expect(st.promote()).rejects.toThrow();
    const b = await boot(); // the next load, the device still full
    await b.collection.load();
    const ex = await import('$lib/ui/grow/example.svelte');
    ex.example.settled = true;
    expect([b.collection.ready, b.collection.recordCount]).toEqual([true, 0]);
    expect(ex.ownEmpty()).toBe(false); // base: true, and Today, Places and Propagation opened the example over it
    expect(ex.offersHere()).toBe(false); // nor offered over it (round seventy-four: offered, never opened by itself)
  });
});

describe('a collection still opening is not known to be empty (X5; IND-7)', () => {
  const mk = () => { const m = new Map<string, string>(); return { m, s: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, String(v)), removeItem: (k: string) => void m.delete(k), key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; } } }; };
  const session = mk(), local = mk();
  const col = { ready: false, accessions: [] as unknown[], sowings: [] as unknown[], locations: [] as unknown[], taxa: [] as unknown[], heldWaiting: 0, parkedRecords: 0, recordCount: 0 };
  const asked: string[] = [];
  const KEYS = ['sessionStorage', 'localStorage', 'location', 'addEventListener', 'removeEventListener', 'document'] as const;
  const had = Object.fromEntries(KEYS.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  const def = (k: string, value: unknown) => Object.defineProperty(globalThis, k, { configurable: true, writable: true, value });
  beforeEach(() => {
    session.m.clear(); local.m.clear(); asked.length = 0;
    Object.assign(col, { ready: false, recordCount: 0, locations: [] });
    def('sessionStorage', session.s);
    def('localStorage', local.s);
    def('location', { pathname: '/today', get href() { return 'http://x/today'; }, set href(v: string) { asked.push(v); }, reload() {} });
    def('addEventListener', () => {});
    def('removeEventListener', () => {});
    def('document', { visibilityState: 'visible' });
    vi.resetModules();
    vi.doMock('$lib/db/collection.svelte', () => ({ collection: col }));
  });
  afterEach(() => {
    vi.doUnmock('$lib/db/collection.svelte');
    for (const k of KEYS) { const d = had[k]; if (d) Object.defineProperty(globalThis, k, d); else delete (globalThis as Record<string, unknown>)[k]; }
  });
  it('a grower with only places, pressing before the layout settled: the bar\'s note waits for the settled test', async () => {
    const ex = await import('$lib/ui/grow/example.svelte');
    expect(ex.enterExample('/today')).toBe(true); // "Opening the example collection" meanwhile
    expect(asked).toEqual([]); // not yet: base went at once, noting the plants-only hint's "none"
    expect(session.m.get(ex.OWN_NOTE)).not.toBe('0');
    Object.assign(col, { ready: true, recordCount: 2, locations: [{}, {}] }); // the collection opens: two places
    ex.example.settled = true;
    await vi.waitFor(() => expect(asked).toEqual([`/today?enter=${session.m.get('cultifolio.sampleEntering')}`])); // r77base: '/today' (round seventy-seven: the entry's token in the address)
    expect(session.m.get(ex.OWN_NOTE)).toBe('1'); // base: '0', and the bar said "Add your first plant"
  });
  it('inside the example, no note and no hint is "not known", never "none"', async () => {
    session.m.set('cultifolio.demo', '1');
    const ex = await import('$lib/ui/grow/example.svelte');
    expect(ex.hadOwn()).toBeNull(); // base: false, read from the plants-only hint's absence
    session.m.set(ex.OWN_NOTE, '?');
    expect(ex.hadOwn()).toBeNull();
    local.m.set('cultifolio.hasMine', '1');
    expect(ex.hadOwn()).toBe(true); // the hint is taken as a yes
    session.m.set(ex.OWN_NOTE, '0');
    expect(ex.hadOwn()).toBe(false); // the settled test's no
  });
  it('the bar offers "Add your first plant" only on the settled test\'s no', async () => {
    const { readFileSync } = await import('node:fs');
    expect(readFileSync('src/lib/ui/grow/DemoBar.svelte', 'utf8')).toMatch(/\{#if hasOwn === false\}<button[^>]*id="demo-add"/); // base: {#if !hasOwn}
  });
});
