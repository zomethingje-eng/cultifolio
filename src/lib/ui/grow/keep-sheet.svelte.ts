/**
 * "Keep your plants" on an iPhone or iPad (round 116; MYPLANTS 26, docs/PLAN-IPHONE.md). The owner's device test of
 * 23 November 2026: Safari and the Home Screen app keep separate collections, and a label scanned with the Camera opens
 * Safari. WebKit's page says Safari may delete a site's stored data after seven days without the site being used.
 *
 * The sheet shows once after the first plant in Safari on an iPhone or iPad, and again a week after it was last shown
 * while nothing has been done: never in the Home Screen app, on Android or on a desktop, and never once sync is on or a
 * backup has been taken. The list's storage line opens it at any time (`keepSheet.open`).
 */
export const KEEP_SHEET_AT = 'cultifolio.keepSheetShownAt';
export const WEEK_MS = 7 * 86_400_000;

export const keepSheet = $state({ open: false });

/** Whether the sheet is due by itself now. `lastShown`: when it last showed (ms), or null. */
export function sheetDue(o: { iosSafari: boolean; plants: number; lastBackup: string | null | undefined; synced: boolean; lastShown: number | null; now: number; demo?: boolean }): boolean {
  if (!o.iosSafari || o.demo || o.plants < 1 || o.synced || o.lastBackup !== null) return false;
  return o.lastShown == null || o.now - o.lastShown >= WEEK_MS;
}

export function lastShown(): number | null {
  try { const v = Number(localStorage.getItem(KEEP_SHEET_AT)); return Number.isFinite(v) && v > 0 ? v : null; } catch { return null; }
}
/** Shown, or put off: the next time is a week from now. */
export function markShown(now = Date.now()): void {
  try { localStorage.setItem(KEEP_SHEET_AT, String(now)); } catch { /* shown again on the next page, at worst */ }
}

/** The list's storage line, true of the device it is read on. */
export function storageWords(iosSafari: boolean): { lead: string; act: string } {
  return iosSafari
    ? { lead: 'Kept in Safari on this device only, which may delete it after seven days unused:', act: 'keep your plants' }
    : { lead: 'Kept in this browser only:', act: 'back up or install the app' };
}
