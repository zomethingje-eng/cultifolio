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
/**
 * A correction not confirmed by a reading for this long no longer counts as confirmed (`clockChecked`): a park judged by
 * it alone is not made. The correction itself stays in force (round sixty-two; the clock review's 4 and 5, the outside
 * reviews' A17 and B9): no amount of elapsed time makes a correction wrong, since a slow clock does not catch up by
 * waiting, and dropping it put a device ten minutes slow on two clocks by turns and refolded the log at each turn.
 */
export const TRUST_EXPIRES_MS = 7 * 86_400_000;
/** Where the correction is kept between loads, so the first edit of a tab is stamped right, not only the ones after its first pull (round fifty-one, 1). The pending reading is kept too, so one sync per page load still gets a device corrected (round fifty-two, 1). */
const OFFSET_KEY = 'cultifolio.clockOffsetMs';
const PENDING_KEY = 'cultifolio.clockPending';
/** `serverAt`: the server's time when the reading was taken (round sixty-one); older records have none, and it is then read as `confirmedAt + offset`, which is what it was to within the reading's own rounding. */
/**
 * `jumped` and `unsure`: see the variables of those names (round sixty-two, second pass; the data review's 1 and 2). A
 * record with `confirmedAt` 0 is a correction in force that no reading confirms now (one large reading disagreed with
 * it): it is kept, so every tab and the next load stamp alike until a second reading decides (the data review's 3).
 */
type Stored = { offset: number; confirmedAt: number; serverAt?: number; jumped?: number; unsure?: boolean };
let offsetMs = 0;
/** When a reading last confirmed the offset in force, by the device clock (moved with the device clock when this tab follows a change of it). */
let confirmedAt = 0;
/** The server's time when that reading was taken (round sixty-one; the clock review's 7). */
let serverAt = 0;
/**
 * The device clock and a monotonic clock (`performance.now()`) read together when this tab took, learned or last
 * followed the correction (round sixty-one; the clock review's 7). The two move apart only when the device clock is moved
 * (set by hand, a time sync) or when the monotonic clock stops while the device sleeps (some platforms pause it). Within
 * this tab only: another tab has its own.
 */
let mono: { dev: number; perf: number } | null = null;
/**
 * Whether the correction in force is unconfirmed: kept from storage at this load, or kept across a move of the device
 * clock this tab could not account for, and not yet met by a reading here (round sixty-two; the clock review's 4 and 5).
 *
 * What it does, and all it does: the engine is asked for a reading at once (`onReadingWanted`), and the next reading
 * either confirms the correction (it agrees within the half minute: nothing is refolded) or replaces it (one refold).
 * It changes nothing else. Stamps and local dates are still read from the correction in force (`nowMs`); the hold and
 * the far-ahead rules are judged by that same clock; whether a park judged by the clock alone is made is still
 * `clockChecked()` (a reading under a week old, not dated after the clock), which being unconfirmed does not change.
 * This device's own edits are never held or parked by its own clock, confirmed or not (`isParked`, `isHeld` in log.ts).
 */
let unsure = false;
/**
 * The moves forward of the device clock the correction was kept across since the last reading (sleeps, or the clock set
 * forward), summed, in ms: a move back undoes them first, as far as they go (`follow`). Kept with the correction in
 * storage, so a reload and every other tab undo a move forward that one tab kept (round sixty-two, second pass; the data
 * review's 1 and 2: in one tab's memory only, a reload or a second tab followed the move back and stamped a year ahead).
 */
let jumped = 0;
/** A large correction seen once, waiting for a second reading that agrees, and when it was seen (device clock). */
let pending: { delta: number; at: number } | null = null;
const listeners = new Set<(offset: number) => void>();
const wanting = new Set<() => void>();
/** At a load (`adopt` false) the correction is unconfirmed until a reading here; taken from another tab's write (`adopt`), it is as sure as that tab says. */
function readStored(adopt = false): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(OFFSET_KEY);
    if (raw) {
      const v = JSON.parse(raw) as Stored;
      const at = Number.isFinite(v.serverAt) ? (v.serverAt as number) : v.confirmedAt + v.offset;
      // Kept across the load, however old, confirmed or not (round sixty-two; the data review's 3): only a reading dated
      // after the device clock says the clock was set back since it was taken (a fast clock put right), and then the
      // correction no longer describes it.
      const c = Number.isFinite(v.confirmedAt) ? v.confirmedAt : 0;
      if (Number.isFinite(v.offset) && (!c || notAfterClock(Date.now() - c))) {
        offsetMs = v.offset; confirmedAt = c; serverAt = c ? at : 0; mono = monoNow();
        jumped = Number.isFinite(v.jumped) && (v.jumped as number) > 0 ? (v.jumped as number) : 0;
        unsure = adopt ? !!v.unsure : true;
      } else localStorage.removeItem(OFFSET_KEY);
    }
    const p = localStorage.getItem(PENDING_KEY);
    if (p) { const v = JSON.parse(p) as { delta: number; at: number }; if (Number.isFinite(v.delta) && trustedAge(Date.now() - v.at)) pending = v; else localStorage.removeItem(PENDING_KEY); }
  } catch {
    /* storage refused or unreadable: no correction */
  }
}
function store(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    // Kept whenever a reading confirmed the clock, a correction of nothing included: whether the clock in force is a
    // checked one decides whether a park judged by it is kept (round fifty-nine). Kept too while no reading confirms it
    // (one disagreed), and while it holds kept moves: removed only when there is nothing to keep (round sixty-two,
    // second pass; the data review's 3: a reload and the other tabs ran on the raw clock while this tab kept the offset).
    if (confirmedAt || offsetMs || jumped) {
      const v: Stored = { offset: offsetMs, confirmedAt, serverAt };
      if (jumped) v.jumped = jumped;
      if (unsure) v.unsure = true;
      localStorage.setItem(OFFSET_KEY, JSON.stringify(v));
    } else localStorage.removeItem(OFFSET_KEY);
    if (pending) localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    /* storage refused: the offset lives for this load */
  }
}
/** The two clocks read together, or null where there is no monotonic clock. */
function monoNow(): { dev: number; perf: number } | null {
  try {
    return typeof performance !== 'undefined' && typeof performance.now === 'function' ? { dev: Date.now(), perf: performance.now() } : null;
  } catch {
    return null;
  }
}
/** Listeners are told after the caller's own work: a move of the clock is found inside `nowMs`, which a fold may be calling. */
function tellLater(offset: number | null): void {
  const run = () => { if (offset != null) for (const l of listeners) l(offset); for (const w of wanting) w(); };
  if (typeof queueMicrotask === 'function') queueMicrotask(run); else void Promise.resolve().then(run);
}
/**
 * The device clock moved under this tab (round sixty-two; the clock review's 4, the outside reviews' A17 and B9). It is
 * read against the monotonic clock, and only a move past the half minute the correction itself ignores counts. The rule
 * (round sixty-two, second pass; the self-review's N1): the correction follows a move only as far as what it already
 * knows says the move puts the clock right. A move back never moves the clock in force ahead (its errors stamp behind,
 * which parks nothing); a move forward it cannot account for is kept, as decided, and may stamp ahead until a reading:
 *  - backwards, first as far as it undoes the moves forward kept since the last reading (`jumped`, stored and so shared
 *    by every tab and a reload): the clock set forward by mistake and put back. The correction is kept as it was;
 *  - backwards beyond that, as far as a negative correction says the clock was fast: a fast clock set right. The
 *    correction follows (it shrinks towards nothing by the move), so a fast clock set right offline is right at once;
 *  - backwards beyond that again: kept. Nothing known says the clock was that far fast, so it is taken as set wrong,
 *    and left slow it stamps behind. (Round sixty-two's first pass followed every move back, and a device opened a year
 *    fast and set right stayed a year ahead, stored so for the next load);
 *  - forwards by about a positive correction: a slow clock set right. The correction follows to about nothing (a sleep
 *    exactly as long as the correction, to the half minute, is the one case this reads wrong, and stamps behind);
 *  - forwards otherwise: a sleep on a platform whose monotonic clock pauses, or the clock set forward. The two cannot be
 *    told apart here, so the correction is kept (a sleep leaves it right) and the move is added to `jumped`. Kept, a
 *    clock set forward stamps ahead by the move plus any positive correction until a reading.
 * After any counted move the reference is read afresh, the correction is unconfirmed (`unsure`), it is stored, and a
 * reading is asked for at once. No amount of time passing changes it: the round-sixty-one lapse when a slow clock
 * "reached" its reading's server time dropped a correction that was still right (B9: six minutes slow across midnight
 * read yesterday's date).
 */
function follow(): void {
  if (!mono) return;
  let drift: number;
  try {
    drift = Math.round(Date.now() - mono.dev - (performance.now() - mono.perf)); // whole milliseconds: a stamp's wall is one
  } catch {
    return; /* no monotonic clock after all */
  }
  if (Math.abs(drift) <= TRUST_SERVER_PAST_MS) return;
  const was = offsetMs;
  let d = drift;
  if (d < 0 && jumped > 0) {
    const undo = Math.min(-d, jumped);
    jumped -= undo;
    d += undo;
    if (jumped <= TRUST_SERVER_PAST_MS) jumped = 0;
    if (-d <= TRUST_SERVER_PAST_MS) d = 0;
  }
  let f = 0; // the part of the move the correction follows
  if (d < 0 && offsetMs < 0) f = Math.max(d, offsetMs);
  else if (d > 0 && offsetMs > 0 && Math.abs(d - offsetMs) <= TRUST_SERVER_PAST_MS) f = d;
  else if (d > 0) jumped += d;
  if (f) {
    offsetMs -= f;
    if (Math.abs(offsetMs) <= TRUST_SERVER_PAST_MS / 2) offsetMs = 0; // the clocks now agree, as a reading would say
    // The reading's own time, and a pending one's, on the device clock's new scale: their age is unchanged by the move.
    if (confirmedAt) confirmedAt += f;
    if (pending) pending = { ...pending, at: pending.at + f };
  }
  mono = monoNow();
  unsure = true;
  store();
  tellLater(offsetMs !== was ? offsetMs : null);
}
/**
 * Another tab wrote the correction: this tab takes it as written (round sixty-two, second pass; the data review's 2 and
 * 7). This tab does not first measure a move of the device clock itself: a tab writes only after following every move up
 * to its write (`follow` runs first in `nowMs` and in a reading), so the record already accounts for it, and measuring it
 * here too counted the move twice (`jumped`), told this tab's listeners twice (one refold each), and in the old rule
 * replaced a right correction with a wrong one. The reference is read afresh from the record. Listeners are told once,
 * when the correction or whether it is checked changed.
 */
function adoptStored(): void {
  const was = offsetMs, wasChecked = checkedNow();
  offsetMs = 0; confirmedAt = 0; serverAt = 0; mono = null; pending = null; jumped = 0; unsure = false;
  readStored(true);
  if (offsetMs !== was || checkedNow() !== wasChecked) for (const l of listeners) l(offsetMs);
}
readStored();
// Another tab's correction reaches this one: a tab already open went on stamping by the old offset until its own next sync (round fifty-two, 1).
try {
  if (typeof addEventListener !== 'undefined' && typeof localStorage !== 'undefined') addEventListener('storage', (e) => { if ((e as StorageEvent).key === OFFSET_KEY || (e as StorageEvent).key === PENDING_KEY) adoptStored(); });
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
export const nowMs = () => { follow(); return Date.now() + offsetMs; };
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
  follow(); // a move of the device clock since the last reading is followed first, so the reading is met by the correction in force
  const delta = serverMs - localMs;
  const far = Math.abs(delta) > TRUST_SERVER_PAST_MS;
  const agree = Math.abs(delta) <= TRUST_SERVER_PAST_MS / 2;
  let next = offsetMs;
  if (agree) next = 0;
  else if (far || offsetMs !== 0) {
    if (Math.abs(delta - offsetMs) <= TRUST_SERVER_PAST_MS) next = offsetMs; // the same correction as before, give or take the threshold: no jitter
    else if (Math.abs(delta) > TRUST_SERVER_TWICE_PAST_MS) {
      const seen = pending;
      if (!seen || Math.abs(delta - seen.delta) > TRUST_AGREE_TOL_MS) {
        // A first reading of a large correction, or one that disagrees with the last: wait for a second. Meanwhile a clock
        // this reading says is days off is no longer counted as confirmed: an older reading confirmed a clock that has
        // since moved, and a park judged by it would be kept (round sixty-one; the clock review's 7: 72 stamps in the
        // fuzz were parked by peers while their writer, three days fast, still counted its clock as checked).
        pending = { delta, at: localMs };
        const wasChecked = clockChecked();
        if (Math.abs(delta - offsetMs) > TRUST_SERVER_TWICE_PAST_MS) confirmedAt = 0;
        // The correction itself stays in force and stored, unconfirmed: a disagreeing reading replaces it once a second
        // agrees, and never deletes it (round sixty-two, second pass; the data review's 3).
        unsure = true;
        store();
        if (wasChecked && !clockChecked()) for (const l of listeners) l(offsetMs);
        return offsetMs;
      }
      if (localMs - seen.at < TRUST_AGREE_GAP_MS) return offsetMs; // the same run, or one straight after: not a second reading yet
      next = delta;
    } else next = delta;
  }
  pending = null;
  const wasChecked = clockChecked();
  confirmedAt = localMs;
  serverAt = serverMs;
  mono = monoNow();
  unsure = false; // met by a reading: confirmed, or replaced by it (round sixty-two)
  jumped = 0;
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
  follow();
  return checkedNow();
}
/** `clockChecked` as the state stands, with no move followed first. */
function checkedNow(): boolean {
  return confirmedAt > 0 && trustedAge(Date.now() - confirmedAt);
}
/**
 * Whether a server reading this old still confirms the clock. Never one dated after now: the clock was set back since,
 * and the old reading confirmed a clock that is no longer in force. A negative age passed "less than seven days" and
 * the device parked its own plants by the wrong clock, for good (round sixty; three reviews). Five minutes of slack
 * cover the reading's own rounding and a clock nudged back by a time sync, as a set-back of hours or days is not.
 */
function trustedAge(age: number): boolean {
  return notAfterClock(age) && age < TRUST_EXPIRES_MS;
}
/** A reading not dated more than the five minutes of slack after the device clock (`trustedAge`). */
function notAfterClock(age: number): boolean {
  return age > -5 * 60_000;
}
/** The current correction, for the clock warning to say how far off the device is. */
export const clockOffsetMs = () => { follow(); return offsetMs; };
/** Whether the correction in force waits for a reading to confirm it (`unsure`; round sixty-two). */
export const clockUnsure = () => { follow(); return unsure; };
/** Called when this tab wants a reading of the server's clock at once: the device clock moved under it (round sixty-two). */
export function onReadingWanted(w: () => void): () => void {
  wanting.add(w);
  return () => void wanting.delete(w);
}
/** Stop syncing: no server to confirm a correction against, so none is kept (round fifty-two, 1). */
export function clearClockOffset(): void {
  const was = offsetMs;
  offsetMs = 0;
  pending = null;
  confirmedAt = 0;
  serverAt = 0;
  mono = null;
  unsure = false;
  jumped = 0;
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
  /** Fold in a timestamp seen from another device so our next tick sorts after it. A stamp far ahead of real time is not followed, this device's own included: following one would keep every later stamp from here a year ahead, and every other device would hold them all until then. An edit to a field whose current stamp is ahead of the clock is stamped just past that one stamp instead (`hlcPast`, used by the store), so it wins the field without moving the clock. */
  observe(remote: string): void {
    let r = hlcDecode(remote);
    // A stamp made past another carries the flag in its counter (`hlcPast`): this clock follows it from the next
    // millisecond, so that its own stamps never carry the flag by counting on from it (round sixty-one). So does an
    // unmarked counter one short of the flag, which no clock ticks to and which a bump would carry onto it (round
    // sixty-two; the harness review's 7, the first outside review's A32).
    if (r.count >= PAST_BIT - 1) r = { wall: r.wall + 1, count: 0, device: r.device };
    const phys = this.now();
    if (r.wall > phys + MAX_AHEAD_MS) return;
    const wall = Math.max(phys, this.last.wall, r.wall);
    if (wall === this.last.wall && wall === r.wall) this.last = this.bump(wall, Math.max(this.last.count, r.count));
    else if (wall === r.wall) this.last = this.bump(wall, r.count);
    else if (wall === this.last.wall) this.last = this.bump(wall, this.last.count);
    else this.last = { wall, count: 0, device: this.device };
  }
  /** The next counter, or the next millisecond when the counter is full or the next count would carry the flag (`PAST_BIT`): a clock's own stamp never does (round sixty-two; the harness review's 7). */
  private bump(wall: number, count: number): Hlc {
    return count >= MAX_COUNT || count + 1 >= PAST_BIT ? { wall: wall + 1, count: 0, device: this.device } : { wall, count: count + 1, device: this.device };
  }
}

/**
 * The counter bit of a stamp made past another (`hlcPast`). A clock ticks at most a few times in one millisecond, so a
 * counter this high is never a tick's (round sixty-one). It keeps the stamp's order (a longer counter is a bigger one,
 * and the bit makes it longer), and every build reads it as an ordinary stamp; only the hold and the park read the bit.
 */
export const PAST_BIT = 0x800000;

/**
 * Whether the stamp was made past another stamp of the field it changes (`hlcPast`), not read from a clock.
 *
 * Why it matters (round sixty-one, decision 1): an edit to a field whose stamp is ahead of this clock is stamped just
 * past that stamp, so the edit wins the field. When the field's stamp was made by a clock a year fast, the edit's stamp
 * is a year ahead too, though the edit was made now, by a clock that may long have been put right. Judged by its
 * arrival, as any change, it would be parked on every device, and the grower's edit would vanish at the next sync. The
 * flag says what the stamp is: not a clock running ahead, but an edit made in sight of the field, placed after what it
 * replaced. Such a stamp is never held and never parked (`isHeld`, `isParked` in log.ts); every device reads the same
 * flag from the same stamp, so the writer and its peers agree.
 */
export const isPastStamp = (t: string): boolean => {
  const end = t.indexOf('-', 14);
  return end > 14 && parseInt(t.slice(14, end), 16) >= PAST_BIT;
};

/**
 * The stamp just past `prev`, as `device`, keeping `prev`'s flag (a stamp made past another stays one) and never adding
 * it (an unmarked counter one short of the flag moves to the next millisecond instead; round sixty-two, the harness
 * review's 7): for a collision between two stamps given out at once. Unique, since no writer but `device` stamps with
 * that tag and `device`'s own clock never reached that wall.
 */
export function hlcAfter(prev: string, device: string): string {
  const p = hlcDecode(prev);
  const marked = p.count >= PAST_BIT;
  return hlcEncode(p.count >= MAX_COUNT || (!marked && p.count + 1 >= PAST_BIT) ? { wall: p.wall + 1, count: marked ? PAST_BIT : 0, device } : { wall: p.wall, count: p.count + 1, device });
}

/**
 * The stamp just past `prev`, as `device`, flagged as made past it (`isPastStamp`): for an edit to a field whose current
 * stamp is ahead of the clock (round sixty-one). `prev`'s counter plus one with the flag set is past `prev` whether or
 * not `prev` carries the flag.
 */
export function hlcPast(prev: string, device: string): string {
  const p = hlcDecode(prev);
  if (p.count >= MAX_COUNT) return hlcEncode({ wall: p.wall + 1, count: PAST_BIT, device });
  return hlcEncode({ wall: p.wall, count: PAST_BIT | (p.count + 1), device });
}
