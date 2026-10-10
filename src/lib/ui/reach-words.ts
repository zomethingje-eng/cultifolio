/**
 * How a page says why the reference gave no answer (round sixty-seven; triage-66 S8, IND-7, R45-11). A refusal is a
 * refusal, a limit is a limit, and only no answer at all is "did not answer" (rule 2): a 429 with Retry-After 30 was said
 * as "the species sheets did not answer", and "Check again" was refused again at once.
 */
import { waitLeft, type Unreached } from '$lib/ui/index.svelte';

/** A wait as a person reads it: "30 s", "2 min", "an hour". */
export function waitWords(s: number): string {
  if (s <= 0) return '';
  if (s < 90) return `${s} s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  return 'an hour';
}

/**
 * The clause for what was not answered, `what` being its name in the sentence ("the species sheets"). Never ends in a
 * full stop, so a page can go on.
 */
export function unreachedClause(u: Unreached, what: string, now = Date.now()): string {
  const wait = waitLeft(u, now);
  const after = wait ? `; it can be asked again in ${waitWords(wait)}` : '';
  if (u.kind === 'limited') {
    const who = /network/i.test(u.reason ?? '') ? 'this network has' : 'this address has';
    return `the server refused ${what} for now: ${who} asked too often${after}`;
  }
  if (u.kind === 'refused') {
    const r = u.reason?.replace(/[.\s]+$/, '') ?? '';
    const why = r ? ` (${/^[A-Z][a-z]/.test(r) ? r[0].toLowerCase() + r.slice(1) : r})` : '';
    return `the server refused ${what} just now${why}${after}`;
  }
  return `${what} did not answer`;
}

/** The label of a "Check again" button that waits out a Retry-After: what it says while it waits. */
export function againWords(u: Unreached | null | undefined, now = Date.now()): string {
  const wait = waitLeft(u, now);
  return wait ? `Check again in ${waitWords(wait)}` : 'Check again';
}
