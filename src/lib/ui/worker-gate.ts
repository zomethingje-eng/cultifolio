/**
 * When the service worker is registered (round seventy-three; REVIEW-ROUND-72 §7, self-F 10, the owner's decision).
 *
 * The worker's install fetches the whole build, the static files, the collection's shells and `/`: about half of a first
 * visit's bytes and requests (1.0 to 1.7 MB, 150 to 217 requests on the live site), spent on a reader who may only ever
 * read one species page. So the worker is registered:
 *
 * - at once on a device that already has one (it keeps its worker, and its update check, as before);
 * - at once on a page of the grower's own collection (My plants, Places, Propagation, Today, Sync, Labels, Backup, the
 *   import, the frost redirect), and as soon as the device holds a collection (a plant added, a species followed, a
 *   restore or an import merged, sync set up), from whichever page that happens on;
 * - otherwise from the visitor's second page on this device: a second page loaded in full, a reload or a move inside the
 *   app to another address, counted in `cultifolio.views` (one or two; nothing else is kept). Without storage the count
 *   is the page's own, so a move inside the app still counts.
 *
 * Once registered it behaves as before. Settings is not a collection page: a first visit there holds nothing to keep.
 */
export const VIEWS_KEY = 'cultifolio.views';

/** The collection's own pages: their first visit registers the worker, since a grower's next visit may be offline. */
export const COLLECTION_PATH = /^\/(plants|places|propagation|today|sync|labels|backup|frost)(\/|$)/;

export type Gate = {
  /** A worker already registered on this device (a controller, or a registration found). */
  registered: boolean;
  /** Pages viewed on this device so far, this one included. */
  views: number;
  /** The page's path. */
  path: string;
  /** Records the device's collection holds (the fold's count, removed ones included); null until it has opened. */
  records: number | null;
  /** Whether sync is set up on this device. */
  syncing: boolean;
};

/** Whether the worker is registered now. */
export function registerNow(g: Gate): boolean {
  return g.registered || COLLECTION_PATH.test(g.path) || g.views >= 2 || (g.records ?? 0) > 0 || g.syncing;
}

/**
 * A page view counted: the session's count, raised to what the device has kept, plus this one; kept as one or two.
 * Storage that is missing or throws (a private window, blocked site data) leaves the page's own count.
 */
export function countView(session: number): number {
  let kept = 0;
  try { kept = Math.min(2, Number(localStorage.getItem(VIEWS_KEY)) || 0); } catch { /* none kept */ }
  const n = Math.min(2, Math.max(session, kept) + 1);
  try { if (n > kept) localStorage.setItem(VIEWS_KEY, String(n)); } catch { /* the page's count stands */ }
  return n;
}
