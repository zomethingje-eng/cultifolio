/**
 * Server review, round sixty-two: the sweep judges a page of places, then marks each judged vault's meta in R2
 * (`marked()`, two or three R2 calls per vault, one vault after another), and only then gives the places back in one
 * transaction, without judging them again. A Durable Object delivers other requests while it awaits R2 (its input gate
 * closes only for storage calls), so a `touch` from an upload that arrives during `marked()` finds the place, keeps
 * today as its last upload, and answers 'already'; the transaction then deletes that place anyway, writes `r:<vault>`
 * and lowers `all`. A vault uploading at that moment loses its place, and its meta says `reclaimedAt` although it has
 * just uploaded. When the service is full its next upload is refused with "This vault had no upload for 90 days".
 * Before this round the judgement and the deletion had no outside await between them.
 *
 * The test calls `touch` on the object directly (not through the queue of the shared stand-in, which delivers one call
 * at a time and so cannot show what a real object does during an outbound R2 call).
 *
 * Expected: the place touched during the sweep is kept. FAILS on the merged code.
 *
 * Run: cp /tmp/r62rev/out/tests/server--sweep-touch-race.test.ts tests/unit/ && npx vitest run tests/unit/server--sweep-touch-race.test.ts
 */
import { describe, it, expect } from 'vitest';
import { Counters, RECLAIM_DAYS } from '$lib/server/counters';
import { fakeR2 } from './helpers/fake-sync';
import { txStorage } from './helpers/r62s-fake';

const DAY = 86_400_000;
const T = Date.UTC(2026, 0, 10, 12);
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const V = 'ABCDEFGHJKMNPQRSTVWXYZ2346';

describe('the 90-day sweep and an upload at the same moment', () => {
  it("keeps the place of a vault that uploaded while the sweep was marking metas", async () => {
    const storage = txStorage();
    const r2 = fakeR2();
    const c = new Counters({ storage } as never, { STORE: r2 } as never);
    await r2.put(`vault/${V}/meta.json`, JSON.stringify({ tokenHash: 'h', created: 'c', entitlement: 'open', bytes: 0, filled: true }));
    expect(await c.fill(V, 2000, 0, day(T), 200, T)).toBe('counted');
    const now = T + (RECLAIM_DAYS + 2) * DAY;
    // The upload's touch arrives while the sweep awaits R2 for this vault's meta.
    let touched: Promise<string> | null = null;
    const get = r2.get.bind(r2);
    r2.get = (async (k: string) => {
      if (k === `vault/${V}/meta.json` && !touched) touched = c.touch(V, day(now), 2000, 0, false, now);
      await touched;
      return get(k);
    }) as typeof r2.get;
    await c.sweep(now);
    expect(await touched).toBe('already'); // the upload was told it holds a place
    expect({ place: storage.m.has(`f:${V}`), note: storage.m.has(`r:${V}`), all: storage.m.get('all') }).toEqual({ place: true, note: false, all: 1 });
  });
});
