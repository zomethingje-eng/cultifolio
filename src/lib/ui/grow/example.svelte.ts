/**
 * The example collection as an offer on an empty grower page (round sixty-three, V2; the owner's words: a visitor "isn't
 * given the knowledge of the app's capabilities" until a first plant is added). Since round seventy-four (the owner's
 * decision: a new visitor starts on the real site, blank) nothing opens it by itself: an empty Today, My spaces or
 * Propagation on a device whose own collection is empty shows its own empty state with one button, "Show the example
 * collection", and so does an empty My plants (`TrySample`). "Example" is the word on the page; the code keeps "sample"
 * (`$lib/db/demo`).
 *
 * Opened on the page the button is on, never on the tap that leads to it (round sixty-three, the fix pass; R1, 1): a
 * full load from a page with nothing of the grower's typed on it, so no page's own "Leave this page?" is skipped.
 *
 * Its own file, not the grow barrel, which the root layout must not import (scripts/check-bundle.mjs).
 */
import { goto } from '$app/navigation';
import { collection } from '$lib/db/collection.svelte';
import { PAGE_IN_DEMO, enterDemo, inDemo, leaveDemo, sampleEdits } from '$lib/db/demo';
import { readSetting } from '$lib/ui/stored';
import { sync } from '$lib/sync/engine.svelte';
import { replaceWaiting } from '$lib/db/vault';

/**
 * The grower's own collection holds nothing: its log folds to no record at all, live or removed, and no frost site is set
 * (round sixty-seven; triage-66 V4; S-A2, R45-20, IND-3). The test was the layout's grower test and a place (round
 * sixty-three, V2), and the example opened over a grower's frost site, a species' own notes, a removed plant and a
 * numbering scheme, telling them "No site set" or "Your own starts when you add a plant". Nor is a device empty whose
 * records are all held (stamped ahead of its clock) or parked, which Today says as "N changes waiting", or one with sync
 * set up, which is a grower's device whose records may still be on their way (round sixty-three, the fix pass; R1, 2 and
 * 5). Meaningful only once the collection is open and sync's key has been read (`example.settled`), and only outside the
 * example, where the site read is the grower's own.
 *
 * Nor is a device empty whose replacement from a backup is waiting to finish (round sixty-nine; triage-68 X4; S-C3): its
 * live log is wiped and the whole collection waits in the staging database for room, so the example opened over it,
 * dropped the vault's notice saying why, and wrote some 150 changes on a device that was out of space. Nor one whose log
 * holds changes this build could not read (`malformed`, round sixty-seven R10): it has something in it.
 */
export function ownEmpty(): boolean {
  return records() === 0 && !siteSet()
    && collection.heldWaiting === 0 && collection.parkedRecords === 0 && !sync.configured
    && !replaceWaiting() && !(collection as typeof collection & { malformed?: number }).malformed;
}
/**
 * How many records the fold holds, removed ones included. `recordCount` is the collection's own count (round
 * sixty-seven); before it, the changes the page's load folded, which is no smaller: every record is one change or more.
 */
function records(): number {
  const c = collection as typeof collection & { recordCount?: number; loaded?: { changes?: number } };
  if (typeof c.recordCount === 'number') return c.recordCount;
  return Math.max(c.loaded?.changes ?? 0, collection.accessions.length + collection.sowings.length + collection.locations.length + collection.taxa.length);
}
/** A frost site is set on this device: the frost watch the welcome offers works without a plant, and a visitor who set one has begun. */
function siteSet(): boolean {
  return !!readSetting('cultifolio.frost.site', 'collection');
}

/**
 * What the bar and the pages share: the example being set out (DemoBar); this tab on its way into it; the work in
 * progress on this device that a page load would cut off (a restore or merge, an import), counted so two never clear
 * each other; and whether the layout has read the collection and sync's key, before which nothing is decided.
 */
export const example = $state({ seeding: false, entering: false, busy: 0, settled: false, leaving: false, leftover: 0 });

/**
 * Run `work` as work a page load must not cut off (a restore, a merge, an import): while it runs, no page goes into the
 * example from a button, since that is a full load (round sixty-three, the fix pass; R1, 2). The work goes on
 * when the grower moves to another page in the app, as it always did.
 */
export async function keepWorking<T>(work: () => Promise<T>): Promise<T> {
  example.busy++;
  try {
    return await work();
  } finally {
    example.busy--;
  }
}

/** A restore, a merge, an import or a sync run is in progress on this device: a page load now would cut it off. */
export function working(): boolean {
  return example.busy > 0 || !!sync.busy;
}

/**
 * This page offers the example (round seventy-four): the collection is open and sync's key read, the page is outside
 * the example, and the device's own collection is empty. Offered, never opened: only the button opens it.
 */
export function offersHere(): boolean {
  return collection.ready && example.settled && !PAGE_IN_DEMO && !inDemo() && ownEmpty();
}

/** The button's words, and the one sentence beside it: the same on every page that offers the example (round seventy-four). */
export const SHOW_EXAMPLE = 'Show the example collection';
export const EXAMPLE_APART = 'A sample kept apart from your own collection, which you can close at any time.';

/** Why "Show the example collection" did not open it: the tab's storage refused the flag, or work in progress here would be cut off. */
export type NotEntered = 'refused' | 'busy';

/** What a button says when the example did not open, so a press is never answered with nothing (rule 2; R1, 7). */
export function notEnteredWords(why: NotEntered): string {
  return why === 'busy'
    ? 'Something is still being stored on this device (a restore, an import or a sync), and opening the example now would cut it off. Try again once it has finished.'
    : 'The example collection needs this tab\'s own storage, which this browser has turned off here (a private window, or site data blocked).';
}

/**
 * Into the example, on `to`: a full load, so only from a page with nothing of the grower's in it (a page that has just
 * arrived, or one whose own guard has run: `openExample`). Not while work is in progress here, nor when the tab's
 * storage refuses the flag; the page then shows its own empty state with the offer, and says why. While the next page
 * loads, the page says "Opening the example collection". A load the page calls off (a "Leave site?" answered Cancel)
 * leaves the tab as it was: out of the example (R1, 1).
 */
export function enterExample(to: string): true | NotEntered {
  if (working()) return 'busy';
  if (settledNow()) return into(to);
  // Pressed while the collection is still opening (round sixty-nine; triage-68 X5; IND-7): the bar's words wait for the
  // settled test, and the page says "Opening the example collection" meanwhile. The note's slot is written now, which
  // also asks the tab's storage whether it takes the flag, so a refusal is still said at the press.
  try { sessionStorage.setItem(OWN_NOTE, '?'); } catch { return 'refused'; }
  example.entering = true;
  void whenSettled().then(() => {
    if (!example.entering) return;
    if (working() || into(to) !== true) example.entering = false;
  });
  return true;
}
function into(to: string): true | NotEntered {
  noteOwn();
  example.entering = true;
  if (enterDemo(to, () => (example.entering = false))) return true;
  example.entering = false;
  return 'refused';
}
/** The layout has read the collection and sync's key: "empty" means something. */
function settledNow(): boolean {
  return collection.ready && example.settled;
}
/** Settled, or `ms` gone by first (a collection that never opens): false then, and the note says "not known". */
async function whenSettled(ms = 10_000): Promise<boolean> {
  const end = Date.now() + ms;
  while (!settledNow()) {
    if (Date.now() > end) return false;
    await new Promise((r) => setTimeout(r, 25));
  }
  return true;
}

/**
 * "See the example collection" from the menu, which is on every page: first the app's ordinary move to `to`, which runs
 * the page's own "Leave this page?" (a half-typed plant, an import's list), then into the example from there. A move the
 * grower calls off ends here, with nothing changed ('stayed').
 */
export async function openExample(to: string): Promise<true | NotEntered | 'stayed'> {
  if (working()) return 'busy';
  if (location.pathname !== to) {
    await goto(to);
    if (location.pathname !== to) return 'stayed';
  }
  if (example.entering) return true; // already on its way in (a second press)
  return enterExample(to);
}

/**
 * Whether the grower had a collection of their own when they opened the example, for the bar's words (round sixty-seven;
 * triage-66 V4; S-A11): read here, outside the example, by the same test as the page's "empty", and kept with the
 * example's own copies (`cultifolio.demo.own`), which Leave clears. The bar read the layout's hint, which counts plants,
 * batches and followed species only, and told a grower with places "Your own starts when you add a plant".
 *
 * Only the settled test says "none" (round sixty-nine; triage-68 X5; IND-7): a collection still opening is not known,
 * and the hint, which counts no places, is taken as a yes but never as a no. '?' is "not known".
 */
export const OWN_NOTE = 'cultifolio.demo.own';
function noteOwn(): void {
  const own = settledNow() ? (ownEmpty() ? '0' : '1') : hintSaysOwn() ? '1' : '?';
  try { sessionStorage.setItem(OWN_NOTE, own); } catch { /* the bar then reads the hint */ }
}
function hintSaysOwn(): boolean {
  try { return localStorage.getItem('cultifolio.hasMine') === '1'; } catch { return false; }
}
/** In the example: whether the grower has a collection of their own, as noted when they opened it; null when not known. */
export function hadOwn(): boolean | null {
  let v: string | null = null;
  try { v = sessionStorage.getItem(OWN_NOTE); } catch { /* not known */ }
  if (v === '1' || v === '0') return v === '1';
  return hintSaysOwn() ? true : null;
}

/**
 * Leave the example for `to` in the grower's own collection (the bar's Leave and "Add your first plant", and every "add"
 * pressed inside it): asks first when the visitor added or changed records here, saying how many (round sixty-two; A9),
 * then the tab navigates, and the next page deletes the example. False when the visitor answered no. A page's own "Leave
 * site?" answered Cancel keeps the tab as it was, and `example.leaving` comes back at once.
 */
export async function leaveExample(to = '/', onStay?: () => void): Promise<boolean> {
  if (example.leaving) return false;
  const n = await sampleEdits();
  if (n && !confirm(`Leave the example collection? The ${n === 1 ? 'record you added or changed here is' : `${n} records you added or changed here are`} deleted with it.`)) return false;
  example.leaving = true;
  leaveDemo(to, () => { example.leaving = false; onStay?.(); });
  return true;
}
/**
 * An "add" pressed in the example leads out of it first (round sixty-seven; triage-66 V1; S-A1, R45-1): the top bar's
 * "+", "Add one to my plants", Places' "New place", Propagation's "New batch", My plants' Add. A first plant typed into
 * the example was numbered after its twelve and deleted with it. For a link's `onclick`: outside the example it does
 * nothing and the link goes as it would; inside, the link is not followed and the example is left for `href`. True when
 * it took the press.
 */
export function addLeavesExample(e: Event | null, href: string): boolean {
  if (!PAGE_IN_DEMO) return false;
  e?.preventDefault();
  void leaveExample(href);
  return true;
}
