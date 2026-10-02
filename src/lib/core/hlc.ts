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

/** Past this, the device clock is taken as wrong and the server's `Date` stands in for it; under it, the device clock is left alone, since a few seconds either way change nothing and a jittering offset would. */
export const TRUST_SERVER_PAST_MS = 30_000;
/** A correction this large is taken only when two readings in a row agree on it: one wrong `Date` (a captive portal, a proxy) must not move a device's stamps by years (round fifty-one, 1). */
export const TRUST_SERVER_TWICE_PAST_MS = 2 * 86_400_000;
/** Where the correction is kept between loads, so the first edit of a tab is stamped right, not only the ones after its first pull (round fifty-one, 1). */
const OFFSET_KEY = 'cultifolio.clockOffsetMs';
let offsetMs = readStoredOffset();
/** A large correction seen once, waiting for a second reading that agrees. */
let pendingMs: number | null = null;
function readStoredOffset(): number {
  try {
    const v = typeof localStorage !== 'undefined' ? Number(localStorage.getItem(OFFSET_KEY)) : 0;
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}
function storeOffset(ms: number): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (ms) localStorage.setItem(OFFSET_KEY, String(ms));
    else localStorage.removeItem(OFFSET_KEY);
  } catch {
    /* storage refused: the offset lives for this load */
  }
}
/**
 * The time changes are stamped, event dates are read from, and holds are judged by: the device clock, corrected by the
 * server's when they disagree by more than half a minute (round forty-nine, 1). A device set to 2031 stamped every
 * change six years ahead, and every other device held them all until then; and the hold itself was judged against
 * that same wrong clock, so the device that was wrong saw nothing wrong. The server's `Date` header is read on every
 * sync; a device that never syncs keeps its own clock, which is all it has. The correction is kept across loads.
 */
export const nowMs = () => Date.now() + offsetMs;
/**
 * Fold in the server's time (ms since the epoch) as read at `localMs`. The offset moves only past the threshold and is
 * dropped once the clocks agree to within half of it (no flapping at the edge); a correction of days or more is taken
 * only when a second reading agrees with the first to within the threshold. Returns the offset in force.
 */
export function trustServerTime(serverMs: number, localMs = Date.now()): number {
  if (!Number.isFinite(serverMs) || serverMs <= 0) return offsetMs;
  const delta = serverMs - localMs;
  const far = Math.abs(delta) > TRUST_SERVER_PAST_MS;
  const agree = Math.abs(delta) <= TRUST_SERVER_PAST_MS / 2;
  let next = offsetMs;
  if (agree) next = 0;
  else if (far || offsetMs !== 0) {
    if (Math.abs(delta - offsetMs) <= TRUST_SERVER_PAST_MS) next = offsetMs; // the same correction as before, give or take the threshold: no jitter
    else if (Math.abs(delta) > TRUST_SERVER_TWICE_PAST_MS && (pendingMs === null || Math.abs(delta - pendingMs) > TRUST_SERVER_PAST_MS)) { pendingMs = delta; return offsetMs; }
    else next = delta;
  }
  pendingMs = null;
  if (next !== offsetMs) { offsetMs = next; storeOffset(next); }
  return offsetMs;
}
/** The current correction, for the clock warning to say how far off the device is. */
export const clockOffsetMs = () => offsetMs;
/** Tests only. */
export const _resetClockOffset = () => { offsetMs = 0; pendingMs = null; storeOffset(0); };

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
    private readonly now: () => number = nowMs
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
  /** Fold in a timestamp seen from another device so our next tick sorts after it. A stamp far ahead of real time is not followed, this device's own included: following one would keep every later stamp from here a year ahead, and every other device would hold them all until then. An edit to a field whose current stamp is ahead of the clock is stamped just past that one stamp instead (`hlcAfter`, used by the store), so it wins the field without moving the clock. */
  observe(remote: string): void {
    const r = hlcDecode(remote);
    const phys = this.now();
    if (r.wall > phys + MAX_AHEAD_MS) return;
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

/** The stamp just past `prev`, as `device`: for one field whose current stamp is ahead of the clock. Unique, since no writer but `device` stamps with that tag and `device`'s own clock never reached that wall. */
export function hlcAfter(prev: string, device: string): string {
  const p = hlcDecode(prev);
  return hlcEncode(p.count >= MAX_COUNT ? { wall: p.wall + 1, count: 0, device } : { wall: p.wall, count: p.count + 1, device });
}

/** The stamp one millisecond before `next`, as `device`: for a machine-made change that must rank below every change a person made to the record (round forty-nine, 1). Unique while `device` is a per-tab writer that stamps nothing else there; the store's collision rule moves it by a count if it is not. */
export function hlcBefore(next: string, device: string): string {
  const n = hlcDecode(next);
  return hlcEncode({ wall: Math.max(0, n.wall - 1), count: 0, device });
}
