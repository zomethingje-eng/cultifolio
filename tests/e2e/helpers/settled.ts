import type { Page } from '@playwright/test';

/**
 * Fonts loaded, two frames drawn and one task run: by then a layout shift of the last frame has reached the page's
 * PerformanceObserver, so a CLS read after this reads every shift the page made up to now. What the page is waiting
 * for (Today's held sections, a sample bar) is the caller's to wait for first, by its own element; this replaces the
 * fixed pause that stood after it (round sixty-two; the round-sixty-one self-review's triage 6).
 */
export async function framesSettled(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise((r) => setTimeout(r, 0));
  });
}
