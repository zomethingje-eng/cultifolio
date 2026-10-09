/**
 * Round sixty-two, agent S: stand-ins the shared fakes do not give.
 *
 * `txStorage`: a Durable Object storage whose `transaction` commits whole or not at all (a throw inside it puts every key
 * back as it was), with a fault a test can arm on any write, so a crash between two writes can be staged.
 *
 * `casR2`: the shared fake bucket with R2's conditional put (`onlyIf.etagMatches`), which the photograph's pointer is
 * written under, and a `get` that carries the etag as R2's does.
 */
import { pagedStorage } from './r61s-fake';
import { fakeR2 } from './fake-sync';

export type Fault = (op: 'put' | 'delete', keys: string[], entries?: Record<string, unknown>) => boolean;

export function txStorage() {
  const s = pagedStorage();
  let fault: Fault | null = null;
  const check = (op: 'put' | 'delete', keys: string[], entries?: Record<string, unknown>) => {
    if (fault?.(op, keys, entries)) throw new Error(`storage: injected failure on ${op} ${keys.join(',')}`);
  };
  const put = s.put.bind(s);
  const del = s.delete.bind(s);
  s.put = async (e: Record<string, unknown>) => { check('put', Object.keys(e), e); await put(e); };
  s.delete = async (keys: string | string[]) => { check('delete', typeof keys === 'string' ? [keys] : keys); await del(keys); };
  let transactions = 0;
  return Object.assign(s, {
    /** Fail every write the predicate picks, until it is cleared with null. */
    arm(f: Fault | null) { fault = f; },
    transactions: () => transactions,
    async transaction<T>(fn: (txn: typeof s) => Promise<T>): Promise<T> {
      transactions++;
      const before = new Map(s.m);
      try {
        return await fn(s);
      } catch (e) {
        s.m.clear();
        for (const [k, v] of before) s.m.set(k, v);
        throw e;
      }
    }
  });
}

export function casR2() {
  const r2 = fakeR2();
  const put = r2.put.bind(r2);
  // One write at a time per key, so the condition and the write are one step, as R2 makes them.
  const locks = new Map<string, Promise<unknown>>();
  const cas: { before?: (key: string) => Promise<void> } = {};
  r2.put = (async (key: string, body: Uint8Array | string, o?: { customMetadata?: Record<string, string>; onlyIf?: { etagDoesNotMatch?: string; etagMatches?: string } }) => {
    // A conditional write that stalls on its way to the bucket: its condition was read before, and is judged when it lands.
    if (o?.onlyIf) await cas.before?.(key);
    const prev = locks.get(key) ?? Promise.resolve();
    let done!: () => void;
    const mine = new Promise<void>((r) => (done = r));
    locks.set(key, prev.then(() => mine));
    await prev;
    try {
      const want = o?.onlyIf?.etagMatches;
      if (want != null && r2.objs.get(key)?.etag !== want) return null;
      return await put(key, body, o);
    } finally {
      done();
    }
  }) as typeof r2.put;
  return Object.assign(r2, { cas });
}
