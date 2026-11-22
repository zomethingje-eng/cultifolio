/**
 * One backup reminder at a time (round eighty-two; the independent review's 15: right after a restore one screen said
 * "16 plants and no backup yet", "Kept in this browser only: back up" and "This browser has not promised to keep your
 * data: take a backup now and then"). The layer's own line on My plants says here when it is on screen, and the page's
 * quiet line about the browser gives way to it; the browser's answer, said once as a toast, asks for a backup only where
 * no page line does and no backup or sync is there. None is said over an empty collection.
 */
export const backupReminder = $state({
  /** The layer's "N plants and no backup yet" line is due on My plants (the list draws it, in its notices' place). */
  nudge: false,
  /** The page shows a notice of its own that asks for a backup (My plants' storage notice), and the layer's line gives way. */
  page: false,
  /**
   * Whether the line's question is settled for this load (the last backup read, or no line possible): My plants draws its
   * list and its notices together once it is, so the line never arrives over a list already drawn (round eighty-four; P2,
   * A12: drawn above the title a moment after it, the line moved the whole page down, a shift of 0.09 to 0.23).
   */
  known: false,
  /** Put away for this tab on request ("Not now"). */
  hidden: false
});

const NUDGE_HIDDEN = 'cultifolio.backupNudgeHidden';
/** "Not now" on this device, for good (round 107). */
const NUDGE_DONE = 'cultifolio.backupNudgeDone';
/**
 * The plants a collection holds when the line first asks (round 107; the first hand-off's round 7: "remind once at the
 * tenth plant"). It asked from the fifth, on every visit to My plants until a backup or "Not now" for the tab.
 */
export const NUDGE_AT = 10;
/**
 * Whether the line is due: once the collection holds NUDGE_AT plants or more (any status: each is a record to lose), with
 * no backup ever taken here and no sync, until a backup, sync or "Not now", which puts it away on this device for good.
 */
export function nudgeDue(o: { plants: number; lastBackup: string | null | undefined; synced: boolean; putAway: boolean }): boolean {
  return o.plants >= NUDGE_AT && o.lastBackup === null && !o.synced && !o.putAway;
}
/** "Not now": the line put away on this device, for good, and for this tab where the device's storage is refused. */
export function hideNudge(): void {
  backupReminder.hidden = true;
  try { localStorage.setItem(NUDGE_DONE, '1'); } catch { /* the tab's key below still holds it */ }
  try { sessionStorage.setItem(NUDGE_HIDDEN, '1'); } catch { /* fine: put away for this page */ }
}
/** Whether the line was put away: on this device, or in this tab (the key tests and round 82's tabs set), read on each page. */
export function nudgeHidden(): boolean {
  if (backupReminder.hidden) return true;
  try { if (localStorage.getItem(NUDGE_DONE) === '1') return true; } catch { /* read the tab's */ }
  try { return sessionStorage.getItem(NUDGE_HIDDEN) === '1'; } catch { return false; }
}

/** The pages that carry a line of their own about keeping the collection: My plants, Today and Backup. */
export const pageSaysKeeping = (path: string): boolean => path === '/plants' || path === '/today' || path === '/' || path === '/backup';
