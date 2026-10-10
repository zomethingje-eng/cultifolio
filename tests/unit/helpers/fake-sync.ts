/**
 * Stand-ins for the sync server's bindings, shared by the round-sixty server tests: an R2 bucket that answers as R2 does
 * (the etag is the MD5 of the bytes, `uploaded` and `version` are each put's own, so the same bytes uploaded again are a
 * new object), a KV namespace, and the real `Counters` class, one per name, its calls queued one at a time as a Durable
 * Object's are. Hooks let a test order the bucket's calls.
 */
import { createHash, randomUUID } from 'node:crypto';
import { Counters } from '$lib/server/counters';
import type { CountersNs } from '$lib/server/sync';

const tick = () => new Promise((r) => setTimeout(r, Math.random() * 3));
let clock = Date.UTC(2026, 9, 4, 12);

export type FakeObject = { body: Uint8Array; size: number; md: Record<string, string>; etag: string; uploaded: Date; version: string };
export function fakeR2() {
  const objs = new Map<string, FakeObject>();
  const hooks: { beforeDelete?: (k: string) => Promise<void>; afterHead?: (k: string) => Promise<void>; beforePut?: (k: string) => Promise<void> } = {};
  let lists = 0;
  return {
    objs,
    hooks,
    lists: () => lists,
    async put(key: string, body: Uint8Array | string, o?: { customMetadata?: Record<string, string>; onlyIf?: { etagDoesNotMatch?: string } }) {
      await hooks.beforePut?.(key);
      await tick();
      if (o?.onlyIf?.etagDoesNotMatch === '*' && objs.has(key)) return null;
      const b = typeof body === 'string' ? new TextEncoder().encode(body) : body;
      objs.set(key, { body: b, size: b.length, md: o?.customMetadata ?? {}, etag: createHash('md5').update(b).digest('hex'), uploaded: new Date(clock++), version: randomUUID() });
      return { key };
    },
    async head(key: string) {
      await tick();
      const o = objs.get(key);
      const r = o ? { size: o.size, customMetadata: o.md, etag: o.etag, uploaded: o.uploaded, version: o.version } : null;
      await hooks.afterHead?.(key);
      return r;
    },
    async get(key: string) {
      await tick();
      const o = objs.get(key);
      return o ? { json: async () => JSON.parse(new TextDecoder().decode(o.body)), text: async () => new TextDecoder().decode(o.body), etag: o.etag } : null;
    },
    async delete(key: string) {
      await hooks.beforeDelete?.(key);
      await tick();
      objs.delete(key);
    },
    // As R2 lists (round sixty-seven; triage-66 S4, IND-8): at most `limit` keys (1,000 when none is given), in key order,
    // `truncated` when more follow, and a cursor (here, the last key given) that the next call continues after. It
    // sliced at the limit and always said `truncated: false`, so a caller that ignored `truncated` passed every test.
    async list(o: { prefix: string; limit?: number; cursor?: string }) {
      lists++;
      await tick();
      const all = [...objs.keys()].filter((k) => k.startsWith(o.prefix) && (!o.cursor || k > o.cursor)).sort();
      const keys = all.slice(0, Math.min(o.limit ?? 1000, 1000));
      const truncated = all.length > keys.length;
      return { objects: keys.map((k) => ({ key: k, size: objs.get(k)!.size, uploaded: objs.get(k)!.uploaded })), truncated, ...(truncated ? { cursor: keys[keys.length - 1] } : {}) };
    }
  };
}
export type FakeR2 = ReturnType<typeof fakeR2>;

export function fakeKV() {
  const m = new Map<string, string>();
  return {
    m,
    async get(k: string, t?: string) {
      const v = m.get(k) ?? null;
      return t === 'json' && v ? JSON.parse(v) : v;
    },
    async put(k: string, v: string) {
      m.set(k, v);
    }
  };
}

/** The real counter class per name; each object takes one call at a time. `objects` gives a test its storage. */
export function countersNs() {
  const objects = new Map<string, { c: Counters; m: Map<string, unknown>; queue: Promise<unknown> }>();
  const storageOf = (m: Map<string, unknown>) => ({
    async get(keys: string[]) { return new Map(keys.filter((k) => m.has(k)).map((k) => [k, m.get(k)])); },
    async put(e: Record<string, unknown>) { for (const [k, v] of Object.entries(e)) m.set(k, v); },
    async list(o: { prefix?: string; limit?: number } = {}) { return new Map([...m].filter(([k]) => k.startsWith(o.prefix ?? '')).slice(0, o.limit ?? Infinity)); },
    async delete(keys: string | string[]) { for (const k of typeof keys === 'string' ? [keys] : keys) m.delete(k); },
    async getAlarm() { return null; },
    async setAlarm() {}
  });
  const ensure = (name: string) => {
    let o = objects.get(name);
    if (!o) {
      const m = new Map<string, unknown>();
      o = { c: new Counters({ storage: storageOf(m) } as never, {} as never), m, queue: Promise.resolve() };
      objects.set(name, o);
    }
    return o;
  };
  const ns = {
    objects,
    /** The object of a name, created if need be (to replace one of its methods before a test runs). */
    raw: (name: string) => ensure(name),
    idFromName: (n: string) => n,
    get(name: string) {
      const one = ensure(name);
      return new Proxy({}, {
        get: (_, method: string) => (...args: unknown[]) => {
          const p = one.queue.then(() => (one.c as unknown as Record<string, (...a: unknown[]) => unknown>)[method](...args));
          one.queue = p.catch(() => {});
          return p;
        }
      }) as unknown as Counters;
    }
  };
  return ns as typeof ns & CountersNs;
}
