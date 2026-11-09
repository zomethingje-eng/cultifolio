/**
 * The app lock (round eighty-seven, t3; plan F12): a passcode this device asks for before it shows the app, for a device
 * other people use too. What it is, said exactly (and on /about/how#lock):
 *
 * - It is a screen over the app, nothing more. The collection is kept in this browser's own database as it is, not
 *   encrypted: the vault is encrypted for sync and on the server, never on the device. So the lock keeps a casual look
 *   out (someone picking up the phone or sitting at the computer); it does not keep out someone who can read the
 *   browser's storage (its developer tools, the device's files, a backup of the device). The sync key, kept on the
 *   device so it can sync without asking, is in that storage too.
 * - The passcode is kept on this device only, as a PBKDF2-SHA-256 hash of it with a random salt; it is never synced and
 *   never in a backup, so each device has its own (or none). Someone with the device's storage can read that hash and
 *   try passcodes against it at their own speed: a short passcode is found that way, so the hash adds nothing to the
 *   screen but keeping a long passcode from being read off the device (round eighty-seven, the stage 3 fixes; M5).
 * - It asks when the app is opened in a new tab or window, and again once the app has been out of sight for the time set
 *   (at once, or after 1, 5 or 15 minutes). A tab that was unlocked stays unlocked across a reload.
 * - Five wrong passcodes make it wait 30 seconds, and the count and the wait are kept in this browser's storage beside the
 *   lock (localStorage, not the tab's sessionStorage): a reload, another tab or a new window does not start them again.
 * - It is never the only way in (no one is locked out of their own collection): the sync key, on a device that syncs,
 *   or a backup file of this collection, opens it and takes the passcode off. And it can be set only on a device that
 *   syncs or that made a backup within the last day, so one of the two is there to come back with. A device that stops
 *   syncing while locked keeps a SHA-256 hash of the key it synced with beside the lock (`keepKey`; the stage 3 fixes,
 *   S3), so that key still opens it: before, stopping sync left a lock that only a backup file could open.
 *
 * Not in the example collection, which is not the visitor's.
 */
import { PAGE_IN_DEMO } from '$lib/db/demo';
/*
 * Kept in the browser's storage directly, not through stored.ts: the lock is never the example collection's (it is not
 * read or written in an example tab at all), so it has no example copy to route to.
 */
const readLockKey = (): string | null => { try { return localStorage.getItem(LOCK_KEY); } catch { return null; } };
/** No storage (a private window that keeps none): the lock is simply not kept. */
const writeLockKey = (v: string | null): void => { try { if (v === null) localStorage.removeItem(LOCK_KEY); else localStorage.setItem(LOCK_KEY, v); } catch { /* not kept */ } };
const readTabKey = (): string | null => { try { return sessionStorage.getItem(TAB_KEY); } catch { return null; } };
const writeTabKey = (v: string | null): void => { try { if (v === null) sessionStorage.removeItem(TAB_KEY); else sessionStorage.setItem(TAB_KEY, v); } catch { /* not kept */ } };

export const LOCK_KEY = 'cultifolio.lock';
/** The wrong passcodes counted and the wait, kept beside the lock so a reload or another tab does not reset them. */
export const TRIES_KEY = 'cultifolio.lock.tries';
const readTries = (): { wrong: number; until: number } => {
  try { const o = JSON.parse(localStorage.getItem(TRIES_KEY) ?? 'null'); return o && Number.isInteger(o.wrong) && o.wrong >= 0 && o.wrong < 100 && typeof o.until === 'number' && Number.isFinite(o.until) ? { wrong: o.wrong, until: Math.min(o.until, Date.now() + WAIT_MS) } : { wrong: 0, until: 0 }; } catch { return { wrong: 0, until: 0 }; }
};
const writeTries = (t: { wrong: number; until: number } | null): void => { try { if (!t || (!t.wrong && !t.until)) localStorage.removeItem(TRIES_KEY); else localStorage.setItem(TRIES_KEY, JSON.stringify(t)); } catch { /* not kept */ } };
/** The tab's own mark: unlocked here, and when the app went out of sight. */
const TAB_KEY = 'cultifolio.unlocked';
export const LOCK_AFTER = [0, 1, 5, 15] as const;
export const PASS_MIN = 4;
export const PASS_MAX = 64;
/**
 * PBKDF2's rounds: 600,000, OWASP's figure for PBKDF2-HMAC-SHA-256 (the Password Storage Cheat Sheet, 2023). It slows each
 * guess against a copy of the stored hash, and it does not make a short passcode safe: someone with the device's storage
 * can recover a four-digit passcode from the hash in minutes whatever the count, so the lock is a screen against a casual
 * look, and the hash protects only a long passcode from being read off the device. It protects the passcode, not the
 * collection, which is not encrypted with it. The browser test (tests/e2e/r87s3-fixes.spec.ts, 4) timed one check at
 * 94 ms (desktop project) and 139 ms (phone project) on the test machine, and 107 and 211 ms with the CPU slowed sixfold:
 * Chromium runs WebCrypto's PBKDF2 off the page's thread, which the throttle does not reach, so a slow phone is not
 * measured there. By those figures a check takes a second on a core seven to ten times slower than the test machine's,
 * once at each unlock; the count is OWASP's all the same, since the slowness is the protection. A lock set before keeps
 * the count it was set with (`rounds`), until the passcode is set again.
 */
export const ROUNDS = 600_000;
/** Wrong passcodes before the screen waits, and how long it waits. */
const TRIES = 5;
const WAIT_MS = 30_000;

/** `key`: the SHA-256 of the sync key this device synced with, kept when it stops syncing while locked (`keepKey`). */
interface Stored { v: 1; salt: string; hash: string; rounds: number; after: number; key?: string }

const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function hashPass(pass: string, salt: Uint8Array, rounds = ROUNDS): Promise<string> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass.normalize('NFC')) as BufferSource, 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: rounds }, base, 256);
  return b64(new Uint8Array(bits));
}

/** The stored lock, validated on read; null when there is none or what is stored cannot be read (then nothing is locked: a damaged setting never shuts the owner out). */
export function readLock(raw: string | null): Stored | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<Stored>;
    if (!o || o.v !== 1 || typeof o.salt !== 'string' || typeof o.hash !== 'string' || typeof o.rounds !== 'number' || !Number.isInteger(o.rounds) || o.rounds < 1000 || o.rounds > 5_000_000) return null;
    if (unb64(o.salt).length < 8 || unb64(o.hash).length !== 32) return null;
    const after = (LOCK_AFTER as readonly number[]).includes(o.after as number) ? (o.after as number) : 5;
    const key = typeof o.key === 'string' && /^[0-9a-f]{64}$/.test(o.key) ? o.key : undefined;
    return { v: 1, salt: o.salt, hash: o.hash, rounds: o.rounds, after, ...(key ? { key } : {}) };
  } catch {
    return null;
  }
}

/** The hash of a sync key the lock keeps (`keepKey`): of the key as `parseVaultKey` reads it, so any case or spacing of it matches. */
export async function syncKeyHash(canonical: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`cultifolio-lock-key:${canonical}`) as BufferSource);
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Why a passcode is not taken, or null. */
export function passError(p: string): string | null {
  const n = Array.from(p).length;
  if (n < PASS_MIN) return `A passcode is at least ${PASS_MIN} characters.`;
  if (n > PASS_MAX) return `A passcode is at most ${PASS_MAX} characters.`;
  return null;
}

const tabMark = (): { at: number; hidden: number | null } | null => {
  try { const o = JSON.parse(readTabKey() ?? 'null'); return o && typeof o.at === 'number' ? { at: o.at, hidden: typeof o.hidden === 'number' ? o.hidden : null } : null; } catch { return null; }
};
const setTabMark = (m: { at: number; hidden: number | null } | null) => writeTabKey(m ? JSON.stringify(m) : null);

class Lock {
  /** A passcode is set on this device. */
  enabled = $state(false);
  /** The app is behind the lock screen now. */
  locked = $state(false);
  /** Minutes out of sight before it asks again. */
  after = $state<number>(5);
  /** When the screen takes a passcode again, after too many wrong ones (ms), or 0. */
  waitUntil = $state(0);
  private wrong = 0;
  private stored: Stored | null = null;
  private watching = false;

  /** A sync key's hash kept with the lock, from when this device stopped syncing while locked. */
  get keptKey(): string | null {
    return this.stored?.key ?? null;
  }

  load(): void {
    if (PAGE_IN_DEMO || typeof window === 'undefined') return;
    this.stored = readLock(readLockKey());
    const t = readTries();
    this.wrong = t.wrong;
    this.waitUntil = t.until > Date.now() ? t.until : 0;
    this.enabled = !!this.stored;
    this.after = this.stored?.after ?? 5;
    if (!this.stored) { this.locked = false; return; }
    const m = tabMark();
    // Unlocked in this tab and not out of sight past the time set (a reload keeps it); else it asks.
    this.locked = !m || (m.hidden != null && Date.now() - m.hidden >= this.after * 60_000);
    if (!this.locked && m?.hidden != null) setTabMark({ at: m.at, hidden: null });
    this.watch();
  }

  private watch(): void {
    if (this.watching || typeof document === 'undefined') return;
    this.watching = true;
    document.addEventListener('visibilitychange', () => {
      if (!this.enabled) return;
      if (document.visibilityState === 'hidden') {
        if (!this.locked) { const m = tabMark(); setTabMark({ at: m?.at ?? Date.now(), hidden: Date.now() }); }
        if (this.after === 0) this.locked = true;
      } else {
        const m = tabMark();
        if (!this.locked && m?.hidden != null) {
          if (Date.now() - m.hidden >= this.after * 60_000) this.lockNow();
          else setTabMark({ at: m.at, hidden: null });
        }
      }
    });
  }

  /** Set or change the passcode (and the time); the tab stays unlocked. */
  async set(pass: string, after: number): Promise<void> {
    if (PAGE_IN_DEMO) throw new Error('The example collection has no lock.');
    const e = passError(pass);
    if (e) throw new Error(e);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const s: Stored = { v: 1, salt: b64(salt), hash: await hashPass(pass, salt), rounds: ROUNDS, after: (LOCK_AFTER as readonly number[]).includes(after) ? after : 5, ...(this.stored?.key ? { key: this.stored.key } : {}) };
    writeLockKey(JSON.stringify(s));
    this.stored = s;
    this.enabled = true;
    this.after = s.after;
    this.locked = false;
    setTabMark({ at: Date.now(), hidden: null });
    this.watch();
  }

  /** The time out of sight, without asking for the passcode again (the tab is unlocked). */
  setAfter(after: number): void {
    if (!this.stored || !(LOCK_AFTER as readonly number[]).includes(after)) return;
    this.stored = { ...this.stored, after };
    writeLockKey(JSON.stringify(this.stored));
    this.after = after;
  }

  async check(pass: string): Promise<boolean> {
    if (!this.stored) return true;
    const h = await hashPass(pass, unb64(this.stored.salt), this.stored.rounds);
    let d = h.length ^ this.stored.hash.length;
    for (let i = 0; i < Math.min(h.length, this.stored.hash.length); i++) d |= h.charCodeAt(i) ^ this.stored.hash.charCodeAt(i);
    return d === 0;
  }

  /** The passcode at the lock screen: true when it opened. After five wrong ones the screen waits thirty seconds. */
  async unlock(pass: string): Promise<boolean> {
    // Read again: another tab may have counted wrong passcodes since this one loaded.
    const t = readTries();
    this.wrong = t.wrong;
    if (t.until > this.waitUntil) this.waitUntil = t.until;
    if (Date.now() < this.waitUntil) return false;
    if (await this.check(pass)) {
      this.wrong = 0;
      this.waitUntil = 0;
      writeTries(null);
      this.locked = false;
      setTabMark({ at: Date.now(), hidden: null });
      return true;
    }
    if (++this.wrong >= TRIES) { this.wrong = 0; this.waitUntil = Date.now() + WAIT_MS; }
    writeTries({ wrong: this.wrong, until: this.waitUntil > Date.now() ? this.waitUntil : 0 });
    return false;
  }

  /**
   * Keep the hash of the sync key this device synced with, as it stops syncing while locked (S3): the key still opens the
   * lock once the device has forgotten it. Asks for no passcode, since it only adds a way back.
   */
  keepKey(hash: string): void {
    if (!this.stored || !/^[0-9a-f]{64}$/.test(hash)) return;
    this.stored = { ...this.stored, key: hash };
    writeLockKey(JSON.stringify(this.stored));
  }

  /** Opened another way (the sync key, a backup file of this collection): the passcode is taken off, to be set again in Settings. */
  recovered(): void {
    this.remove();
  }

  lockNow(): void {
    if (!this.enabled) return;
    this.locked = true;
    setTabMark(null);
  }

  /** Take the passcode off this device. */
  remove(): void {
    writeLockKey(null);
    writeTries(null);
    this.wrong = 0;
    this.waitUntil = 0;
    this.stored = null;
    this.enabled = false;
    this.locked = false;
    setTabMark(null);
  }
}

export const lock = new Lock();

/** The pages the lock does not cover: the about pages, which say what the lock is and how to come back without the passcode. */
export const lockExempt = (path: string): boolean => path === '/about' || path.startsWith('/about/');
