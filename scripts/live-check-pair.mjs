/**
 * The live check's held pair (round seventy-eight), apart from the check so it can be tested without the network (round
 * seventy-nine). Plain Node, no dependencies; `scripts/live-check.mjs` passes its own `get`.
 *
 * The Worker's cache is each data centre's own, and two requests a moment apart can be answered by two (the owner's PC,
 * 2026-10-19: Ashburn, then Newark, by turns), so a second request answered by another centre than the first, or before
 * the first one's copy was stored, is asked again, up to five pairs a second apart. A pair whose second is held is
 * returned at once; otherwise the last pair, which fails the check. The front page and the species page both use it.
 */

/** The data centre that answered: the three letters at the end of Cloudflare's ray id ('' from a local `wrangler dev`). */
export const colo = (r) => /-([A-Z]{3})$/.exec(r.h('cf-ray'))?.[1] ?? '';

/** `get(path, init)` twice, until the second says `x-cultifolio-page: held`, at most `pairs` times, `waitMs` apart. */
export async function heldPair(get, path, init, { pairs = 5, waitMs = 1000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let a, b;
  for (let t = 0; t < pairs; t++) {
    if (t) await sleep(waitMs);
    a = await get(path, init);
    b = await get(path, init);
    if (b.h('x-cultifolio-page') === 'held') return { a, b, tries: t + 1 };
  }
  return { a, b, tries: pairs };
}

/** The words a failed pair ends with: which centres answered its last pair. */
export const centres = (a, b) => (colo(a) || colo(b) ? ` (answered by ${colo(a) || '?'}, then ${colo(b) || '?'}, after five pairs)` : ' (after five pairs)');
