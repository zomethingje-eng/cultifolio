import type { BrowserContext, Page } from '@playwright/test';

/**
 * Layout shift in every engine (round sixty-seven; triage-66 H3, S-E11, R45-28). The Layout Instability API
 * (`PerformanceObserver` of `layout-shift`) is Chromium's alone: WebKit and Firefox report no entries, so a shift check
 * there read 0 and proved nothing, and the tests that used it were left out of Safari's engine, where the iPhone meets the
 * shifts. This records where the watched elements are on every animation frame instead (`getBoundingClientRect`, which
 * every engine has) and reports each move of each element.
 *
 * Each selector is read as its first match a reader can see (a match of 2 px or less, such as a heading hidden for screen
 * readers alone, is passed over). A move is a change of an element's top or left (in the document, so a scroll of the
 * page is not one) by more than the tolerance, on the screen before or after it (one below the fold is not met). An
 * element that is absent, then present, is not a move; one that is present, then gone, then back somewhere else is.
 *
 * `startPositions` starts recording now, on a page already open; `positionsFromStart` records on every page of a context
 * from its first frame (a shift as the page loads, when its fonts arrive). `positionMoves` reads what was recorded.
 */
export type Move = { sel: string; at: number; from: { top: number; left: number }; to: { top: number; left: number } };

/** The recorder, run in the page. */
function record(sels: string[]): void {
  type Pos = { top: number; left: number; seen: boolean } | null;
  type Rec = { stop: boolean; moves: Array<{ sel: string; at: number; from: Pos; to: Pos }>; last: Map<string, Pos>; frames: number };
  const W = window as unknown as { __pos?: Rec };
  if (W.__pos) W.__pos.stop = true;
  const rec: Rec = { stop: false, moves: [], last: new Map(), frames: 0 };
  W.__pos = rec;
  const t0 = performance.now();
  // The first element of the selector a reader can see: one hidden for screen readers alone (a 1 px clipped heading) is
  // passed over, as the Layout Instability API passes it over.
  const read = (sel: string): Pos => {
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width > 2 && r.height > 2) return { top: Math.round(r.top + scrollY), left: Math.round(r.left + scrollX), seen: r.bottom > 0 && r.top < innerHeight };
    }
    return null;
  };
  const frame = () => {
    if (rec.stop) return;
    rec.frames++;
    for (const sel of sels) {
      const p = read(sel);
      const had = rec.last.get(sel);
      // A move counts where a reader sees it: on the screen before or after (the Layout Instability API's rule too).
      if (p && had && (had.top !== p.top || had.left !== p.left) && (had.seen || p.seen)) rec.moves.push({ sel, at: Math.round(performance.now() - t0), from: had, to: p });
      if (p) rec.last.set(sel, p);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

export async function startPositions(page: Page, selectors: string[]): Promise<void> {
  await page.evaluate(record, selectors);
}

/** Record on every page of `target` from its first frame, before its own scripts run. */
export async function positionsFromStart(target: BrowserContext | Page, selectors: string[]): Promise<void> {
  await target.addInitScript(record, selectors);
}

/** The moves recorded so far, larger than `tolerance` px, and the frames read; recording stops. */
export async function positionMoves(page: Page, tolerance = 1): Promise<{ moves: Move[]; frames: number }> {
  return page.evaluate((tol) => {
    type M = { sel: string; at: number; from: { top: number; left: number }; to: { top: number; left: number } };
    const rec = (window as unknown as { __pos?: { stop: boolean; moves: M[]; frames: number } }).__pos;
    if (!rec) return { moves: [] as M[], frames: 0 };
    rec.stop = true;
    return { moves: rec.moves.filter((m) => Math.abs(m.from.top - m.to.top) > tol || Math.abs(m.from.left - m.to.left) > tol), frames: rec.frames };
  }, tolerance);
}
