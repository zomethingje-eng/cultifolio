/**
 * What a pinned view gained and lost since it was pinned or last seen (round eighty-seven, C6), worked out in the
 * browser: the species the pin kept (`keys`) against the species the view gives now (/browse/data?part=keys). Pure but
 * for the one request, so the front page and the view's own page say the same.
 */
import { decodeKeys, changesOf, type Pin } from './pins';
import { keysOf, type ViewKeys } from './data';

export type Since =
  /** Compared: the page ids the view gained and lost. */
  | { kind: 'changes'; added: string[]; removed: string[]; now: ViewKeys }
  /** The view holds more species than a pin follows, now: no comparison is made. */
  | { kind: 'wide'; now: ViewKeys }
  /** The pin kept no species to compare with (it was too wide when last seen): followed from now on. */
  | { kind: 'fresh'; now: ViewKeys }
  /** The view names a region the reference no longer holds: said, and no comparison is made (the pin keeps its species). */
  | { kind: 'gone'; codes: string[]; now: ViewKeys }
  /** The reference was not reached: nothing is said of changes. */
  | { kind: 'unreached' };

export async function sinceOf(p: Pin): Promise<Since> {
  const now = await keysOf(p.view);
  if (!now) return { kind: 'unreached' };
  if (now.gone?.length) return { kind: 'gone', codes: now.gone, now };
  if (now.wide || now.keys === null) return { kind: 'wide', now };
  const then = p.keys === null ? null : decodeKeys(p.keys);
  if (!then) return { kind: 'fresh', now };
  const nowKeys = decodeKeys(now.keys);
  if (!nowKeys) return { kind: 'unreached' };
  return { kind: 'changes', ...changesOf(then, nowKeys), now };
}
