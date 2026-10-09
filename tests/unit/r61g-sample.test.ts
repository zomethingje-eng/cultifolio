/**
 * Round sixty-one, agent G: the sample collection's settings are the tab's own (docs/REVIEW-TRIAGE-60.md, decision 10;
 * the grower review's 14, the records review's 17, outside review B1), it is set out in one commit, and a restore refuses
 * to start inside it. The browser's storage and cookie are stood in.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Change } from '$core/log';

vi.mock('$app/environment', () => ({ browser: true, dev: false, building: false, version: 'test' }));

const mk = () => { const m = new Map<string, string>(); return { m, s: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, String(v)), removeItem: (k: string) => void m.delete(k), key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; }, clear: () => m.clear() } }; };
const session = mk(), local = mk();
const cookies: string[] = [];
Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: session.s });
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: local.s });
Object.defineProperty(globalThis, 'document', { configurable: true, value: { get cookie() { return cookies.join('; '); }, set cookie(v: string) { cookies.push(v); }, documentElement: { dataset: {} } } });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { language: 'en-GB' } });
Object.defineProperty(globalThis, 'window', { configurable: true, value: { addEventListener: () => {} } });

const mem: { changes: Change[]; meta: Map<string, unknown>; appends: number } = { changes: [], meta: new Map(), appends: 0 };
vi.mock('$lib/db/vault', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m: any = {
    allChanges: async () => [...mem.changes],
    appendChanges: async (c: Change[]) => { mem.appends++; mem.changes.push(...c); return { kept: c, replaced: [] }; },
    getMeta: async (k: string) => mem.meta.get(k),
    setMeta: async (k: string, v: unknown) => void mem.meta.set(k, v),
    deviceId: async () => 'testdevice',
    requestPersistence: async () => true
  };
  m.appendChangesClaiming = async (_k: string, known: Set<string>, build: (s: Set<string>) => { changes: Change[]; result: unknown }) => { const b = build(new Set(known)); await m.appendChanges(b.changes); return b.result; };
  m.onOtherTabWrite = () => () => {};
  m.readFold = async () => undefined;
  m.writeFold = async () => false;
  m.foldGen = async () => 0;
  m.dropFold = async () => {};
  m.parkStamps = async (st: string[]) => st;
  m.lastArrival = async () => 0;
  m.arrivalsAfter = async () => ({ changes: [...mem.changes], seq: 0, gen: 0 });
  m.changeKeys = async () => mem.changes.map((c) => c.t);
  m.changesByKeys = async (ts: string[]) => mem.changes.filter((c) => ts.includes(c.t));
  m.updateMeta = async (k: string, fn: (had: unknown) => unknown) => { const next = fn(mem.meta.get(k)); mem.meta.set(k, next); return next; };
  m.changesOf = async (kind: string, id: string) => mem.changes.filter((c) => c.kind === kind && c.id === id);
  m.holdVault = async (work: () => Promise<unknown>) => work();
  m.announceSyncForgotten = () => {};
  m.openStaging = async () => { throw new Error('the staging database was opened'); };
  return m;
});

const { readSetting, writeSetting } = await import('$lib/ui/stored');
const { units } = await import('$lib/ui/units.svelte');
const { site } = await import('$lib/ui/site.svelte');
const { prefs } = await import('$lib/ui/prefs.svelte');

beforeEach(() => { session.m.clear(); local.m.clear(); cookies.length = 0; });

describe('settings by scope (B\'s suggestion; the grower review, 14)', () => {
  it('outside the sample, a setting is the device\'s localStorage under its own key', () => {
    expect(writeSetting('cultifolio.labels', 'device', '{"sheetK":"5167"}')).toBe(true);
    expect(local.m.get('cultifolio.labels')).toBe('{"sheetK":"5167"}');
    expect(readSetting('cultifolio.labels', 'device')).toBe('{"sheetK":"5167"}');
  });
  it('in the sample, a write is the tab\'s own; a device setting is read from the device until the tab sets its own; a collection setting never is', () => {
    local.m.set('cultifolio.labels', '{"sheetK":"5167"}');
    local.m.set('cultifolio.frost.site', '{"lat":51.5,"lon":-0.1}');
    session.m.set('cultifolio.demo', '1');
    expect(readSetting('cultifolio.labels', 'device')).toBe('{"sheetK":"5167"}');
    expect(readSetting('cultifolio.frost.site', 'collection')).toBeNull();
    writeSetting('cultifolio.labels', 'device', '{"sheetK":"L7160"}');
    expect(local.m.get('cultifolio.labels')).toBe('{"sheetK":"5167"}');
    expect(session.m.get('cultifolio.demo.labels')).toBe('{"sheetK":"L7160"}');
    expect(readSetting('cultifolio.labels', 'device')).toBe('{"sheetK":"L7160"}');
  });
  it('units chosen in the sample write no cookie: the grower\'s own pages keep theirs', () => {
    session.m.set('cultifolio.demo', '1');
    units.set('us');
    expect(cookies).toEqual([]);
    expect(session.m.get('cultifolio.demo.units')).toBe('us');
    units.seed('metric');
    expect(units.current).toBe('us');
    session.m.delete('cultifolio.demo');
    units.set('metric');
    expect(cookies.join()).toMatch(/cultifolio\.units=metric/);
  });
  it('a frost site set in the sample is not the grower\'s, and writes no hemisphere cookie', () => {
    local.m.set('cultifolio.frost.site', '{"lat":51.5,"lon":-0.1}');
    session.m.set('cultifolio.demo', '1');
    site.loaded = false;
    site.load();
    expect(site.current).toBeNull();
    site.set({ lat: -33.9, lon: 18.4 });
    expect(local.m.get('cultifolio.frost.site')).toBe('{"lat":51.5,"lon":-0.1}');
    expect(cookies).toEqual([]);
  });
  it('preferences changed in the sample stay in the tab', () => {
    session.m.set('cultifolio.demo', '1');
    prefs.loaded = false;
    prefs.load();
    prefs.set({ referencePhotos: true });
    expect(local.m.has('cultifolio.prefs')).toBe(false);
    expect(JSON.parse(session.m.get('cultifolio.demo.prefs')!)).toMatchObject({ referencePhotos: true });
  });
});

describe('the sample is set out in one commit (the accessibility review, 4)', () => {
  it('twelve plants, the places, the batch, the lines and the Wanted species land in one write', async () => {
    session.m.set('cultifolio.demo', '1');
    const { seedDemo } = await import('$lib/ui/grow/demo-seed');
    const { collection } = await import('$lib/db/collection.svelte');
    const before = mem.appends;
    expect(await seedDemo()).toBe(true);
    expect(mem.appends - before).toBe(1);
    expect(collection.accessions).toHaveLength(12);
    expect(new Set(collection.accessions.map((a) => a.acc)).size).toBe(12);
    expect(collection.events(collection.accessions[0].id).some((e) => e.t === 'acquire')).toBe(true);
  });
});

describe('a restore refuses to start in the sample (review B)', () => {
  it('merge and replace are refused before anything is read or staged', async () => {
    session.m.set('cultifolio.demo', '1');
    const { restoreBackup } = await import('$lib/backup/io');
    const { replaceThroughStaging } = await import('$lib/backup/replace');
    await expect(restoreBackup({} as never, 'merge')).rejects.toThrow(/off in the example collection/);
    let opened = false;
    await expect(replaceThroughStaging({ unreadable: [], changes: [] } as never, async () => { opened = true; return {} as never; })).rejects.toThrow(/example collection/);
    expect(opened).toBe(false);
  });
});

describe('the bar is drawn before the first paint (the accessibility review, 3 and 4)', () => {
  it('app.html marks the sample\'s tab from the flag before paint, and the layout imports the grow layer by its own path', () => {
    const html = readFileSync('src/app.html', 'utf8');
    expect(html).toMatch(/sessionStorage\.getItem\('cultifolio\.demo'\)==='1'\)\{d\.demo='1'/);
    const layout = readFileSync('src/routes/+layout.svelte', 'utf8');
    expect(layout).not.toMatch(/from '\$lib\/ui\/grow'/);
    expect(layout).toMatch(/import GrowLayer from '\$lib\/ui\/grow\/GrowLayer\.svelte'/);
  });
});
