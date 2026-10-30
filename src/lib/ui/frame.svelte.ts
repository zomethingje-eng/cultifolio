/**
 * What the app's frame waits for (round eighty-four; P2, outside reviews A12 and B4). A page of the collection is drawn
 * on the device once the collection opens, and the footer under it was drawn as soon as the collection was open, in view
 * under "Opening your collection…", then pushed off by the list: a layout shift of 0.29 to 0.39 on a cold load of My
 * plants with 400 plants. A page that draws its content after the open holds the footer until that content is drawn.
 *
 * A hold is a token, so the page being left and the page arriving never undo each other's.
 */
class Frame {
  private holds = $state<symbol[]>([]);
  /** Whether a page holds the footer back. */
  get holding(): boolean {
    return this.holds.length > 0;
  }
  /** Holds the footer until the returned release is called (more than once is harmless). Call it as the page is set up. */
  hold(): () => void {
    const t = Symbol('hold');
    this.holds = [...this.holds, t];
    return () => {
      if (this.holds.includes(t)) this.holds = this.holds.filter((x) => x !== t);
    };
  }
}
export const frame = new Frame();
