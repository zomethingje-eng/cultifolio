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
  return { update(next: (img: HTMLImageElement) => void) { fn = next; } };
}
