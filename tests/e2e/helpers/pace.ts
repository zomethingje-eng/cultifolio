import { test } from '@playwright/test';

/**
 * The pace of Safari's engine's IndexedDB on the owner's PC, for the waits that follow a write (round sixty-five; the
 * all-engines rerun). Playwright's WebKit there answers about one IndexedDB request every 16 ms, however many are asked
 * for at once, where Chromium and Firefox answer thousands a second:
 *
 * - r62g 3 writes 6,000 changes straight into the database (12,000 requests) and took 3.2 min in WebKit, 4.4 s in Chromium;
 * - r61g 4 adds 300 plants in groups of 50 (about 2,700 requests a group) and had added 150 when its 200 s ran out;
 * - the example collection is one write of about 1,300 requests: 21 s, against the 20 s every test gave it, so it was
 *   never set out in time, and in round sixty-four once, just;
 * - a second import of 5 plants (about 310 requests) ran past the 5 s an assertion waits, and the first, of 3 (about 240),
 *   did not.
 *
 * Nothing was held: each of these is the same write at that pace (the counts are from tests/e2e/r65x-trace.spec.ts's
 * wrapping of IndexedDB in Chromium). A wait that follows a write is therefore given the write's own time in WebKit, from
 * the number of requests it makes, at 20 ms each (16 measured, with room); elsewhere it is what it was.
 */
export const WEBKIT_MS_PER_REQUEST = 20;

/** Whether this test runs in Safari's engine (the desktop project or the phone's). */
export function inWebKit(): boolean {
  return /webkit/.test(test.info().project.name);
}

/** A wait of `base` ms for a write of about `requests` IndexedDB requests: in WebKit, `base` plus the requests at its pace. */
export function writeWait(base: number, requests: number): number {
  return inWebKit() ? base + requests * WEBKIT_MS_PER_REQUEST : base;
}

/** The example collection is set out in one write of about 1,300 requests (twelve plants, their places, lines and batch). */
export const SEED_REQUESTS = 1_300;

/** The wait for the example collection to be set out, after the page that sets it out has opened: 20 s, and in WebKit 46 s. */
export function seedWait(): number {
  return writeWait(20_000, SEED_REQUESTS);
}

/** In WebKit, the test's own time grows by the waits its writes need: `ms` more (call it before the first write). */
export function allowWrites(ms: number): void {
  if (inWebKit()) test.setTimeout(test.info().timeout + ms);
}
