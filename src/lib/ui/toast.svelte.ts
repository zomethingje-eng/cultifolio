/**
 * One line of acknowledgement at the top of the page for a few seconds:
 * "2026-0001 added", "Saved". Never a dialog, never in the way, and the
 * page it lands on says the same thing in full.
 */
class Toast {
  text = $state<string | null>(null);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private shownAt = 0;
  show(text: string, ms = 3200) {
    this.text = text;
    this.shownAt = Date.now();
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => (this.text = null), ms);
  }
  hide() {
    this.text = null;
    if (this.timer) clearTimeout(this.timer);
  }
  /** A toast belongs to the page it was raised for: one shown just before a navigation rides along, an older one is put away. */
  onNavigate() {
    if (this.text && Date.now() - this.shownAt > 600) this.hide();
  }
}
export const toast = new Toast();
