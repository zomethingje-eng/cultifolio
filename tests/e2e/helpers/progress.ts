import type { BrowserContext, Page } from '@playwright/test';

/**
 * A wait that follows the store's own progress rather than a time worked out beforehand (round seventy-five; the harness,
 * H). smoke-3's backup of four hundred plants failed once in WebKit on the owner's PC: the merge's 2,000 changes (about
 * 6,000 IndexedDB requests) were given `writeWait(5_000, 6_000)`, 125 s, from the 16 ms a request measured on that PC
 * with room to 20 ms; under the whole run's load the requests came slower, and the restore was still writing when the
 * time ran out. Any fixed time is a guess at the machine's speed. This one asks instead whether the page is still being
 * answered by its database: the page counts every IndexedDB request answered (`watchStorage`, installed before the page's
 * scripts), and `whileStoring` waits for its check in windows of `stallMs`, starting another window as long as the
 * count moved in the last one. A write that is under way is waited for however slow the engine; one that has stopped
 * fails after one quiet window, with the check's own message. The test's own time is the outer bound.
 */

/** Installs the counter on every page of the context (or the page's context), before the page's own scripts. */
export async function watchStorage(target: Page | BrowserContext): Promise<void> {
  await target.addInitScript(counter);
}

/** Runs in the page: every IndexedDB request's answer (success or error) adds one to `window.__idbAnswered`. */
function counter(): void {
  const w = window as unknown as { __idbAnswered: number };
  if (typeof w.__idbAnswered === 'number') return;
  w.__idbAnswered = 0;
  const tick = () => { w.__idbAnswered++; };
  const watch = (r: unknown) => {
    try { (r as IDBRequest).addEventListener('success', tick); (r as IDBRequest).addEventListener('error', tick); } catch { /* not a request */ }
    return r;
  };
  const wrap = (proto: object | undefined, names: string[]) => {
    if (!proto) return;
    for (const name of names) {
      const real = (proto as Record<string, unknown>)[name];
      if (typeof real !== 'function') continue;
      (proto as Record<string, unknown>)[name] = function (this: unknown, ...args: unknown[]) { return watch((real as (...a: unknown[]) => unknown).apply(this, args)); };
    }
  };
  const methods = ['put', 'add', 'get', 'getAll', 'getAllKeys', 'getKey', 'count', 'delete', 'clear', 'openCursor', 'openKeyCursor'];
  wrap(typeof IDBObjectStore !== 'undefined' ? IDBObjectStore.prototype : undefined, methods);
  wrap(typeof IDBIndex !== 'undefined' ? IDBIndex.prototype : undefined, methods.filter((m) => !['put', 'add', 'delete', 'clear'].includes(m)));
  // A cursor's each step answers on the request that opened it, which already counts its successes.
  wrap(typeof IDBFactory !== 'undefined' ? IDBFactory.prototype : undefined, ['open', 'deleteDatabase']);
}

/** How many IndexedDB requests the page has had answered; -1 when it cannot be read (the page is between documents). */
export async function storageAnswers(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __idbAnswered?: number }).__idbAnswered ?? -1).catch(() => -1);
}

/**
 * Waits for `check` (an assertion given its timeout) while the page's database keeps answering: each window of `stallMs`
 * in which the check has not passed but the count moved starts another window; a window with no answer at all rethrows
 * the check's own failure. Returns the windows it took, for a test that wants to say so.
 */
export async function whileStoring(page: Page, check: (timeout: number) => Promise<unknown>, stallMs = 30_000): Promise<number> {
  let before = await storageAnswers(page);
  for (let windows = 1; ; windows++) {
    try {
      await check(stallMs);
      return windows;
    } catch (e) {
      const now = await storageAnswers(page);
      if (now > before) { before = now; continue; }
      throw e;
    }
  }
}
