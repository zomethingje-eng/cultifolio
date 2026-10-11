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
 */
import { PAGE_IN_DEMO } from '$lib/db/demo';
import { leaveExample } from './example.svelte';

export const DRAFT = 'cultifolio.keepDraft';
/** The address parameter that says a draft is waiting. */
export const KEPT_PARAM = 'kept';
export type DraftForm = 'plant' | 'batch' | 'place';
/** A place as carried: the name and the kind, for the grower's own form to find or make. */
export type CarriedPlace = { name: string; kind?: string | null };
export type Draft = { form: DraftForm; fields: Record<string, unknown>; place: CarriedPlace | null };

/** The form each draft is for, in the grower's own collection. */
export const KEEP_TO: Record<DraftForm, string> = { plant: '/plants/new?kept=1', batch: '/propagation/new?kept=1', place: '/places?kept=1#add' };

function write(d: Draft): boolean {
  try { sessionStorage.setItem(DRAFT, JSON.stringify(d)); return true; } catch { return false; }
}
function drop(): void {
  try { sessionStorage.removeItem(DRAFT); } catch { /* it goes with the tab */ }
}

/**
 * Inside the example: write the draft, set the form's own guard aside (`hold(true)`) so the browser does not ask "Leave
 * site?" after the visitor pressed a button promising to keep what they typed, and leave for the same form in the
 * grower's own collection. A Leave the visitor declines, or one called off, puts the guard back and drops the draft.
 */
export async function keepAsOwn(d: Draft, hold?: (on: boolean) => void): Promise<boolean> {
  write(d);
  hold?.(true);
  const back = () => { hold?.(false); drop(); };
  const going = await leaveExample(KEEP_TO[d.form], back);
  if (!going) back();
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
export function ownPlaceNamed(place: CarriedPlace | null, places: ReadonlyArray<{ id: string; name: string }>): string | null {
  const want = place?.name?.trim().toLowerCase();
  if (!want) return null;
  return places.find((l) => l.name.trim().toLowerCase() === want)?.id ?? null;
}

/** The address with `kept` taken off, once the draft is read, so a reload or a copied link is an ordinary visit. */
export function withoutKept(href: string): URL {
  const u = new URL(href);
  u.searchParams.delete(KEPT_PARAM);
  return u;
}
