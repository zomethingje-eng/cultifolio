/**
 * What a page does when a new build's service worker takes it over (round sixty-seven; triage-66 P2, R45-5, S-E6).
 *
 * The layout reloaded at once in a page's first four seconds, whatever had been typed and whatever the vault was writing,
 * and a tab that had not itself sent `skip` (a second tab) ran the old build under the new worker for good. A worker that
 * did not say its build in a second (`null`) counted as another build and reloaded a fresh page. Now:
 *
 * - a page no older worker served, or one taken over by a worker of its own build, does nothing;
 * - a worker that does not say its build does nothing (it may be this build);
 * - a page that asked for the takeover reloads at once only in its first seconds, with nothing typed and no vault write in
 *   flight; otherwise, and always for a tab that did not ask, it reloads at its next navigation.
 */
export type TakeOver = 'none' | 'reload' | 'next';
/** How long after its start a page may still be reloaded under the grower's eyes: nothing is half-done yet. */
export const EARLY_MS = 4000;

export function onTakeOver(o: {
  /** Whether a worker served this page when it loaded (a first visit came from the server and is this build already). */
  servedByOld: boolean;
  /** Whether this page sent `skip` to the waiting worker. */
  askedSkip: boolean;
  /** The build the new controller says it serves; null when it did not say within a second. */
  build: string | null;
  /** This page's own build. */
  version: string;
  /** Milliseconds since the page started. */
  sinceStart: number;
  /** Whether anything was typed, ticked or chosen on this page, or a field that takes typing has focus. */
  typed: boolean;
  /** Vault writes in flight (`vaultWritesInFlight()`). */
  writing: number;
}): TakeOver {
  if (!o.servedByOld) return 'none';
  if (o.build === null || o.build === o.version) return 'none';
  if (!o.askedSkip) return 'next';
  if (o.sinceStart < EARLY_MS && !o.typed && o.writing === 0) return 'reload';
  return 'next';
}
