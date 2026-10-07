/**
 * Round sixty-one, agent S: stand-ins the shared `fake-sync.ts` does not give. A KV namespace with `delete` (the KV
 * fallback gives a vault's own place key back), and a Durable Object storage whose `list` honours `startAfter` and
 * `limit` in key order and counts its calls, as the real storage does, for the paged sweep.
 */
import { fakeKV } from './fake-sync';

export function fakeKVd() {
  const kv = fakeKV();
  return Object.assign(kv, { async delete(k: string) { kv.m.delete(k); } });
}

export function pagedStorage() {
  const m = new Map<string, unknown>();
  let alarm: number | null = null;
  const lists: Array<{ prefix?: string; limit?: number; startAfter?: string }> = [];
  return {
    m,
    lists,
    alarmAt: () => alarm,
    fired: () => { alarm = null; },
    async get(keys: string[]) { return new Map(keys.filter((k) => m.has(k)).map((k) => [k, m.get(k)])); },
    async put(e: Record<string, unknown>) { for (const [k, v] of Object.entries(e)) m.set(k, v); },
    async list(o: { prefix?: string; limit?: number; startAfter?: string } = {}) {
      lists.push(o);
      const keys = [...m.keys()].filter((k) => k.startsWith(o.prefix ?? '') && (o.startAfter == null || k > o.startAfter)).sort();
      return new Map(keys.slice(0, o.limit ?? Infinity).map((k) => [k, m.get(k)]));
    },
    async delete(keys: string | string[]) { for (const k of typeof keys === 'string' ? [keys] : keys) m.delete(k); },
    async getAlarm() { return alarm; },
    async setAlarm(t: number) { alarm = t; }
  };
}
