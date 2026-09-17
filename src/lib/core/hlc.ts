/**
 * Hybrid logical clock. Every change in the log carries one, so two devices
 * that edit the same field while offline resolve the same way on both, and a
 * device whose wall clock is wrong cannot rewrite history.
 *
 * Encoded as a sortable string: 13-digit ms wall time, 4-hex counter, device id.
 */

export interface Hlc {
  wall: number;
  count: number;
  device: string;
}

export function hlcEncode(h: Hlc): string {
  return `${String(h.wall).padStart(13, '0')}-${h.count.toString(16).padStart(4, '0')}-${h.device}`;
}

export function hlcDecode(s: string): Hlc {
  const m = /^(\d{13})-([0-9a-f]{4})-(.+)$/.exec(s);
  if (!m) throw new Error(`bad hlc: ${s}`);
  return { wall: Number(m[1]), count: parseInt(m[2], 16), device: m[3] };
}

export function hlcCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export class Clock {
  private last: Hlc;
  constructor(
    public readonly device: string,
    private readonly now: () => number = () => Date.now()
  ) {
    this.last = { wall: 0, count: 0, device };
  }
  /** Next local timestamp: monotonic even if the wall clock steps backwards. */
  tick(): string {
    const wall = this.now();
    if (wall > this.last.wall) this.last = { wall, count: 0, device: this.device };
    else this.last = { wall: this.last.wall, count: this.last.count + 1, device: this.device };
    return hlcEncode(this.last);
  }
  /** Fold in a timestamp seen from another device so our next tick sorts after it. */
  observe(remote: string): void {
    const r = hlcDecode(remote);
    const wall = Math.max(this.now(), this.last.wall, r.wall);
    if (wall === this.last.wall && wall === r.wall)
      this.last = { wall, count: Math.max(this.last.count, r.count) + 1, device: this.device };
    else if (wall === r.wall) this.last = { wall, count: r.count + 1, device: this.device };
    else if (wall === this.last.wall) this.last = { ...this.last, count: this.last.count + 1 };
    else this.last = { wall, count: 0, device: this.device };
  }
}
