/**
 * The real `Counters` Durable Object class against a fake storage with the object's own contract (get/put/list/delete,
 * getAlarm/setAlarm): the ceilings, the refund, the seed, and the sweep at midnight (round twenty-three, 6 and 8).
 */
import { describe, it, expect } from 'vitest';
import { Counters, nextMidnight, LEASE_MS, HOLD_MS } from '$lib/server/counters';

function fakeStorage() {
  const m = new Map<string, number>();
  let alarm: number | null = null;
  return {
    m,
    alarmAt: () => alarm,
    async get<T>(keys: string[]): Promise<Map<string, T>> {
      const out = new Map<string, T>();
      for (const k of keys) if (m.has(k)) out.set(k, m.get(k) as T);
      return out;
    },
    async put(entries: Record<string, number>) {
      for (const [k, v] of Object.entries(entries)) m.set(k, v);
    },
    async list<T>(o: { prefix?: string; limit?: number } = {}): Promise<Map<string, T>> {
      return new Map(([...m].filter(([k]) => k.startsWith(o.prefix ?? '')) as [string, T][]).slice(0, o.limit ?? Infinity));
    },
    async delete(keys: string | string[]) {
      for (const k of typeof keys === 'string' ? [keys] : keys) m.delete(k);
    },
    async getAlarm() {
      return alarm;
    },
    async setAlarm(t: number) {
      alarm = t;
    },
    /** The alarm has run: a Durable Object's alarm is unset once it fires. */
    fired() {
      alarm = null;
    }
  };
}
const make = () => {
  const storage = fakeStorage();
  const c = new Counters({ storage } as never, {} as never);
  return { c, storage };
};
const T0 = Date.UTC(2026, 8, 25, 0, 0, 30); // 00:00:30 on the 25th

describe('Counters', () => {
  it('counts five for one address, a day and a total, and refunds', async () => {
    const { c, storage } = make();
    const rs: string[] = [];
    for (let i = 0; i < 7; i++) rs.push(await c.create('a', '2026-09-25', 5, 200, 2000, 0));
    expect(rs).toEqual(['ok', 'ok', 'ok', 'ok', 'ok', 'address', 'address']);
    // the total counts vaults that hold something: taken at a vault's first object, not at its creation (round fifty-eight)
    expect(storage.m.get('all')).toBe(0);
    for (let i = 0; i < 5; i++) await c.fill(`vault${i}`, 2000, 0);
    await c.fill('vault0', 2000, 0); // the same vault again: counted once (round fifty-nine)
    expect(storage.m.get('all')).toBe(5);
    await c.refund('a', '2026-09-25');
    expect(await c.create('a', '2026-09-25', 5, 200, 2000, 0)).toBe('ok');
    expect(storage.m.get('all')).toBe(5); // a refund gives back the address's and the day's counts, never the total's
    await c.create('c', '2026-09-25', 5, 200, 2000, 0);
    await c.refund('c', '2026-09-25'); // an address refunded to zero is not counted among the addresses (round twenty-four, 6)
    expect((await c.totals('2026-09-25')).addresses).toBe(1);
    // the day's ceiling counts vaults at their first object, as the total does (round sixty): five creations spent none of it
    expect(await c.create('b', '2026-09-25', 5, 5, 2000, 0)).toBe('ok');
    for (let i = 0; i < 5; i++) await c.fill(`day${i}`, 2000, 0, '2026-09-25', 5);
    expect(await c.fill('day5', 2000, 0, '2026-09-25', 5)).toBe('day');
    expect(await c.create('b', '2026-09-25', 5, 5, 2000, 0)).toBe('day');
    expect(await c.create('b', '2026-09-25', 5, 200, 5, 0)).toBe('total');
  });
  it("the day's ceiling of new vaults is not spent by creations that store nothing (round sixty; the self-review, 12)", async () => {
    const { c, storage } = make();
    const day = '2026-10-04';
    let ok = 0;
    for (let a = 0; a < 40; a++) for (let i = 0; i < 5; i++) if ((await c.create(`198.51.100.${a}`, day, 5, 200, 2000, 0)) === 'ok') ok++;
    expect(ok).toBe(200); // forty addresses each make their five
    expect(storage.m.get(`day:${day}`) ?? 0).toBe(0);
    expect(await c.create('203.0.113.9', day, 5, 200, 2000, 0)).toBe('ok'); // a real grower is not refused
    expect(await c.fill('GROWER', 2000, 0, day, 200)).toBe('counted');
    expect(storage.m.get(`day:${day}`)).toBe(1);
  });
  it('a vault whose first object did not land gives its place back, under the total and under its day; once only', async () => {
    const { c, storage } = make();
    const day = '2026-10-04';
    expect(await c.fill('V1', 10, 0, day, 5)).toBe('counted');
    expect(await c.fill('V2', 10, 0, day, 5)).toBe('counted');
    expect([storage.m.get('all'), storage.m.get(`day:${day}`)]).toEqual([2, 2]);
    expect(await c.unfill('V1')).toBe(true);
    expect(await c.unfill('V1')).toBe(false);
    expect([storage.m.get('all'), storage.m.get(`day:${day}`), storage.m.has('f:V1')]).toEqual([1, 1, false]);
    expect(await c.fill('V1', 10, 0, day, 5)).toBe('counted'); // its next upload counts it again
  });
  it('an IPv6 /48 has four times one address\'s allowance across its /64s, refunded with the address, and swept with it (round thirty-eight, R1-8)', async () => {
    const { c, storage } = make();
    const rs: string[] = [];
    // 21 creations from 21 different /64s of one /48, each under its own address allowance.
    for (let i = 0; i < 21; i++) rs.push(await c.create(`2001:db8:1:${i.toString(16)}::/64`, '2026-09-25', 5, 200, 2000, 0, T0, '2001:db8:1::/48'));
    expect(rs.filter((r) => r === 'ok')).toHaveLength(20);
    expect(rs[20]).toBe('address');
    await c.refund('2001:db8:1:14::/64', '2026-09-25', '2001:db8:1::/48');
    expect(await c.create('2001:db8:1:15::/64', '2026-09-25', 5, 200, 2000, 0, T0, '2001:db8:1::/48')).toBe('ok');
    expect(await c.create('2001:db8:2:0::/64', '2026-09-25', 5, 200, 2000, 0, T0, '2001:db8:2::/48')).toBe('ok'); // another /48 is not affected
    expect(await c.create('203.0.113.7', '2026-09-25', 5, 200, 2000, 0, T0, null)).toBe('ok'); // IPv4 carries no network key
    expect((await storage.get(['net:2001:db8:1::/48:2026-09-25'])).get('net:2001:db8:1::/48:2026-09-25')).toBe(20);
    expect((await c.sweep(T0 + 3 * 86_400_000)).some((k) => k.startsWith('net:'))).toBe(true);
  });
  it('a seed that could not be read does not become zero: the object waits until it can be seeded, then takes the count once (round twenty-three, 6)', async () => {
    const { c, storage } = make();
    expect(await c.create('a', '2026-09-25', 5, 200, 200, null)).toBe('unavailable');
    expect(storage.m.has('all')).toBe(false);
    expect(await c.create('a', '2026-09-25', 5, 200, 200, 199)).toBe('ok');
    expect(storage.m.get('all')).toBe(199);
    expect(await c.fill('v1', 200, null)).toBe('counted');
    expect(storage.m.get('all')).toBe(200);
    expect(await c.fill('v2', 200, null)).toBe('total'); // past the ceiling a vault's first object is refused (round fifty-nine)
    expect(await c.create('b', '2026-09-25', 5, 200, 200, 199)).toBe('total');
    expect(await c.create('b', '2026-09-25', 5, 200, 200, null)).toBe('total'); // seeded: a later unreadable seed changes nothing
  });
  it('the alarm is set for the next UTC midnight, and the sweep keeps only today and yesterday: no address key lives past 48 hours (round twenty-three, 8)', async () => {
    const { c, storage } = make();
    await c.create('a', '2026-09-25', 5, 200, 2000, 0, T0);
    expect(storage.alarmAt()).toBe(Date.UTC(2026, 8, 26));
    expect(nextMidnight(T0)).toBe(Date.UTC(2026, 8, 26));
    // the alarm at the midnight starting the 26th keeps the 25th's key (yesterday)
    expect(await c.sweep(Date.UTC(2026, 8, 26))).toEqual([]);
    await c.fill('V', 2000, 0, '2026-09-25', 200, T0);
    // the alarm at the midnight starting the 27th drops it: 47 h 59 m 30 s after it was written
    expect(await c.sweep(Date.UTC(2026, 8, 27))).toEqual(['ip:a:2026-09-25', 'day:2026-09-25']);
    expect(storage.m.get('all')).toBe(1); // the total stays
  });
  it('the alarm is set again only while something sweepable remains (round sixty; A22)', async () => {
    const { c, storage } = make();
    await c.create('a', '2026-09-25', 5, 200, 2000, 0, T0);
    await c.fill('V', 2000, 0, '2026-09-25', 200, T0);
    // the midnight starting the 26th: the 25th's keys are yesterday's and stay, so it wakes again
    storage.fired();
    await c.tick(Date.UTC(2026, 8, 26));
    expect(storage.alarmAt()).toBe(Date.UTC(2026, 8, 27));
    // the next midnight sweeps them; only `all` and `f:V` remain, which never go, so it is not woken again
    storage.fired();
    await c.tick(Date.UTC(2026, 8, 27));
    expect([...storage.m.keys()].sort()).toEqual(['all', 'f:V']);
    expect(storage.alarmAt()).toBeNull();
    // a vault object: its total and generation stay; with no lease, hold, claim or token left it sleeps
    const v = make();
    await v.c.setBytes(10, '2026-09-25', null, T0);
    const t = await v.c.take('vault', 5, 100, '2026-09-25', null, T0);
    if (!('ok' in t) || !t.lease) throw new Error('no lease');
    await v.c.release(t.lease, true);
    await v.c.give('vault', 5, '2026-09-25', 'k:v:1');
    expect(v.storage.alarmAt()).toBe(Date.UTC(2026, 8, 26));
    v.storage.fired();
    await v.c.tick(Date.UTC(2026, 8, 27));
    expect(v.storage.alarmAt()).toBeNull();
    expect([...v.storage.m.keys()].sort()).toEqual(['gen', 'v']);
  });
  it('the byte totals: a vault\'s is put right by a listing each day and taken in one step; an address\'s is per day and swept (round fifty-eight)', async () => {
    const v = make();
    expect(await v.c.take('vault', 10, 100, '2026-09-25')).toEqual({ recount: true });
    expect(await v.c.take('vault', 10, 100, '2026-09-25', 85)).toMatchObject({ ok: true, before: 85 });
    expect(await v.c.take('vault', 10, 100, '2026-09-25')).toEqual({ ok: false, before: 95 });
    expect(await v.c.give('vault', 20, '2026-09-25')).toBe(75);
    expect(await v.c.bytesToday('2026-09-25')).toBe(75);
    expect(await v.c.bytesToday('2026-09-26')).toBeNull(); // another day: the listing again
    expect(await v.c.take('vault', 1, 100, '2026-09-26')).toEqual({ recount: true });
    const a = make();
    expect(await a.c.take('address', 60, 100, '2026-09-25', null, T0)).toEqual({ ok: true, before: 0 });
    expect(await a.c.take('address', 60, 100, '2026-09-25', null, T0)).toEqual({ ok: false, before: 60 });
    expect(await a.c.take('address', 60, 100, '2026-09-26', null, T0)).toEqual({ ok: true, before: 0 });
    expect(a.storage.alarmAt()).toBe(Date.UTC(2026, 8, 26));
    await a.c.tick(Date.UTC(2026, 8, 28));
    expect(a.storage.m.size).toBe(0); // nothing of the address is kept past its two days
    expect(a.storage.alarmAt()).toBe(Date.UTC(2026, 8, 26)); // and an empty object is not woken again
  });

  it('a take holds a lease; release is by its id, once; a lease older than ten minutes is dropped (round sixty; A18, B6)', async () => {
    const { c, storage } = make();
    const day = '2026-10-04';
    const t0 = Date.UTC(2026, 9, 4, 12);
    await c.setBytes(0, day, null, t0);
    const a = await c.take('vault', 10, 100, day, null, t0);
    const b = await c.take('vault', 20, 100, day, null, t0);
    if (!('ok' in a) || !('ok' in b) || !a.lease || !b.lease) throw new Error('no lease');
    expect(a.lease).not.toBe(b.lease);
    expect([...storage.m.keys()].filter((k) => k.startsWith('p:'))).toHaveLength(2);
    await c.release(a.lease, false); // failed: its bytes go back
    await c.release(a.lease, false); // twice is nothing
    expect(await c.bytesToday(day)).toBe(20);
    // b's Worker died: the lease is never released. A listing within ten minutes adds it back (it may not be in R2 yet)...
    expect(await c.setBytes(0, day, null, t0 + 60_000)).toBe(20);
    // ...and one past ten minutes does not: it is dropped, and counted from then on only if the listing sees it.
    expect(await c.setBytes(0, day, null, t0 + LEASE_MS + 1)).toBe(0);
    expect([...storage.m.keys()].filter((k) => k.startsWith('p:'))).toHaveLength(0);
    await c.release(b.lease, false); // a release after it lapsed takes nothing off
    expect(await c.bytesToday(day)).toBe(0);
  });
  it("nine leases never released do not refuse a vault weeks later (the server review's reproduction, turned round)", async () => {
    const { c } = make();
    const t0 = Date.UTC(2026, 9, 4, 12);
    await c.setBytes(0, '2026-10-04', null, t0);
    for (let i = 0; i < 9; i++) await c.take('vault', 10, 100, '2026-10-04', null, t0);
    await c.setBytes(0, '2026-10-30', null, t0 + 26 * 86_400_000);
    expect(await c.take('vault', 20, 100, '2026-10-30', null, t0 + 26 * 86_400_000)).toMatchObject({ ok: true, before: 0 });
  });
  it('a lease past its time is dropped by take and by the sweep too', async () => {
    const { c, storage } = make();
    const t0 = Date.UTC(2026, 9, 4, 12);
    await c.take('vault', 10, 100, '2026-10-03', 0, t0 - LEASE_MS - 5); // in flight across midnight, and never released
    // the next day's first take adds no lapsed lease to its listing
    expect(await c.take('vault', 5, 100, '2026-10-04', 50, t0)).toMatchObject({ ok: true, before: 50 });
    await c.take('vault', 1, 100, '2026-10-04', null, t0);
    expect((await c.sweep(t0 + LEASE_MS + 1)).filter((k) => k.startsWith('p:'))).toHaveLength(2);
    expect([...storage.m.keys()].filter((k) => k.startsWith('p:'))).toHaveLength(0);
  });
  it("a day's first listing has what is still in flight added to it (S16)", async () => {
    const { c } = make();
    const t0 = Date.UTC(2026, 9, 4, 0, 0, 5);
    await c.setBytes(0, '2026-10-03', null, t0 - 60_000);
    await c.take('vault', 10, 100, '2026-10-03', null, t0 - 30_000); // in flight across midnight
    expect(await c.take('vault', 5, 100, '2026-10-04', 50, t0)).toMatchObject({ ok: true, before: 60 });
  });
  it("once today's row exists, a stale listing passed by a late request does not replace it (S15)", async () => {
    const { c } = make();
    const day = '2026-10-04';
    const a = await c.take('vault', 10, 100, day, 0);
    if (!('ok' in a) || !a.lease) throw new Error('no lease');
    await c.release(a.lease, true);
    expect(await c.take('vault', 10, 100, day, 0)).toMatchObject({ ok: true, before: 10 });
    expect(await c.bytesToday(day)).toBe(20);
  });
  it('a listing that a landing or a removal crossed is not committed (round sixty; B7)', async () => {
    const { c } = make();
    const day = '2026-10-04';
    await c.setBytes(0, day);
    const before = await c.generation();
    // an upload lands while a recount lists R2 (the listing, made before, does not see it)
    const t = await c.take('vault', 100, 1000, day);
    if (!('ok' in t) || !t.lease) throw new Error('no lease');
    await c.release(t.lease, true);
    expect(await c.setBytes(0, day, before.gen)).toBeNull(); // refused: the caller lists again
    expect(await c.bytesToday(day)).toBe(100); // the landing's charge stands
    const now = await c.generation();
    expect(now.gen).toBe(before.gen + 1);
    expect(await c.setBytes(100, day, now.gen)).toBe(100); // a listing that saw it commits
    // a removal crosses a listing too
    const g = (await c.generation()).gen;
    await c.give('vault', 100, day, 'k:v:9');
    expect(await c.setBytes(100, day, g)).toBeNull();
    expect(await c.bytesToday(day)).toBe(0);
    // and a day's first take with a crossed listing is told to list again
    const g2 = (await c.generation()).gen;
    await c.give('vault', 0, '2026-10-05', 'k:v:10');
    expect(await c.take('vault', 1, 1000, '2026-10-05', 0, Date.now(), g2)).toEqual({ recount: true });
    expect(await c.take('vault', 1, 1000, '2026-10-05', 0, Date.now(), g2 + 1)).toMatchObject({ ok: true, before: 0 });
  });
  it('generation() says when the vault was last put right from a listing', async () => {
    const { c } = make();
    expect(await c.generation()).toEqual({ gen: 0, at: null });
    await c.setBytes(5, '2026-10-04', null, 1234);
    expect(await c.generation()).toEqual({ gen: 0, at: 1234 });
  });
  it("a photograph's name is held by one request at a time, for at most a minute; an upload's claim is kept two days (round sixty; A12, B5)", async () => {
    const { c, storage } = make();
    const t0 = Date.UTC(2026, 9, 4, 12);
    const name = 'vault/X/photo/p000001.bin';
    const a = await c.hold(name, t0);
    if (!a.ok) throw new Error('not held');
    expect(a.claimed).toBeNull();
    expect(await c.hold(name, t0 + 1000)).toEqual({ ok: false, retryAfter: 59 });
    await c.unhold(name, 'not-the-token', true, t0 + 2000); // another's token frees nothing
    expect((await c.hold(name, t0 + 3000)).ok).toBe(false);
    await c.unhold(name, a.token, true, t0 + 4000); // an upload that stored it: its claim is kept
    const b = await c.hold(name, t0 + 5000);
    expect(b).toMatchObject({ ok: true, claimed: t0 + 4000 });
    // a holder that died: the name frees itself after HOLD_MS
    expect((await c.hold(name, t0 + 5000 + HOLD_MS)).ok).toBe(true);
    // the claim is swept with the day keys, after two days
    expect(await c.sweep(t0 + 86_400_000)).not.toContain(`c:${name}`);
    expect(await c.sweep(Date.UTC(2026, 9, 6))).toContain(`c:${name}`);
    expect(storage.m.has(`c:${name}`)).toBe(false);
  });
  it("the vaults it counts stop at the ceiling: the object's storage is bounded by SYNC_VAULTS_MAX (the server review, checked)", async () => {
    const { c, storage } = make();
    for (let i = 0; i < 50; i++) await c.fill(`V${i}`, 10, 0, '2026-10-04', 1000);
    expect([...storage.m.keys()].filter((k) => k.startsWith('f:')).length).toBe(10);
  });
});
