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

/**
 * The page gone quiet: no request of the page's in flight and none begun for `ms`, then two frames drawn (round
 * eighty-five, Q; outside review A23's fixed sleeps). What a negative waits for, in place of a fixed pause: "nothing
 * more follows" is read once the page has stopped asking for anything, so a slow engine (WebKit on the owner's PC) is
 * given the time it takes, and a quick one is not held for a guess. A page that never goes quiet fails here, at
 * `timeout`, saying how many requests were still out.
 *
 * Requests are counted from the moment of the call: one already in flight then is waited for by its own end, as
 * Playwright reports it, or by `timeout`.
 */
export async function goneQuiet(page: Page, ms = 500, timeout = 20_000): Promise<void> {
  const out = new Set<unknown>();
  let last = Date.now();
  const began = (r: unknown) => { out.add(r); last = Date.now(); };
  const ended = (r: unknown) => { out.delete(r); last = Date.now(); };
  page.on('request', began);
  page.on('requestfinished', ended);
  page.on('requestfailed', ended);
  try {
    const t0 = Date.now();
    for (;;) {
      if (!out.size && Date.now() - last >= ms) break;
      if (Date.now() - t0 > timeout) throw new Error(`the page did not go quiet in ${timeout} ms: ${out.size} request(s) still out`);
      await new Promise((r) => setTimeout(r, Math.min(50, ms)));
    }
  } finally {
    page.off('request', began);
    page.off('requestfinished', ended);
    page.off('requestfailed', ended);
  }
  await framesSettled(page);
}
