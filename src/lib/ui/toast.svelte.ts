/**
 * One line of acknowledgement at the top of the page for a few seconds:
 * "2026-0001 added", "Saved". Never a dialog, never in the way, and the
 * page it lands on says the same thing in full.
 */
class Toast {
  text = $state<string | null>(null);
  /** An action the toast offers for a few seconds, such as Undo (round twenty-six, 5). */
  action = $state<{ label: string; run: () => void } | null>(null);
  /**
   * Where focus was when the toast was raised: a keyboard user's next Tab goes to the toast's action, and the toast's
   * "Back" (or Escape) returns there. The Undo was 23 Shift+Tabs away from the Water that raised it (round sixty; the
   * accessibility review, 1).
   */
  origin: HTMLElement | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private shownAt = 0;
  /** When the running timer ends, and what is left of it while held. */
  private endsAt = 0;
  private left = 0;
  private holds = 0;
  /** 2.4 s at rest: the page says the same thing in full, so the line is a nod, not a notice; one with an action stays 8 s (round fifty, 4). */
  show(text: string, ms = 2400, action: { label: string; run: () => void } | null = null) {
    this.text = text;
    this.action = action;
    if (action) ms = Math.max(ms, 8000); // long enough to read and press
    this.shownAt = Date.now();
    const a = typeof document !== 'undefined' ? document.activeElement : null;
    this.origin = typeof HTMLElement !== 'undefined' && a instanceof HTMLElement && a !== document.body && !a.closest('.toastregion') ? a : null;
    this.left = ms;
    this.holds = 0;
    this.arm();
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
  hold() {
    if (!this.text) return;
    this.holds += 1;
    if (this.holds > 1) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.left = Math.max(0, this.endsAt - Date.now());
  }
  release() {
    if (!this.text || this.holds === 0) return;
    this.holds -= 1;
    if (this.holds > 0) return;
    this.left = Math.max(this.left, 2000);
    this.arm();
  }
  /** Whether something holds the timer (focus or the pointer inside the toast). */
  get held(): boolean {
    return this.holds > 0;
  }
  hide() {
    this.text = null;
    this.action = null;
    this.holds = 0;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
  /** A toast belongs to the page it was raised for: one shown just before a navigation rides along, an older one is put away. */
  onNavigate() {
    if (this.text && Date.now() - this.shownAt > 600) this.hide();
  }
}
export const toast = new Toast();
