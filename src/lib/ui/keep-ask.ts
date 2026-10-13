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
/**
 * The answer to this page's ask for the first plant, when it asked for that reason: GrowLayer, which says the answer, asks
 * again for the first plant once the plant's page is drawn, and is handed this same answer rather than null, so an ask
 * made from the plant's commit is still said (round seventy; triage-69 P3, R47-20). Nothing is asked twice.
 */
let firstAsk: Promise<boolean> | null = null;

/** For tests: forget this page's ask. */
export function forgetPageAsk(): void {
  askedHere = false;
  firstAsk = null;
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
  // One rule for both: the reason is no second gate. A second ask for the first plant on a page that has asked for it
  // already is answered with that ask's answer, and asks nothing.
  if (askedHere) return reason === 'first' && firstAsk ? firstAsk : Promise.resolve(null);
  if (PAGE_IN_DEMO) return Promise.resolve(null);
  const st = typeof navigator !== 'undefined' ? navigator.storage : undefined;
  if (!st?.persist) return Promise.resolve(null);
  const now = Date.now();
  if (!due(now)) return Promise.resolve(null);
  askedHere = true;
  // Written before the browser is called: the call may never return (round sixty-seven; triage-66 P1).
  try { localStorage.setItem(PERSIST_ASKED, String(now)); } catch { /* the page's own flag still holds it to one ask */ }
  let answer: Promise<boolean>;
  try {
    answer = st.persist().then((ok) => !!ok, () => false);
  } catch {
    answer = Promise.resolve(false);
  }
  if (reason === 'first') firstAsk = answer;
  return answer;
}

/** What `keepOnFirstPlant` reads of the collection: its plants, and its writes as they are committed. */
export type CommitSource = { accessions: ReadonlyArray<unknown>; onLocalChange(fn: (changes: Array<{ kind: string }>) => void): () => void };

/**
 * Ask from the first plant's commit, not only once a page has read the collection (round seventy; triage-69 P3, R47-20).
 * The load's ask waits for the collection to be read, and GrowLayer's for a page to be drawn with the plant; on a slow
 * phone, or under a loaded test run in Safari's engine and Firefox, a grower who moved on within a second was never asked
 * at all. Now the commit that writes a plant asks, on the page that wrote it, while no answer has been said on this device
 * (`answerSaid`, GrowLayer's key), through the same door and the same month. Returns the listener's remover.
 */
export function keepOnFirstPlant(c: CommitSource, answerSaid: () => boolean): () => void {
  return c.onLocalChange((changes) => {
    if (!changes.some((x) => x.kind === 'accession') || c.accessions.length < 1) return;
    if (answerSaid()) return;
    void askToKeep('first').catch(() => {});
  });
}
