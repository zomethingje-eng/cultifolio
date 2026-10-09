/**
 * Round sixty-three, agent S: the counter objects with the bucket bound, as production binds it (`env.STORE`), so the
 * vault object's own sweep of unnamed photograph generations can read and delete in it. Each object's storage is the
 * transactional stand-in of round sixty-two (`txStorage`), its alarm kept, and its calls queued one at a time as a
 * Durable Object's are. `raw(name)` gives a test the object itself (to run its alarm) and its storage.
 */
import { Counters } from '$lib/server/counters';
import type { CountersNs } from '$lib/server/sync';
import { txStorage } from './r62s-fake';

export function countersWithStore(r2: unknown) {
  const objects = new Map<string, { c: Counters; s: ReturnType<typeof txStorage>; queue: Promise<unknown> }>();
  const ensure = (name: string) => {
    let o = objects.get(name);
    if (!o) {
      const s = txStorage();
      o = { c: new Counters({ storage: s } as never, { STORE: r2 } as never), s, queue: Promise.resolve() };
      objects.set(name, o);
    }
    return o;
  };
  const ns = {
    objects,
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
