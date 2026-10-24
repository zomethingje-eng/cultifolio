/**
 * One backup reminder at a time (round eighty-two; the independent review's 15: right after a restore one screen said
 * "16 plants and no backup yet", "Kept in this browser only: back up" and "This browser has not promised to keep your
 * data: take a backup now and then"). The layer's own line on My plants says here when it is on screen, and the page's
 * quiet line about the browser gives way to it; the browser's answer, said once as a toast, asks for a backup only where
 * no page line does and no backup or sync is there. None is said over an empty collection.
 */
export const backupReminder = $state({
  /** The layer's "N plants and no backup yet" line is on screen. */
  nudge: false,
  /** The page shows a notice of its own that asks for a backup (My plants' storage notice), and the layer's line gives way. */
  page: false
});

/** The pages that carry a line of their own about keeping the collection: My plants, Today and Backup. */
export const pageSaysKeeping = (path: string): boolean => path === '/plants' || path === '/today' || path === '/' || path === '/backup';
