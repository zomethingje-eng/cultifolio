/**
 * The walking order of spaces (round 122; MYPLANTS 29): the order the grower walks them, set on the Spaces page by a
 * handle and kept as each space's `sort` among its siblings (the field the tree has sorted by since round fifty-eight,
 * so Today, the chips and every picker follow it with no new field; docs/PLAN-RECORD-FORMAT.md named `order`).
 * Two devices reordering at once merge per field by the greatest stamp, as every field does; a tie sorts by name.
 */

/** The siblings after moving the one at `from` to `to`, by id. */
export function reorder<T extends { id: string }>(sibs: readonly T[], from: number, to: number): T[] {
  const out = [...sibs];
  if (from < 0 || from >= out.length) return out;
  const [x] = out.splice(from, 1);
  out.splice(Math.max(0, Math.min(to, out.length)), 0, x);
  return out;
}

/** The writes that make `order` the siblings' order: 1, 2, 3 … on each whose `sort` is not already that. */
export function sortWrites(order: ReadonlyArray<{ id: string; sort?: number | null }>): Array<{ id: string; sort: number }> {
  return order.map((s, i) => ({ id: s.id, sort: i + 1, was: s.sort })).filter((w) => w.was !== w.sort).map(({ id, sort }) => ({ id, sort }));
}
