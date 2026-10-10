/**
 * The place pickers open on a page, each able to finish the new place it holds (round sixty-six). A form that saves a
 * place calls `settlePlaces()` first: a new place still being written, or one named in the picker's "New…" form and not
 * yet added, is made and picked before the form reads the picker's value. Without it, Move pressed just after "Add
 * place" (or with the name typed and "Add place" never pressed) closed the panel and moved nothing, and the place was
 * made a moment later, unused.
 */
const open = new Set<() => Promise<void>>();

export function holdPlacePicker(settle: () => Promise<void>): () => void {
  open.add(settle);
  return () => open.delete(settle);
}

export async function settlePlaces(): Promise<void> {
  await Promise.all([...open].map((f) => f()));
}
