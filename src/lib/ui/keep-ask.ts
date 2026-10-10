/**
 * The one door for asking the browser to keep this site's storage (round sixty-seven; triage-66 P1, contract C4).
 *
 * Two places asked: the collection's load, at most once a month, and GrowLayer after the first plant, whenever its own
 * "answer said" key was unset. Firefox puts the question to the person and answers only when they do (for good, if the
 * question is dismissed), so the second key was never written and every full page load asked again. Now every ask goes
 * through here:
 *
 * - `cultifolio.persistAskedAt` is written BEFORE the browser is called, so a question left standing still counts as asked;
 * - a month must pass since that time, whichever page or reason asked, and a page asks once at most;
 * - nothing is asked in the example collection, or where the browser has no `persist()`.
 *
 * "Asked" and "answer said" are kept apart: this file records the ask; GrowLayer records that it said the answer.
 *
 * The answer is a promise that may never settle (Firefox, question dismissed): a caller must never wait on it for
 * anything else. Null means nothing was asked.
 */
// The example's flag as this page read it at load (round sixty-seven; contract C3): a tab whose flag goes while the
// page still shows the example must not ask on the grower's behalf.
import { PAGE_IN_DEMO } from '$lib/db/demo';

export const PERSIST_ASKED = 'cultifolio.persistAskedAt';
/** A month between asks. */
export const ASK_EVERY_MS = 30 * 86_400_000;
/**
 * A stored time further ahead than this is a clock that was wrong when it was written (set forward, then put right): it
 * is not honoured, or the next ask would wait until the clock catches up with the mistake (IND-2).
 */
const AHEAD_MS = 86_400_000;

/** Whether this page has asked already: the gate when storage refuses the time, and a second ask on one page in any case. */
let askedHere = false;

/** For tests: forget this page's ask. */
export function forgetPageAsk(): void {
  askedHere = false;
}

/** Whether an ask is due now by the stored time. A storage that throws counts as due once per page. */
function due(now: number): boolean {
  try {
    const at = Number(localStorage.getItem(PERSIST_ASKED) ?? 0);
    if (!Number.isFinite(at) || at <= 0) return true;
    if (at > now + AHEAD_MS) return true;
    return now - at >= ASK_EVERY_MS;
  } catch {
    return true;
  }
}

/**
 * Ask the browser to keep this site's storage, if an ask is due. Resolves to the browser's answer, or to null at once
 * when nothing was asked (the month not over, asked already on this page, the example, no `persist()`).
 * `reason` says who asks: the collection's load ('load') or the first plant ('first'); both obey the same month.
 */
export function askToKeep(reason: 'load' | 'first'): Promise<boolean | null> {
  void reason; // one rule for both: the reason is for a reader of the call, not a second gate
  if (askedHere) return Promise.resolve(null);
  if (PAGE_IN_DEMO) return Promise.resolve(null);
  const st = typeof navigator !== 'undefined' ? navigator.storage : undefined;
  if (!st?.persist) return Promise.resolve(null);
  const now = Date.now();
  if (!due(now)) return Promise.resolve(null);
  askedHere = true;
  // Written before the browser is called: the call may never return (round sixty-seven; triage-66 P1).
  try { localStorage.setItem(PERSIST_ASKED, String(now)); } catch { /* the page's own flag still holds it to one ask */ }
  try {
    return st.persist().then((ok) => !!ok, () => false);
  } catch {
    return Promise.resolve(false);
  }
}
