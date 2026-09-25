/**
 * Hybrid logical clock. Every change in the log carries one, so two devices
 * that edit the same field while offline resolve the same way on both, and a
 * device whose wall clock is wrong cannot rewrite history.
 *
 * Encoded as a sortable string: 13-digit ms wall time, hex counter (four
 * digits, more only past 0xffff), device id. Compare with hlcCompare(), not
 * `<`: a counter that has grown a digit sorts after a shorter one.
 */

export interface Hlc {
  wall: number;
  count: number;
  device: string;
}

/** How far ahead of this device's own clock a peer's timestamp may be before it is ignored. A phone set to 2031 must not become every device's clock. */
export const MAX_AHEAD_MS = 5 * 60_000;
/** The counter's ceiling (six hex digits); past it the wall time takes a millisecond. */
export const MAX_COUNT = 0xffffff;

const HLC_RE = /^(\d{13})-([0-9a-f]{4,6})-([a-z0-9]{1,16})$/;

export const isHlc = (s: string) => HLC_RE.test(s);

export function hlcEncode(h: Hlc): string {
  return `${String(h.wall).padStart(13, '0')}-${h.count.toString(16).padStart(4, '0')}-${h.device}`;
}

export function hlcDecode(s: string): Hlc {
  const m = HLC_RE.exec(s);
  if (!m) throw new Error(`bad hlc: ${s}`);
  return { wall: Number(m[1]), count: parseInt(m[2], 16), device: m[3] };
}

/** Wall, then counter by value (a longer counter is a bigger one: it only grows past ffff), then device. */
export function hlcCompare(a: string, b: string): number {
  if (a === b) return 0;
  const wa = a.slice(0, 13), wb = b.slice(0, 13);
  if (wa !== wb) return wa < wb ? -1 : 1;
  const ea = a.indexOf('-', 14), eb = b.indexOf('-', 14);
  if (ea !== eb) return ea < eb ? -1 : 1;
  const ca = a.slice(14, ea), cb = b.slice(14, eb);
  if (ca !== cb) return ca < cb ? -1 : 1;
  return a < b ? -1 : 1;
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
    else this.last = this.bump(this.last.wall, this.last.count);
    return hlcEncode(this.last);
  }
  /** Fold in a timestamp seen from another device so our next tick sorts after it. A peer far ahead of real time is not followed: we keep our own wall and count past it. This device's own stamps are always followed, however far ahead: they were made here while the clock was wrong, and an edit made after the clock is put right must still sort after them, or it loses to the older value. */
  observe(remote: string): void {
    const r = hlcDecode(remote);
    const phys = this.now();
    if (r.device !== this.device && r.wall > phys + MAX_AHEAD_MS) return;
    const wall = Math.max(phys, this.last.wall, r.wall);
    if (wall === this.last.wall && wall === r.wall) this.last = this.bump(wall, Math.max(this.last.count, r.count));
    else if (wall === r.wall) this.last = this.bump(wall, r.count);
    else if (wall === this.last.wall) this.last = this.bump(wall, this.last.count);
    else this.last = { wall, count: 0, device: this.device };
  }
  private bump(wall: number, count: number): Hlc {
    return count >= MAX_COUNT ? { wall: wall + 1, count: 0, device: this.device } : { wall, count: count + 1, device: this.device };
  }
}
