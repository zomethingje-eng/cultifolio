/**
 * What one test leaves for the next, taken away (round fifty-nine; the outside review of the harness).
 *
 * Every `vi.resetModules()` makes a fresh vault module, and with it a BroadcastChannel that stayed open for the rest of
 * the file: a tab from an earlier test could still hear this test's notices. The channels a test opened are closed when
 * it ends. Import this before anything that imports the vault, so the channels are counted from the first.
 *
 * And `wipeVault()` keeps the meta store on purpose (a replaced collection keeps its device id and its sync key), so a
 * test that set a meta key the next one never resets (a clock correction, a held set) handed it on. `wipeMeta()` clears it.
 */
import { afterEach } from 'vitest';
import type { IDBPDatabase } from 'idb';

const open: BroadcastChannel[] = [];
const Real = globalThis.BroadcastChannel;
if (Real && !(Real as unknown as { tracked?: boolean }).tracked) {
  class Tracked extends Real {
    static tracked = true;
    constructor(name: string) { super(name); open.push(this); }
  }
  globalThis.BroadcastChannel = Tracked as unknown as typeof BroadcastChannel;
}
afterEach(() => { for (const c of open.splice(0)) c.close(); });

/** Every meta key gone, through the vault module the test is using. */
export async function wipeMeta(vault: { openVault(): Promise<IDBPDatabase<never>> } | { openVault(): Promise<unknown> }): Promise<void> {
  const db = (await vault.openVault()) as IDBPDatabase<{ meta: { key: string; value: unknown } }>;
  await db.clear('meta');
}
