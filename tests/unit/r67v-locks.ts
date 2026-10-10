/**
 * Round sixty-seven, agent V: a small Web Locks stand-in for the example's tests, with shared and exclusive modes,
 * `ifAvailable`, and a queue (an exclusive request waits until every holder lets go), as a browser's lock manager has.
 */
type Mode = 'shared' | 'exclusive';
type Cb = (lock: unknown) => unknown;
export class Locks {
  held = new Map<string, { mode: Mode; n: number }>();
  private waiting = new Map<string, Array<() => void>>();
  async request(name: string, a: unknown, b?: unknown): Promise<unknown> {
    const opts = (typeof a === 'function' ? {} : a) as { mode?: Mode; ifAvailable?: boolean };
    const cb = (typeof a === 'function' ? a : b) as Cb;
    const mode = opts.mode ?? 'exclusive';
    const free = () => { const h = this.held.get(name); return !h || (mode === 'shared' && h.mode === 'shared'); };
    if (!free()) {
      if (opts.ifAvailable) return cb(null);
      await new Promise<void>((go) => {
        const wait = () => { const q = this.waiting.get(name) ?? []; q.push(tryGo); this.waiting.set(name, q); };
        const tryGo = () => { if (free()) go(); else wait(); };
        wait();
      });
    }
    const h = this.held.get(name);
    this.held.set(name, { mode, n: (h?.n ?? 0) + 1 });
    try {
      return await cb({ name, mode });
    } finally {
      const now = this.held.get(name)!;
      if (now.n > 1) now.n--;
      else {
        this.held.delete(name);
        const q = this.waiting.get(name) ?? [];
        this.waiting.set(name, []);
        for (const f of q) f();
      }
    }
  }
}
