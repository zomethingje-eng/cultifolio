/**
 * One line of acknowledgement at the top of the page for a few seconds:
 * "2026-0001 added", "Saved". Never a dialog, never in the way, and the
 * page it lands on says the same thing in full.
 */
class Toast {
  text = $state<string | null>(null);
  private timer: ReturnType<typeof setTimeout> | null = null;
  show(text: string, ms = 3200) {
    this.text = text;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => (this.text = null), ms);
  }
  hide() {
    this.text = null;
    if (this.timer) clearTimeout(this.timer);
  }
}
export const toast = new Toast();
