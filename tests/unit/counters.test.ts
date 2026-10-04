/**
 * The real `Counters` Durable Object class against a fake storage with the object's own contract (get/put/list/delete,
 * getAlarm/setAlarm): the ceilings, the refund, the seed, and the sweep at midnight (round twenty-three, 6 and 8).
 */
import { describe, it, expect } from 'vitest';
import { Counters, nextMidnight } from '$lib/server/counters';

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
    async delete(keys: string[]) {
      for (const k of keys) m.delete(k);
    },
    async getAlarm() {
      return alarm;
    },
    async setAlarm(t: number) {
      alarm = t;
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
    for (let i = 0; i < 5; i++) await c.fill(0);
    expect(storage.m.get('all')).toBe(5);
    await c.refund('a', '2026-09-25');
    expect(await c.create('a', '2026-09-25', 5, 200, 2000, 0)).toBe('ok');
    expect(storage.m.get('all')).toBe(5); // a refund gives back the address's and the day's counts, never the total's
    await c.create('c', '2026-09-25', 5, 200, 2000, 0);
    await c.refund('c', '2026-09-25'); // an address refunded to zero is not counted among the addresses (round twenty-four, 6)
    expect((await c.totals('2026-09-25')).addresses).toBe(1);
    expect(await c.create('b', '2026-09-25', 5, 5, 2000, 0)).toBe('day');
    expect(await c.create('b', '2026-09-25', 5, 200, 5, 0)).toBe('total');
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
    expect(await c.fill(null)).toBe(200);
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
    // the alarm at the midnight starting the 27th drops it: 47 h 59 m 30 s after it was written
    expect(await c.sweep(Date.UTC(2026, 8, 27))).toEqual(['ip:a:2026-09-25', 'day:2026-09-25']);
    expect(storage.m.get('all')).toBe(0); // the total stays
    await c.tick(Date.UTC(2026, 8, 27, 0, 0, 1));
    expect(storage.alarmAt()).toBe(Date.UTC(2026, 8, 28));
  });
  it('the byte totals: a vault\'s is put right by a listing each day and taken in one step; an address\'s is per day and swept (round fifty-eight)', async () => {
    const v = make();
    expect(await v.c.take('vault', 10, 100, '2026-09-25')).toEqual({ recount: true });
    expect(await v.c.take('vault', 10, 100, '2026-09-25', 85)).toEqual({ ok: true, before: 85 });
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
});
