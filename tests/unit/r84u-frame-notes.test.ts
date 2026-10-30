/**
 * Round eighty-four, agent U: two of outside review A16's smaller points.
 *
 * - Another tab's notice ("written", "refold") was followed by a catch-up or a rebuild whose failure was caught and
 *   dropped: the tab went on showing the collection as it was, without a word. Now `collection.readBehind` says it, and
 *   the layout shows it with a reload; a later reading that works puts it away.
 * - A file's `device.json` brought a site name of any length (3 MB was read, stored and drawn). Now a name is cut at 120
 *   characters, at a word, with its control characters gone, from a file and from the stored setting alike.
 *
 * On r84base: `readBehind` did not exist (undefined after the failure), and `siteName` did not exist.
 */
import 'fake-indexeddb/auto';
import { wipeMeta } from './helpers/isolate';
import { describe, it, expect, vi, beforeEach } from 'vitest';

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
beforeEach(async () => {
  failArrivals = false;
  const { vault } = await boot();
  await vault.wipeVault();
  await wipeMeta(vault);
  await vault.setMeta('device', 'aaaaaaaaaaaa');
});
const until = async (ok: () => boolean) => { for (let i = 0; i < 100 && !ok(); i++) await new Promise((r) => setTimeout(r, 10)); };

describe('another tab\'s change that this tab cannot read is said (A16)', () => {
  it('a failed catch-up sets readBehind; the next one that works puts it away', async () => {
    const { collection } = await boot();
    await collection.load();
    expect(collection.readBehind).toBeNull();
    const other = new BroadcastChannel('cultifolio-vault');
    try {
      failArrivals = true;
      other.postMessage('written');
      await until(() => !!collection.readBehind);
      expect(collection.readBehind).toMatch(/could not read a change made in another tab \(the database connection is closing\)\. Reload the page/);
      failArrivals = false;
      other.postMessage('written');
      await until(() => collection.readBehind === null);
      expect(collection.readBehind).toBeNull();
    } finally {
      other.close();
    }
  });
});

describe('a site name is bounded (A16)', () => {
  it('a name of megabytes is cut at a word to 120 characters, marked, and its control characters go', async () => {
    const { siteName, SITE_NAME_MAX } = await import('$lib/ui/site.svelte');
    const long = 'Pittsburgh '.repeat(300_000); // 3.3 MB
    const n = siteName(long)!;
    expect(n.length).toBeLessThanOrEqual(SITE_NAME_MAX);
    expect(n.endsWith('Pittsburgh…')).toBe(true);
    expect(siteName('Mt.\u0000 Lebanon,\n\tPennsylvania ')).toBe('Mt. Lebanon, Pennsylvania');
    expect(siteName('Mt. Lebanon')).toBe('Mt. Lebanon');
    expect(siteName('   ')).toBeNull();
    expect(siteName(42)).toBeNull();
    // One word longer than the limit is cut inside it, still marked.
    expect(siteName('x'.repeat(500))).toBe('x'.repeat(SITE_NAME_MAX - 1) + '…');
  });
});
