/**
 * The lead photograph shown whole when it is upright (round eighty-five; outside review A's 9g and 16c). The hero is a
 * 4:3 box on a desktop and a wide band on a phone; an upright photograph was cut to its middle third there, and a source
 * that states no size (GBIF's media) cannot be known upright until it has loaded: Hoodia alstonii's 319 by 480 stem was
 * a 343 by 150 slice on a phone. Once loaded, an upright lead is drawn whole in the box, over a blurred fill of itself, so
 * the box keeps its size and nothing below moves. Read on load, or at once when it loaded before the page's scripts.
 */
export function isUpright(w: number, h: number): boolean {
  return w > 0 && h > w * 1.05;
}

export function leadShape(im: HTMLImageElement) {
  const box = im.closest<HTMLElement>('.hero');
  const set = () => {
    if (!box || !im.naturalWidth) return;
    const tall = isUpright(im.naturalWidth, im.naturalHeight);
    box.classList.toggle('tall', tall);
    if (tall) box.style.setProperty('--lead', `url("${(im.currentSrc || im.src).replace(/["\\]/g, (c) => encodeURIComponent(c))}")`);
  };
  if (im.complete) set();
  im.addEventListener('load', set);
  return { destroy: () => im.removeEventListener('load', set) };
}
