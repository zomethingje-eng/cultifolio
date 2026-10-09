/**
 * Round sixty-two, second pass (agent L; the data review's suspected items): a round-sixty-one tab left open beside this
 * build is made to let go of the vault and reload. The vault opens at version 4, so an older build's open connection
 * (version 3) hears `versionchange` and runs its `blocking` handler. FAILED on the first pass (version 3: no event).
 * Run: npx vitest run tests/unit/r62bl-vault-version.test.ts
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi } from 'vitest';

describe('a tab of the round-sixty-one build', () => {
  it('is told to let go when this build opens the vault', async () => {
    await new Promise<void>((res) => { const r = indexedDB.deleteDatabase('cultifolio'); r.onsuccess = r.onerror = r.onblocked = () => res(); });
    // the older tab: the vault at version 3, as round sixty-one opened it, with its handler
    const old = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('cultifolio', 3);
      r.onupgradeneeded = () => { const db = r.result; db.createObjectStore('changes', { keyPath: 't' }).createIndex('byRecord', ['kind', 'id']); db.createObjectStore('meta'); db.createObjectStore('photos', { keyPath: 'id' }); db.createObjectStore('outbox', { keyPath: 't' }); db.createObjectStore('order', { autoIncrement: true }); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const told: Array<number | null> = [];
    old.onversionchange = (e) => { told.push(e.newVersion); old.close(); };
    vi.resetModules();
    const vault = await import('$lib/db/vault');
    const db = await vault.openVault();
    expect(told).toEqual([4]);
    expect(db.version).toBe(4);
    expect([...db.objectStoreNames].sort()).toEqual(['changes', 'meta', 'order', 'outbox', 'photos']);
  });
});
