/**
 * The vault's in-flight write count (round five, 53): a reload forced by
 * another tab's upgrade waits for writes to land, or five seconds, whichever
 * comes first. The counter and the wait are pure; IndexedDB is never opened.
 */
import { describe, it, expect, vi } from 'vitest';
import { holdVault, whenVaultIdle, vaultWritesInFlight, RELOAD_MAX_MS } from '$lib/db/vault';

const defer = <T>() => {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
};

describe('vault in-flight writes', () => {
  it('counts held work and resolves the wait when the count reaches zero', async () => {
    expect(vaultWritesInFlight()).toBe(0);
    await expect(whenVaultIdle(RELOAD_MAX_MS)).resolves.toBeUndefined(); // nothing in flight: at once
    const a = defer<void>(), b = defer<void>();
    const pa = holdVault(() => a.promise), pb = holdVault(() => b.promise);
    expect(vaultWritesInFlight()).toBe(2);
    let idle = false;
    const wait = whenVaultIdle(RELOAD_MAX_MS).then(() => (idle = true));
    a.resolve();
    await pa;
    expect(idle).toBe(false); // one still in flight
    b.resolve();
    await pb;
    await wait;
    expect(idle).toBe(true);
    expect(vaultWritesInFlight()).toBe(0);
  });
  it('a write that fails, or throws before it starts, still lets the count fall', async () => {
    await expect(holdVault(async () => { throw new Error('quota'); })).rejects.toThrow('quota');
    await expect(holdVault(() => { throw new Error('closed'); })).rejects.toThrow('closed');
    expect(vaultWritesInFlight()).toBe(0);
  });
  it('gives up waiting after the ceiling even when a write never lands', async () => {
    vi.useFakeTimers();
    try {
      const stuck = defer<void>();
      const p = holdVault(() => stuck.promise);
      let idle = false;
      const wait = whenVaultIdle(RELOAD_MAX_MS).then(() => (idle = true));
      await vi.advanceTimersByTimeAsync(RELOAD_MAX_MS - 1);
      expect(idle).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await wait;
      expect(idle).toBe(true);
      expect(vaultWritesInFlight()).toBe(1); // the write is still there; the page just stopped waiting for it
      stuck.resolve();
      await p;
      expect(vaultWritesInFlight()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
