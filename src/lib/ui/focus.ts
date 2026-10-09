import { tick } from 'svelte';

/**
 * Focus the element a control was replaced by (a "×" that becomes "Remove?", "Archive" that becomes "Mark growing"):
 * without this, replacing the focused button drops keyboard focus to the top of the page mid-action (round eighteen, 14).
 * Runs after the next render, and only if the replacement exists.
 */
export async function focusNext(selector: string): Promise<void> {
  await tick();
  (document.querySelector(selector) as HTMLElement | null)?.focus();
}

/** The scroll behaviour the reader asked for: smooth, unless reduced motion is preferred (round fifty-eight; the accessibility review). */
export function motion(): ScrollBehavior {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

/* ---- focus never under a bar (WCAG 2.4.11; round fifty-nine) ---- */

/** The bar an element belongs to: itself or its nearest ancestor that is fixed or sticky, or marked `data-cover`. */
function barOf(n: Element | null): HTMLElement | null {
  for (let e = n as HTMLElement | null; e && e !== document.body && e !== document.documentElement; e = e.parentElement) {
    if (e.dataset?.cover) return e;
    const p = getComputedStyle(e).position;
    if (p === 'fixed' || p === 'sticky') return e;
  }
  return null;
}

/**
 * Where a bar sits once it has settled. A bar sliding back in (the phone's tab bar returns when a text field takes
 * focus) is measured where it will stop, its transform left out; one marked `data-away` is leaving, and is measured
 * where it is now, which is off the screen.
 */
function settled(bar: HTMLElement): DOMRect {
  const r = bar.getBoundingClientRect();
  if (!bar.dataset.cover || bar.dataset.away === 'true') return r;
  const t = getComputedStyle(bar).transform;
  if (!t || t === 'none') return r;
  const m = new DOMMatrixReadOnly(t);
  return new DOMRect(r.x - m.m41, r.y - m.m42, r.width, r.height);
}

/**
 * The part of the window the reader sees: the visual viewport where the browser has one (a phone's keyboard or a pinch
 * zoom shrinks it; `innerHeight` does not), in the layout viewport's coordinates (round sixty; the outside review's A39).
 */
function viewport(): { top: number; bottom: number } {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  return vv ? { top: vv.offsetTop, bottom: vv.offsetTop + vv.height } : { top: 0, bottom: innerHeight };
}

/** One edge's stack of bars, from the edge inwards, found by asking what is drawn there: the top bar, then whatever sticks under it, and so on. Returns the inner edge of the stack. */
function stack(x: number, from: 'top' | 'bottom', el: HTMLElement): number {
  const H = innerHeight;
  const v = viewport();
  let edge = from === 'top' ? Math.max(0, v.top) : Math.min(H, v.bottom);
  const seen = new Set<HTMLElement>();
  for (let i = 0; i < 5; i++) {
    const y = from === 'top' ? edge + 1 : edge - 1;
    if (y < 0 || y > H) break;
    let found: HTMLElement | null = null;
    for (const hit of document.elementsFromPoint(x, y)) {
      const bar = barOf(hit);
      if (!bar || seen.has(bar) || bar.contains(el)) continue;
      const r = settled(bar);
      if (r.height <= 0 || r.height > H / 2) continue; // a full-screen layer (a dialog, the menu's scrim) is not a bar
      if (from === 'top' ? r.top <= y + 0.5 && r.bottom > y : r.bottom >= y - 0.5 && r.top < y) { found = bar; break; }
    }
    if (!found) break;
    seen.add(found);
    const r = settled(found);
    edge = from === 'top' ? Math.max(edge, r.bottom) : Math.min(edge, r.top);
  }
  // Bars marked by hand that do not touch the edge (the compare tray floats 16 px above it, select mode's bar 8 px above
  // the tab bar): counted where they cross the element's column. Only while they float: select mode's bar is static on a
  // short screen and sticky bars rest in their place at the list's end, and one in the page's flow before or after the
  // element covers nothing (round sixty-two; the accessibility review, 1).
  const er = el.getBoundingClientRect();
  for (const bar of document.querySelectorAll<HTMLElement>(`[data-cover="${from}"]`)) {
    if (seen.has(bar) || bar.contains(el)) continue;
    const pos = getComputedStyle(bar).position;
    if (pos !== 'fixed' && pos !== 'sticky') continue;
    const r = settled(bar);
    if (r.height <= 0 || r.width <= 0 || r.right <= er.left || r.left >= er.right || r.bottom <= 0 || r.top >= H) continue;
    if (from === 'bottom' ? r.bottom <= er.top : r.top >= er.bottom) continue; // wholly before the element (a bottom bar above it, a top bar below): not over it
    edge = from === 'top' ? Math.max(edge, r.bottom) : Math.min(edge, r.top);
  }
  return edge;
}

/**
 * When focus moves by keyboard to an element a sticky or fixed bar covers (the top bar, the plants list's tool row, a
 * species page's section row, the phone's tab bar, the compare tray), scroll it clear by the overlap and 8 px. The
 * browser scrolls a focused element into view only when it is off the screen; one already on the screen under a bar
 * stayed there, and `scroll-margin` did nothing for it (round fifty-nine). Bars are found by what is drawn at the
 * screen's edges, so a page's own sticky row counts without being listed; `data-cover="top|bottom"` marks one that
 * floats off the edge. Installed once, by the root layout.
 */
/** A date or time field, which Chromium does not report as `:focus-visible` when reached by Tab or Shift+Tab: taken as keyboard focus unless a pointer moved it (round sixty; the accessibility review, 3). */
export const isDateField = (el: Element): boolean => el instanceof HTMLInputElement && /^(date|time|month|week|datetime-local)$/.test(el.type);

export function keepFocusClear(): () => void {
  let frame = 0;
  /**
   * How focus last moved: a key, or a pointer or touch. A tap is the reader's own aim and is never scrolled after (a text
   * field always matches `:focus-visible`, so a tap on one partly under the bar scrolled the page under the finger), and
   * a key always is, a date field included, which Chromium does not report as `:focus-visible` (round sixty; the outside
   * review's A39, the accessibility review, 3).
   */
  let modality: 'key' | 'pointer' | null = null;
  const onKey = (e: KeyboardEvent) => { if (!e.metaKey && !e.ctrlKey && !e.altKey) modality = 'key'; };
  const onPointer = () => { modality = 'pointer'; };
  const check = (el: HTMLElement) => {
    if (document.activeElement !== el || !el.isConnected) return;
    if (modality === 'pointer') return;
    if (modality !== 'key' && !isDateField(el)) {
      let fv = true;
      try { fv = el.matches(':focus-visible'); } catch { /* an old engine: treat it as keyboard focus */ }
      if (!fv) return;
    }
    for (let n: HTMLElement | null = el; n; n = n.parentElement) if (getComputedStyle(n).position === 'fixed') return; // a bar's own control, a dialog: the page's scroll does not move it
    // A row that scrolls sideways (the plants list's chips on a phone) was left scrolled past the chip Shift+Tab reached:
    // the row is brought round to it first, by its own scroll alone (round fifty-nine; measured on /plants at 390).
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      if (n.scrollWidth <= n.clientWidth + 1 || !/(auto|scroll)/.test(getComputedStyle(n).overflowX)) continue;
      const nr = n.getBoundingClientRect(), r = el.getBoundingClientRect();
      if (r.left < nr.left) n.scrollBy({ left: r.left - nr.left - 16, behavior: 'instant' as ScrollBehavior });
      else if (r.right > nr.right) n.scrollBy({ left: r.right - nr.right + 16, behavior: 'instant' as ScrollBehavior });
      break;
    }
    const rects = [...el.getClientRects()].filter((b) => b.width > 0 && b.height > 0);
    if (!rects.length) return;
    const er = el.getBoundingClientRect();
    const x = Math.min(innerWidth - 1, Math.max(1, rects[0].left + rects[0].width / 2));
    const top = stack(x, 'top', el);
    const bottom = stack(x, 'bottom', el);
    const room = bottom - top;
    if (room <= 0) return;
    // An element taller than half the room (a table region, the page's content) is left alone while part of it shows.
    if (er.height > room / 2 && er.bottom > top && er.top < bottom) return;
    let dy = 0;
    if (er.top < top + 8) dy = er.top - top - 8;
    else if (er.bottom > bottom - 8) dy = Math.min(er.bottom - bottom + 8, er.top - top - 8);
    if (Math.abs(dy) >= 1) window.scrollBy({ top: dy, behavior: 'instant' as ScrollBehavior });
  };
  const onFocus = (e: FocusEvent) => {
    const el = e.target;
    if (!(el instanceof HTMLElement) || el === document.body || el.id === 'main') return;
    cancelAnimationFrame(frame);
    // After the frame: the browser has scrolled an off-screen element in, and a bar that answers the focus (the tab bar
    // returning for a text field) has its new state.
    frame = requestAnimationFrame(() => check(el));
  };
  document.addEventListener('focusin', onFocus);
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('pointerdown', onPointer, true);
  document.addEventListener('touchstart', onPointer, { capture: true, passive: true });
  return () => {
    document.removeEventListener('focusin', onFocus);
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('pointerdown', onPointer, true);
    document.removeEventListener('touchstart', onPointer, true);
    cancelAnimationFrame(frame);
  };
}
