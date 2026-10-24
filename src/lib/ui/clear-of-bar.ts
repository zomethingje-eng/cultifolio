/**
 * A field being filled never sits under a form's pinned action bar (round eighty-two; the independent review's 25: on
 * /plants/new at 489 by 627 the Add / Cancel bar covered the Acquired field). Focus moved by the keyboard is already
 * scrolled clear of every bar (`keepFocusClear`, focus.ts), and a tap is never scrolled after (round sixty; the outside
 * review's A39); what neither covered is the window shrinking under a field that has focus, as a phone's keyboard opening
 * does: the field tapped above the bar ends under it, and under the bar it stayed. So while a field has focus, each
 * change of the window's or the visual viewport's size checks it against the bar, and when the bar is pinned over it the
 * page is scrolled by just enough to bring the whole field above the bar.
 *
 * `bar` is the pinned bar; returns the cleanup.
 */
export function keepFieldsClearOf(bar: HTMLElement): () => void {
  const FIELDS = 'input, select, textarea, [contenteditable="true"]';
  let frame = 0;
  const check = () => {
    frame = 0;
    const f = document.activeElement;
    if (!(f instanceof HTMLElement) || !f.matches(FIELDS) || bar.contains(f)) return;
    if (getComputedStyle(bar).position !== 'sticky') return; // in the page's flow, it covers nothing
    const b = bar.getBoundingClientRect();
    const vv = window.visualViewport;
    const seenBottom = vv ? vv.offsetTop + vv.height : innerHeight;
    // The bar's top where the reader sees it: above the keyboard, the visual viewport's foot less the bar's height.
    const barTop = Math.min(b.top, seenBottom - b.height);
    const r = f.getBoundingClientRect();
    // Under the bar, or below it (under the tab bar, or past the window's foot): either way out of sight.
    if (b.height === 0 || r.bottom <= barTop - 8) return;
    // The field's whole height above the bar, never its top above the top bar.
    const by = Math.min(r.bottom - barTop + 12, Math.max(0, r.top - 112));
    if (by > 0) window.scrollBy(0, by);
  };
  const soon = () => { if (!frame) frame = requestAnimationFrame(check); };
  window.addEventListener('resize', soon);
  window.visualViewport?.addEventListener('resize', soon);
  return () => {
    window.removeEventListener('resize', soon);
    window.visualViewport?.removeEventListener('resize', soon);
    if (frame) cancelAnimationFrame(frame);
  };
}
