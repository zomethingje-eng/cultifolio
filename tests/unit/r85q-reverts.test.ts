/**
 * Round eighty-five, Q: two fixes of round eighty-four that no test failed when they were taken back alone.
 *
 * 1. The gap catch-up's report (review-c C8's 1). A write of this tab whose rows do not follow its frontier (another tab
 *    wrote in between, and its notice has not arrived) is followed by a catch-up (`advanceOver`). Round eighty-four said a
 *    failed catch-up after another tab's notice (`readBehind`), and r84u-frame-notes tests that path; the gap's path was
 *    put back to `.catch(() => {})` and both of its tests still passed. Here the gap is made, the catch-up fails, and the
 *    tab must say so; a later one that works puts the sentence away. Fails with
 *    `queueMicrotask(() => void this.catchUp().catch(() => {}))` at collection.svelte.ts's `advanceOver`.
 * 2. The site name bounded on restore (outside review A23). r84u-frame-notes tests `siteName` itself; a restore that put
 *    the file's name in unbounded (`siteShape` without `siteName`) passed it. Here a backup's `device.json` with a 3 MB
 *    name is applied as a restore applies it, and what this device then holds, stores and reads back is bounded. Fails
 *    with `siteShape` keeping `o.name` as it came.
 */
import 'fake-indexeddb/auto';
import { wipeMeta } from './helpers/isolate';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Change } from '$core/log';

let failArrivals = false;
vi.mock('$lib/db/vault', async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return { ...real, arrivalsAfter: async (...a: unknown[]) => { if (failArrivals) throw new Error('the database connection is closing'); return (real.arrivalsAfter as (...x: unknown[]) => unknown)(...a); } };
});

async function boot() {
  vi.resetModules();
  const vault = await import('$lib/db/vault');
  const { collection } = await import('$lib/db/collection.svelte');
  return { vault, collection };
}
const until = async (ok: () => boolean) => { for (let i = 0; i < 200 && !ok(); i++) await new Promise((r) => setTimeout(r, 10)); };

describe('1. a gap in the log after this tab\'s own write, whose catch-up fails, is said (C8)', () => {
  beforeEach(async () => {
    failArrivals = false;
    const { vault } = await boot();
    await vault.wipeVault();
    await wipeMeta(vault);
    await vault.setMeta('device', 'aaaaaaaaaaaa');
  });
  it('the catch-up that follows the gap fails: readBehind says so; the next that works puts it away', async () => {
    const { vault, collection } = await boot();
    await collection.load();
    expect(collection.readBehind).toBeNull();
    // Another tab's write whose notice has not reached this tab: rows past this tab's frontier. (The module's own channel
    // never hears itself, as another tab's notice would be heard; so nothing is followed yet.)
    const other = (n: number): Change[] => [['acc', `2026-000${n}`], ['taxonName', 'Copiapoa cinerea'], ['status', 'growing']].map(([field, value], i) => ({ t: `${String(Date.now() - 60_000 + n * 10 + i).padStart(13, '0')}-0000-bbbbbbbbbbbbzzzz`, kind: 'accession', id: `other${n}`, field, value }));
    await vault.appendChanges(other(1), true);
    expect(collection.accessions.some((a) => a.id === 'other1')).toBe(false);
    // This tab writes: its rows follow the other's, past a gap, and the catch-up that follows fails.
    failArrivals = true;
    await collection.addLocation({ name: 'Bench', type: 'shelf' } as never);
    await until(() => !!collection.readBehind);
    expect(collection.readBehind).toMatch(/could not read a change made in another tab \(the database connection is closing\)\. Reload the page/);
    // Another gap, and a catch-up that works: the other tab's plants are read in, and the sentence goes.
    failArrivals = false;
    await vault.appendChanges(other(2), true);
    await collection.addLocation({ name: 'Shelf', type: 'shelf' } as never);
    await until(() => collection.readBehind === null);
    expect(collection.readBehind).toBeNull();
    expect(collection.accessions.map((a) => a.id).filter((id) => id.startsWith('other')).sort()).toEqual(['other1', 'other2']);
  });
});

describe('2. a restore applies a site name bounded, as Settings and the stored setting are (A16, A23)', () => {
  it("a backup's device.json with a 3 MB site name: this device keeps the place and a name of at most 120 characters, and reads it back so", async () => {
    vi.resetModules();
    vi.doMock('$app/environment', () => ({ browser: true, dev: false, building: false, version: 'test' }));
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, String(v)), removeItem: (k: string) => void store.delete(k), key: (i: number) => [...store.keys()][i] ?? null, get length() { return store.size; }, clear: () => store.clear() };
    const cookies: string[] = [];
    const saved = { localStorage: globalThis.localStorage, sessionStorage: globalThis.sessionStorage, document: globalThis.document, window: (globalThis as { window?: unknown }).window };
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { ...storage, getItem: () => null } });
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { addEventListener: () => {}, removeEventListener: () => {}, localStorage: storage } });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { get cookie() { return cookies.join('; '); }, set cookie(v: string) { cookies.push(v); }, documentElement: { dataset: {} } } });
    try {
      const { applyDeviceSettings, previewDeviceSettings } = await import('$lib/backup/device');
      const { site, SITE_NAME_MAX } = await import('$lib/ui/site.svelte');
      const file = { site: { lat: 40.38, lon: -80.05, name: 'Mt. Lebanon '.repeat(300_000) } }; // 3.3 MB
      expect(previewDeviceSettings(file)).toEqual(['site']);
      expect(applyDeviceSettings(file)).toContain('site');
      const held = site.current!;
      expect(held.lat).toBe(40.38);
      expect(held.name!.length).toBeLessThanOrEqual(SITE_NAME_MAX); // reverted: 3,300,000
      expect(held.name!.endsWith('…')).toBe(true); // cut at a word, and marked
      // What this device stored is the bounded name, and a page that loads reads it so.
      const kept = [...store.entries()].find(([k]) => k.endsWith('frost.site'));
      expect(kept && kept[1].length).toBeLessThan(400);
      vi.resetModules();
      const again = (await import('$lib/ui/site.svelte')).site;
      again.load();
      expect(again.current!.name).toBe(held.name);
    } finally {
      vi.doUnmock('$app/environment');
      for (const [k, v] of Object.entries(saved)) Object.defineProperty(globalThis, k, { configurable: true, value: v });
    }
  });
});
