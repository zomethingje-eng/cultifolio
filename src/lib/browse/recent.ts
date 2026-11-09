/**
 * The search box's recent searches (round eighty-seven, C3): kept in this browser's storage only, never sent anywhere
 * and never in a link; the box shows them when it is empty. At most eight, the latest first, each a row the box gave
 * (its words, where it went). A storage the browser refuses (a private window, blocked site data) keeps none, quietly.
 *
 * Pinned views (round eighty-seven, C6; $lib/browse/pins) are the collection's, in its log: `pinnedViews` is the seam
 * the box reads beside the recent ones, and `pin`, `unpin` and `markSeen` write them through the collection, as every record
 * of it is written.
 */
import { collection } from '$lib/db/collection.svelte';
import { pinsOf, pinIdOf, PIN_PREFIX, PIN_MAX, PIN_FOLLOW_MAX, todayIso, type Pin } from './pins';

export interface Recent { q: string; label: string; href: string; /** A line under it (a pin's count). */ sub?: string; /** A pin's browse query. */ view?: string }
const KEY = 'cultifolio.recentSearches';
const MAX = 8;
const ok = (x: unknown): x is Recent => !!x && typeof x === 'object' && typeof (x as Recent).q === 'string' && typeof (x as Recent).label === 'string' && typeof (x as Recent).href === 'string' && (x as Recent).href.startsWith('/') && !(x as Recent).href.startsWith('//');

export function recentSearches(): Recent[] {
  try {
    const x = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(x) ? x.filter(ok).slice(0, MAX) : [];
  } catch {
    return [];
  }
}
export function rememberSearch(r: Recent): void {
  if (!ok(r) || !r.q.trim()) return;
  try {
    const rest = recentSearches().filter((x) => x.href !== r.href);
    localStorage.setItem(KEY, JSON.stringify([{ q: r.q.trim().slice(0, 80), label: r.label.slice(0, 120), href: r.href.slice(0, 500) }, ...rest].slice(0, MAX)));
  } catch { /* not kept: the search works as before */ }
}
export function forgetSearches(): void {
  try { localStorage.removeItem(KEY); } catch { /* nothing kept to forget */ }
}
/** The pins the collection holds, validated on read, latest first; none while it is opening or could not open. */
export function pins(): Pin[] {
  if (!collection.ready) return [];
  return pinsOf(collection.settingsWith(PIN_PREFIX));
}
/** The pinned views as the search box lists them, with how many species each held when last seen. */
export function pinnedViews(): Recent[] {
  return pins().map((p) => ({ q: '', label: p.label, href: p.href, view: p.view, sub: `pinned · ${p.n.toLocaleString('en-GB')} species when last seen` }));
}
/** The pin of a view's query, if it is pinned. */
export const pinOfView = (view: string): Pin | undefined => pins().find((p) => p.view === view);

/** What pinning gives: the pin, or why not. */
export type PinResult = { ok: true; id: string } | { ok: false; why: string };
/**
 * Pins a view: its page, its query, its title, and its species now (page ids, `keys`, written short; null past
 * PIN_FOLLOW_MAX). A view pinned before and unpinned is brought back with today's species. Refused past PIN_MAX pins.
 */
export async function pin(v: { href: string; view: string; label: string; n: number; keys: string | null }): Promise<PinResult> {
  if (!collection.ready) return { ok: false, why: 'Your collection has not opened yet, so nothing can be pinned.' };
  if (!pinOfView(v.view) && pins().length >= PIN_MAX) return { ok: false, why: `${PIN_MAX} views are pinned, the most a collection keeps. Unpin one first.` };
  const id = pinIdOf(v.view);
  const day = todayIso();
  if (collection.settingRemoved(id)) await collection.restore('setting', id);
  await collection.put('setting', id, { href: v.href, view: v.view, label: v.label.slice(0, 200), made: day, seen: day, n: v.n, keys: v.n > PIN_FOLLOW_MAX ? null : v.keys });
  return { ok: true, id };
}
export async function unpin(id: string): Promise<void> {
  await collection.remove('setting', id);
}
/**
 * A pinned view seen: its species now become the ones its next "since" is counted from. Written only when they differ
 * from the ones kept (a visit that changes nothing writes nothing to the log).
 */
export async function markSeen(p: Pin, now: { n: number; keys: string | null }): Promise<void> {
  const keys = now.n > PIN_FOLLOW_MAX ? null : now.keys;
  if (keys === p.keys && now.n === p.n) return;
  await collection.put('setting', p.id, { seen: todayIso(), n: now.n, keys });
}
