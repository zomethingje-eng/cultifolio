/**
 * Whether the catalogue's upward fill should run on its own (round forty-nine, 2). `anchorTop` is the first loaded
 * row's top on screen; `edge` is where the pinned search bar ends. The fill runs while the reader is within the rows:
 * the first row at or under the bar, or just under it (the letter heading placed there by a jump, `slack`). It does
 * not run while the reader is on the chips or the letter index above the rows (after A–Z, or at the top of a page
 * opened at a letter), where rows arriving above would carry the view off what they are looking at; the "Earlier"
 * link is there for that. Pure, so the rule is tested without a browser.
 */
export function fillBefore(anchorTop: number, edge: number, slack = 64): boolean {
  if (!Number.isFinite(anchorTop)) return false;
  return anchorTop < edge + slack;
}
