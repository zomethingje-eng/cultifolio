// One run at a time in the project folder (round eighty-one, review B6): `corpus-step.lock`, taken by
// `scripts/corpus-step.mjs` for every run but `--status`, and by `scripts/build-dossiers.ts` for every step typed by hand
// (`npm run dossier -- …`). Two daily commands started a second apart both ran the cultivated fill, each pacing
// iNaturalist at 2 s on its own, so together about one request a second, the pace at which iNaturalist throttled the
// owner's first fill; and the walk's rule "never while corpus-step runs" was the owner's alone to keep.
//
// The lock names the process that holds it, what it runs, since when, and the machine's boot. A second run refuses,
// saying which run holds it. A lock is free again when its process has ended (a run killed, a PC switched off or
// restarted): the next run takes it, saying so. A builder step that the corpus step runs is its child, and runs under its
// lock. Plain Node, no dependencies.
import { hostname, uptime } from 'node:os';
import { join } from 'node:path';
import { openSync, writeSync, closeSync, readFileSync, unlinkSync, statSync } from 'node:fs';

export const LOCK = 'corpus-step.lock';

/** When this machine last started, to the second or so: a lock from before it is free whatever its pid. */
export const bootTime = () => Math.round((Date.now() - uptime() * 1000) / 1000) * 1000;

/** Whether a process of this pid runs now (signal 0 checks and sends nothing, on Windows as elsewhere). */
export function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e?.code === 'EPERM'; }
}

const readLock = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };

/** Whether a lock as read is held: by a live process of this machine since its boot (a lock unreadable or half written is free once it is a minute old). */
export function held(lock, { alive = pidAlive, boot = bootTime(), host = hostname() } = {}) {
  if (!lock || typeof lock !== 'object') return false;
  if (lock.host && lock.host !== host) return true; // another machine's run, on a shared folder: not ours to judge
  if (typeof lock.boot === 'number' && Math.abs(lock.boot - boot) > 120_000) return false;
  return alive(lock.pid);
}

/** The sentence a run that finds the lock held says. */
export function heldSentence(lock, root = '.') {
  const since = typeof lock?.at === 'string' ? lock.at.replace('T', ' ').slice(0, 16) + ' UTC' : 'a time not recorded';
  return `Another run holds ${LOCK} in this folder: "${lock?.what ?? 'a run'}" (process ${lock?.pid ?? '?'}${lock?.host ? ` on ${lock.host}` : ''}, since ${since}). Nothing was run. Wait for it to end (its window says when), then run this again. If no other window is running scripts\\corpus-step.mjs or a builder step, delete ${join(root, LOCK)} and run this again.`;
}

/**
 * Takes the lock in `root` for `what`, or says who holds it. `{ ok: true, release, took }` (`took` names a lock left by a
 * run that ended, taken over) or `{ ok: false, holder, sentence }`. `parent`: a lock held by this pid is this run's own
 * (the corpus step's builder steps), and is not taken again.
 * @param {string} root @param {string} what
 * @param {{ pid?: number, parent?: number, alive?: (pid: number) => boolean, boot?: number, host?: string, now?: () => Date }} [o]
 */
export function takeLock(root, what, o = {}) {
  const pid = o.pid ?? process.pid, alive = o.alive ?? pidAlive, boot = o.boot ?? bootTime(), host = o.host ?? hostname(), now = o.now ?? (() => new Date());
  const p = join(root, LOCK);
  let took = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(p, 'wx');
      writeSync(fd, JSON.stringify({ pid, what, at: now().toISOString(), boot, host }));
      closeSync(fd);
      let released = false;
      const release = () => { if (released) return; released = true; try { if (readLock(p)?.pid === pid) unlinkSync(p); } catch { /* gone already */ } };
      return { ok: true, release, took };
    } catch (e) {
      if (e?.code !== 'EEXIST') throw e;
      const lock = readLock(p);
      // A lock not yet whole (another run writing it this instant) is held for a minute.
      if (!lock) { try { if (Date.now() - statSync(p).mtimeMs < 60_000) return { ok: false, holder: null, sentence: heldSentence(null, root) }; } catch { continue; } }
      if (lock && o.parent != null && lock.pid === o.parent && held(lock, { alive, boot, host })) return { ok: true, release: () => {}, took: null, parent: true };
      if (held(lock, { alive, boot, host })) return { ok: false, holder: lock, sentence: heldSentence(lock, root) };
      took = lock;
      try { unlinkSync(p); } catch { /* another run took it first: the next try says so */ }
    }
  }
  const lock = readLock(p);
  return { ok: false, holder: lock, sentence: heldSentence(lock, root) };
}
