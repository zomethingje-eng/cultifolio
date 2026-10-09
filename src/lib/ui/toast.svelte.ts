/**
 * One line of acknowledgement at the top of the page for a few seconds:
 * "2026-0001 added", "Saved". Never a dialog, never in the way, and the
 * page it lands on says the same thing in full.
 */
/**
 * The longest a toast waits for a pointer resting on it (round sixty-one; the accessibility review, 1). Focus holds it
 * for as long as focus stays: Tab can no longer be trapped there, so the cap only took Undo away from a keyboard user
 * resting on it (round sixty-two; the accessibility review, 9).
 */
export const HOLD_MAX_MS = 30_000;
type HoldBy = 'focus' | 'pointer';
const nextFrame = (f: () => void) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(f) : setTimeout(f, 16));

class Toast {
  text = $state<string | null>(null);
  /**
   * What the live region says: the sentence, emptied for a frame when the same sentence is said again, since an
   * unchanged text changes nothing a screen reader hears; a grower pressing Water a third time heard nothing (round
   * sixty-two; the outside review's A38, the accessibility review, 7).
   */
  said = $state('');
  private saidGen = 0;
  /** An action the toast offers for a few seconds, such as Undo (round twenty-six, 5). */
  action = $state<{ label: string; run: () => void } | null>(null);
  /**
   * Where focus was when the toast was raised: a keyboard user's next Tab goes to the toast's action, and the toast's
   * "Back" (or Escape) returns there. The Undo was 23 Shift+Tabs away from the Water that raised it (round sixty; the
   * accessibility review, 1).
   */
  origin: HTMLElement | null = null;
  /**
   * Where the keyboard came into the toast from, when it was raised with focus nowhere in particular (a tap, a page
   * load): the way back then, so Tab past the last control and the toast's going never leave focus on nothing (round
   * sixty-one; the accessibility review, 1).
   */
  entry: HTMLElement | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** The longest the pointer alone holds the toast (round sixty-one; the accessibility review, 1; for the pointer only since round sixty-two). */
  private cap: ReturnType<typeof setTimeout> | null = null;
  private shownAt = 0;
  /** When the running timer ends, and what is left of it while held. */
  private endsAt = 0;
  private left = 0;
  /** What holds the timer now: focus inside the toast, the pointer over it, or both. */
  private by = { focus: false, pointer: false };
  /** 2.4 s at rest: the page says the same thing in full, so the line is a nod, not a notice; one with an action stays 8 s (round fifty, 4). */
  show(text: string, ms = 2400, action: { label: string; run: () => void } | null = null) {
    const again = this.text !== null && this.said === text;
    this.text = text;
    this.action = action;
    const gen = ++this.saidGen;
    if (again) { this.said = ''; nextFrame(() => { if (gen === this.saidGen && this.text === text) this.said = text; }); }
    else this.said = text;
    if (action) ms = Math.max(ms, 8000); // long enough to read and press
    this.shownAt = Date.now();
    const a = typeof document !== 'undefined' ? document.activeElement : null;
    this.origin = typeof HTMLElement !== 'undefined' && a instanceof HTMLElement && a !== document.body && !a.closest('.toastregion') ? a : null;
    this.entry = null;
    this.left = ms;
    // A new toast starts its own time: the earlier one's cap is cleared, so it cannot cut this one short; and a reader
    // already in the toast holds this one too, so the toast replaced under focus does not then go early (round sixty-two; A38).
    if (this.cap) clearTimeout(this.cap);
    this.cap = null;
    this.by = { focus: false, pointer: false };
    this.arm();
    if (typeof Element !== 'undefined' && a instanceof Element && a.closest('.toastregion')) this.hold('focus');
    try { if (document.querySelector('.toast:hover')) this.hold('pointer'); } catch { /* no document, or no :hover: not held */ }
  }
  private arm() {
    if (this.timer) clearTimeout(this.timer);
    this.endsAt = Date.now() + this.left;
    this.timer = setTimeout(() => this.hide(), this.left);
  }
  /**
   * A toast does not go while the reader is on it: focus or the pointer inside it holds the timer, and leaving gives it
   * back what was left, at least two seconds, so it does not vanish under a finger just lifted (round sixty; the
   * accessibility review, 1: it closed after 8 s with focus on its Undo).
   */
  hold(by: HoldBy = 'pointer') {
    if (!this.text || this.by[by]) return;
    const was = this.held;
    this.by[by] = true;
    if (!was) {
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
      this.left = Math.max(0, this.endsAt - Date.now());
    }
    this.capIfPointerOnly();
  }
  release(by: HoldBy = 'pointer') {
    if (!this.text || !this.by[by]) return;
    this.by[by] = false;
    if (this.held) { this.capIfPointerOnly(); return; }
    if (this.cap) clearTimeout(this.cap);
    this.cap = null;
    this.left = Math.max(this.left, 2000);
    this.arm();
  }
  /** The cap runs while the pointer alone holds the toast: a pointer left over it is not a reader, focus on Undo is (round sixty-two; the accessibility review, 9). */
  private capIfPointerOnly() {
    if (this.by.pointer && !this.by.focus) { if (!this.cap) this.cap = setTimeout(() => this.hide(), HOLD_MAX_MS); }
    else if (this.cap) { clearTimeout(this.cap); this.cap = null; }
  }
  /** Whether something holds the timer (focus or the pointer inside the toast). */
  get held(): boolean {
    return this.by.focus || this.by.pointer;
  }
  /** Where focus goes from the toast: where it was raised, else where the keyboard came in from; null when neither is still on the page. */
  wayBack(): HTMLElement | null {
    if (this.origin?.isConnected) return this.origin;
    if (this.entry?.isConnected) return this.entry;
    return null;
  }
  hide() {
    // A toast that goes with focus inside it hands focus back first, so it does not fall to the page body as the toast
    // is taken away (round sixty-one; the accessibility review, 1).
    const inside = typeof document !== 'undefined' && !!document.activeElement?.closest?.('.toastregion');
    const back = inside ? (this.wayBack() ?? (document.getElementById('main') as HTMLElement | null)) : null;
    this.text = null;
    this.said = '';
    this.saidGen++;
    this.action = null;
    this.by = { focus: false, pointer: false };
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.cap) clearTimeout(this.cap);
    this.cap = null;
    back?.focus();
  }
  /** A toast belongs to the page it was raised for: one shown just before a navigation rides along, an older one is put away. */
  onNavigate() {
    if (this.text && Date.now() - this.shownAt > 600) this.hide();
  }
}
export const toast = new Toast();
