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
/** A correction this large is taken only when two readings from two sync runs, at least a minute apart, agree on it: one wrong `Date` (an intercepting proxy) must not move a device's stamps by years (round fifty-one, 1; round fifty-two, 1). */
export const TRUST_SERVER_TWICE_PAST_MS = 2 * 86_400_000;
/** The two readings a large correction needs must be this far apart: two pages of one pull are one reading (round fifty-two, 1). */
export const TRUST_AGREE_GAP_MS = 60_000;
/** And agree to within this: a device whose clock also drifts a little between the two readings still gets its correction, while one wrong answer (off by hours or days) never agrees with a right one. */
export const TRUST_AGREE_TOL_MS = 5 * 60_000;
/** A correction not confirmed by a reading for this long is dropped: a device that stopped syncing with a correction in force would otherwise stamp by it for good, long after its clock was set right (round fifty-two, 1). */
export const TRUST_EXPIRES_MS = 7 * 86_400_000;
/** Where the correction is kept between loads, so the first edit of a tab is stamped right, not only the ones after its first pull (round fifty-one, 1). The pending reading is kept too, so one sync per page load still gets a device corrected (round fifty-two, 1). */
const OFFSET_KEY = 'cultifolio.clockOffsetMs';
const PENDING_KEY = 'cultifolio.clockPending';
type Stored = { offset: number; confirmedAt: number };
let offsetMs = 0;
/** When a reading last confirmed the offset in force, by the device clock. */
let confirmedAt = 0;
/** A large correction seen once, waiting for a second reading that agrees, and when it was seen (device clock). */
let pending: { delta: number; at: number } | null = null;
const listeners = new Set<(offset: number) => void>();
function readStored(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(OFFSET_KEY);
    if (raw) {
      const v = JSON.parse(raw) as Stored;
      if (Number.isFinite(v.offset) && v.confirmedAt && trustedAge(Date.now() - v.confirmedAt)) { offsetMs = v.offset; confirmedAt = v.confirmedAt; }
      else localStorage.removeItem(OFFSET_KEY);
    }
    const p = localStorage.getItem(PENDING_KEY);
    if (p) { const v = JSON.parse(p) as { delta: number; at: number }; if (Number.isFinite(v.delta) && Date.now() - v.at < TRUST_EXPIRES_MS) pending = v; else localStorage.removeItem(PENDING_KEY); }
  } catch {
    /* storage refused or unreadable: no correction */
  }
}
function store(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    // Kept whenever a reading confirmed the clock, a correction of nothing included: whether the clock in force is a
    // checked one decides whether a park judged by it is kept (round fifty-nine).
    if (confirmedAt) localStorage.setItem(OFFSET_KEY, JSON.stringify({ offset: offsetMs, confirmedAt } satisfies Stored));
    else localStorage.removeItem(OFFSET_KEY);
    if (pending) localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    /* storage refused: the offset lives for this load */
  }
}
readStored();
// Another tab's correction reaches this one: a tab already open went on stamping by the old offset until its own next sync (round fifty-two, 1).
try {
  if (typeof addEventListener !== 'undefined' && typeof localStorage !== 'undefined') addEventListener('storage', (e) => { if ((e as StorageEvent).key === OFFSET_KEY || (e as StorageEvent).key === PENDING_KEY) { const was = offsetMs; offsetMs = 0; pending = null; readStored(); if (offsetMs !== was) for (const l of listeners) l(offsetMs); } });
} catch {
  /* no window */
}
/**
 * The time changes are stamped, event dates are read from, and holds are judged by: the device clock, corrected by the
 * server's when they disagree by more than half a minute (round forty-nine, 1). A device set to 2031 stamped every
 * change six years ahead, and every other device held them all until then; and the hold itself was judged against
 * that same wrong clock, so the device that was wrong saw nothing wrong. The server's `Date` header is read on every
 * sync; a device that never syncs keeps its own clock, which is all it has. The correction is kept across loads.
 */
export const nowMs = () => Date.now() + offsetMs;
/** Called when the correction changes (a reading here, or another tab's): the clock that mints stamps restarts from the corrected time. */
export function onClockOffsetChange(l: (offset: number) => void): () => void {
  listeners.add(l);
  return () => void listeners.delete(l);
}
/**
 * Fold in the server's time (ms since the epoch) as read at `localMs`, once per sync run. The offset moves only past the
 * threshold and is dropped once the clocks agree to within half of it (no flapping at the edge); a correction of days
 * or more is taken only when a second reading, at least a minute after the first, agrees with it to within the
 * threshold. Returns the offset in force.
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
    else if (Math.abs(delta) > TRUST_SERVER_TWICE_PAST_MS) {
      const seen = pending;
      if (!seen || Math.abs(delta - seen.delta) > TRUST_AGREE_TOL_MS) { pending = { delta, at: localMs }; store(); return offsetMs; } // a first reading of a large correction, or one that disagrees with the last: wait
      if (localMs - seen.at < TRUST_AGREE_GAP_MS) return offsetMs; // the same run, or one straight after: not a second reading yet
      next = delta;
    } else next = delta;
  }
  pending = null;
  const wasChecked = clockChecked();
  confirmedAt = localMs;
  const was = offsetMs;
  offsetMs = next;
  store();
  // A clock confirmed for the first time is told too: what the fold held or folded against an unchecked clock is
  // judged again, so a change far ahead of a clock now known to be right is parked (round fifty-nine).
  if (next !== was || !wasChecked) for (const l of listeners) l(offsetMs);
  return offsetMs;
}
/**
 * Whether a server reading has confirmed the clock in force (`nowMs`) within the time a correction is kept: only then
 * is a change judged by this clock alone stored as parked (round fifty-nine; the round forty-one review, 1). A device
 * that never syncs has no such reading, and its own clock decides nothing that is kept.
 */
export function clockChecked(): boolean {
  return confirmedAt > 0 && trustedAge(Date.now() - confirmedAt);
}
/**
 * Whether a server reading this old still confirms the clock. Never one dated after now: the clock was set back since,
 * and the old reading confirmed a clock that is no longer in force. A negative age passed "less than seven days" and
 * the device parked its own plants by the wrong clock, for good (round sixty; three reviews). Five minutes of slack
 * cover the reading's own rounding and a clock nudged back by a time sync, as a set-back of hours or days is not.
 */
function trustedAge(age: number): boolean {
  return age > -5 * 60_000 && age < TRUST_EXPIRES_MS;
}
/** The current correction, for the clock warning to say how far off the device is. */
export const clockOffsetMs = () => offsetMs;
/** Stop syncing: no server to confirm a correction against, so none is kept (round fifty-two, 1). */
export function clearClockOffset(): void {
  const was = offsetMs;
  offsetMs = 0;
  pending = null;
  confirmedAt = 0;
  store();
  if (was) for (const l of listeners) l(0);
}
/** Tests only. */
export const _resetClockOffset = () => { clearClockOffset(); };

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
    // A clock that ticked while the device was a year fast carried that wall forward after the correction, so every
    // later stamp was still a year ahead and held everywhere: once the corrected time is far behind the last stamp, the
    // clock restarts from it (round fifty-two, 1). Monotonic against a clock stepping back by less than the window.
    if (this.last.wall > wall + MAX_AHEAD_MS) this.last = { wall: 0, count: 0, device: this.device };
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
