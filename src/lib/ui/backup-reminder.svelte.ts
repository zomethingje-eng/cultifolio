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
/** "Not now": the line put away for this tab's life. */
export function hideNudge(): void {
  backupReminder.hidden = true;
  try { sessionStorage.setItem(NUDGE_HIDDEN, '1'); } catch { /* fine: put away for this page */ }
}
/** Whether the line was put away in this tab, read again on each page. */
export function nudgeHidden(): boolean {
  try { return backupReminder.hidden || sessionStorage.getItem(NUDGE_HIDDEN) === '1'; } catch { return backupReminder.hidden; }
}

/** The pages that carry a line of their own about keeping the collection: My plants, Today and Backup. */
export const pageSaysKeeping = (path: string): boolean => path === '/plants' || path === '/today' || path === '/' || path === '/backup';
