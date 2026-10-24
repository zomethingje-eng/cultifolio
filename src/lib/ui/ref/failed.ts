/**
 * A server-rendered image can fail before hydration attaches its `onerror`, and then nothing hears of it: the browser drew
 * its broken-image glyph on compare and the front page (round sixty; visitor 4). As an action this runs once the element
 * is live: an image that already finished with no pixels is reported at once, and a later failure through the listener.
 */
export function failedBeforeHydration(img: HTMLImageElement, onFail: (img: HTMLImageElement) => void) {
  let fn = onFail;
  const check = () => { if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) fn(img); };
  img.addEventListener('error', () => fn(img));
  check();
  // Only a function replaces the one heard: a caller that passed this update on with a value of its own (compare's key)
  // made `fn` a string, and the next failure threw "n is not a function" (round eighty-two; the second review's lead).
  return { update(next: (img: HTMLImageElement) => void) { if (typeof next === 'function') fn = next; } };
}
