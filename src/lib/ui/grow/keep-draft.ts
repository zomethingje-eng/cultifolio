/**
 * "Keep it as my own" carries the whole form (round sixty-nine; triage-68 X3; S-C2, IND-4, R46-5). It carried only the
 * species, or a place's name, in the address: the date, the source, the price, the count, the notes and the place were
 * dropped, and the form's own guard asked "Leave site?" in the middle. Now every field the form reads back, the place
 * included, goes into one key of the tab's session storage, which the same form in the grower's own collection reads
 * once and takes off. Nothing typed goes in the address (a note, a price, a seller), which lands in the history and in
 * anything the address is copied to; the address says only that a draft is waiting (`?kept=1`), so a draft a Leave
 * called off left behind is never read by a later, ordinary visit to the form.
 *
 * The place is carried by its name and kind, never its id: the example's places are not the grower's. The grower's form
 * picks their own place of that name when there is one, and otherwise opens the picker's "New…" with it filled in.
 * With the place it sits inside, by the same name and kind (round seventy; triage-69 X2; S-D7a, IND-7): "Bench 1" made
 * inside "Greenhouse" opened at the top level. "New…" opens inside the grower's own place of that name, and when they
 * have none it says where it was.
 *
 * A draft the tab's storage refuses (a private window, a full one) is not taken out of the example (round seventy;
 * triage-69 X2; IND-6): Keep went on to leave without it, and everything typed was lost behind a button that promised
 * to keep it. The form stays as it was, and says why.
 */
import { PAGE_IN_DEMO } from '$lib/db/demo';
import { leaveExample } from './example.svelte';

export const DRAFT = 'cultifolio.keepDraft';
/** The address parameter that says a draft is waiting. */
export const KEPT_PARAM = 'kept';
export type DraftForm = 'plant' | 'batch' | 'place';
/** A place as carried: the name and the kind, for the grower's own form to find or make, and the place it sits inside (round seventy; triage-69 X2). */
export type CarriedPlace = { name: string; kind?: string | null; inside?: { name: string; kind?: string | null } | null };
export type Draft = { form: DraftForm; fields: Record<string, unknown>; place: CarriedPlace | null };

/** The form each draft is for, in the grower's own collection. */
export const KEEP_TO: Record<DraftForm, string> = { plant: '/plants/new?kept=1', batch: '/propagation/new?kept=1', place: '/places?kept=1#add' };

function write(d: Draft): boolean {
  try { sessionStorage.setItem(DRAFT, JSON.stringify(d)); return true; } catch { return false; }
}
function drop(): void {
  try { sessionStorage.removeItem(DRAFT); } catch { /* it goes with the tab */ }
}

/** What Keep says when the tab's storage refused the draft: nothing has moved, and what was typed is still on the form. */
export const UNKEPT_WORDS = 'What you typed could not be kept: this browser refused to store it in this tab (a private window, or its storage full). Nothing has changed, and it is all still here.';
/**
 * Inside the example: write the draft, set the form's own guard aside (`hold(true)`) so the browser does not ask "Leave
 * site?" after the visitor pressed a button promising to keep what they typed, and leave for the same form in the
 * grower's own collection. A Leave the visitor declines puts the guard back and drops the draft: no page follows it.
 * One the page decides was called off puts the guard back and keeps the draft (round seventy; triage-69 X5; R47-17):
 * Leave's fallback decides so after 10 seconds while the page is still showing, and a next page that took 12 seconds
 * then loaded anyway at `?kept=1`, outside the example, with the form empty and the example deleted. Kept, it is read
 * only by its own form at an address saying one is waiting, once, and a later Keep writes over it.
 * 'unkept' when the draft could not be written: nothing else is done (round seventy; triage-69 X2; IND-6).
 */
export async function keepAsOwn(d: Draft, hold?: (on: boolean) => void): Promise<boolean | 'unkept'> {
  if (!write(d)) return 'unkept';
  hold?.(true);
  const going = await leaveExample(KEEP_TO[d.form], () => hold?.(false));
  if (!going) { hold?.(false); drop(); }
  return going;
}

/**
 * Outside the example, on the form a draft is for: the draft, read once and taken off, when the address says one is
 * waiting; null otherwise. A draft for another form, or one that cannot be read, is dropped.
 */
export function takeDraft(form: DraftForm, url: URL): Draft | null {
  if (PAGE_IN_DEMO || !url.searchParams.has(KEPT_PARAM)) return null;
  let raw: string | null = null;
  try { raw = sessionStorage.getItem(DRAFT); } catch { return null; }
  drop();
  try {
    const d = JSON.parse(raw ?? 'null') as Draft | null;
    return d && d.form === form && d.fields && typeof d.fields === 'object' ? d : null;
  } catch {
    return null;
  }
}

/** A carried value of the type the field holds, or the field's own when it is not one: a draft is read, never trusted. */
export function str(v: unknown, or: string): string {
  return typeof v === 'string' ? v : or;
}
export function num(v: unknown, or: number | null): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : v === null ? null : or;
}
export function bool(v: unknown, or: boolean): boolean {
  return typeof v === 'boolean' ? v : or;
}
export function oneOf<T extends string>(v: unknown, allowed: readonly T[], or: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : or;
}

/** The grower's own place with the carried name (the first, by the name as shown, case aside), or null. */
export function ownPlaceNamed(place: { name: string } | null | undefined, places: ReadonlyArray<{ id: string; name: string }>): string | null {
  const want = typeof place?.name === 'string' ? place.name.trim().toLowerCase() : '';
  if (!want) return null;
  return places.find((l) => l.name.trim().toLowerCase() === want)?.id ?? null;
}

/**
 * A place of the example's, as carried: its name and kind, and the place it sits inside (round seventy; triage-69 X2).
 * `at` is the place picked, or the new one named in the picker (its `inside` already read there); `of` reads a place by id.
 */
export function carriedPlace(at: { name: string; type?: string | null; kind?: string | null; parentId?: string | null; inside?: CarriedPlace['inside'] } | null | undefined, of: (id: string) => { name: string; type?: string | null } | undefined): CarriedPlace | null {
  if (!at?.name) return null;
  const parent = at.parentId ? of(at.parentId) : undefined;
  const inside = at.inside !== undefined ? at.inside : parent ? { name: parent.name, kind: parent.type ?? null } : null;
  return { name: at.name, kind: at.kind ?? at.type ?? null, inside: inside ?? null };
}
/**
 * The new place to open the grower's picker with, from a carried one that is not theirs: inside their own place of the
 * containing place's name when they have one (`parentId`); otherwise at the top level, with the name it had (`insideNamed`)
 * for the picker to say where it was (round seventy; triage-69 X2).
 */
export type StartPlace = { name: string; kind?: string | null; parentId: string | null; insideNamed: string | null };
export function startPlace(place: CarriedPlace | null, places: ReadonlyArray<{ id: string; name: string }>): StartPlace | null {
  if (typeof place?.name !== 'string' || !place.name.trim()) return null;
  const inside = place.inside && typeof place.inside.name === 'string' && place.inside.name.trim() ? place.inside : null;
  const parentId = inside ? ownPlaceNamed(inside, places) : null;
  return { name: place.name, kind: typeof place.kind === 'string' ? place.kind : null, parentId, insideNamed: inside && !parentId ? inside.name.trim() : null };
}

/** The address with `kept` taken off, once the draft is read, so a reload or a copied link is an ordinary visit. */
export function withoutKept(href: string): URL {
  const u = new URL(href);
  u.searchParams.delete(KEPT_PARAM);
  return u;
}
