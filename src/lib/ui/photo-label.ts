import { collection } from '$lib/db/collection.svelte';
import { accNo, sowNo, type Photo } from '$lib/db/types';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "2026-05-03" as "3 May 2026"; anything else as it is. */
export function photoDay(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}` : d;
}

/**
 * What one of your own photographs shows, in words: the plant's number and species, the day, and the caption, as
 * "2026-0012 Boophone disticha, 3 May 2026: caption". The text alternative of the full-size image and the name of every
 * thumbnail that opens it; a photograph had no text at all, or only its date (round fifty-eight; the accessibility review).
 */
export function photoLabel(p: Pick<Photo, 'd' | 'caption' | 'acc' | 'sowing'>): string {
  const a = p.acc ? collection.accession(p.acc) : undefined;
  const s = !a && p.sowing ? collection.sowing(p.sowing) : undefined;
  const who = a ? `${accNo(a)} ${a.taxonName}` : s ? `${sowNo(s)} ${s.taxonName}` : 'Photograph';
  const cap = p.caption?.trim();
  return `${who}, ${photoDay(p.d)}${cap ? `: ${cap}` : ''}`;
}
