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
    async list<T>(o: { prefix: string }): Promise<Map<string, T>> {
      return new Map([...m].filter(([k]) => k.startsWith(o.prefix)) as [string, T][]);
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
    expect(storage.m.get('all')).toBe(5);
    await c.refund('a', '2026-09-25');
    expect(await c.create('a', '2026-09-25', 5, 200, 2000, 0)).toBe('ok');
    expect(storage.m.get('all')).toBe(5);
    await c.create('c', '2026-09-25', 5, 200, 2000, 0);
    await c.refund('c', '2026-09-25'); // an address refunded to zero is not counted among the addresses (round twenty-four, 6)
    expect((await c.totals('2026-09-25')).addresses).toBe(1);
    expect(await c.create('b', '2026-09-25', 5, 5, 2000, 0)).toBe('day');
    expect(await c.create('b', '2026-09-25', 5, 200, 5, 0)).toBe('total');
  });
  it('a seed that could not be read does not become zero: the object waits until it can be seeded, then takes the count once (round twenty-three, 6)', async () => {
    const { c, storage } = make();
    expect(await c.create('a', '2026-09-25', 5, 200, 200, null)).toBe('unavailable');
    expect(storage.m.has('all')).toBe(false);
    expect(await c.create('a', '2026-09-25', 5, 200, 200, 199)).toBe('ok');
    expect(storage.m.get('all')).toBe(200);
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
    expect(storage.m.get('all')).toBe(1); // the total stays
    await c.tick(Date.UTC(2026, 8, 27, 0, 0, 1));
    expect(storage.alarmAt()).toBe(Date.UTC(2026, 8, 28));
  });
});
