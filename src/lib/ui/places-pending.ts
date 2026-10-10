/**
 * The place pickers open on a page, each able to finish the new place it holds (round sixty-six). A form that saves a
 * place calls `settlePlaces(id)` first, with its own picker's id: a new place still being written, or one named in that
 * picker's "New…" form and not yet added, is made and picked before the form reads the picker's value. Without it, Move
 * pressed just after "Add place" (or with the name typed and "Add place" never pressed) closed the panel and moved
 * nothing, and the place was made a moment later, unused.
 *
 * Only the pressing form's own picker (round sixty-seven; triage-66 R12, IND-5, the outside review's 18): settling every
 * open picker made the Edit form's unsaved place when Move was pressed, and a later Save moved the plant there. A place
 * that cannot be made rejects, and the picker shows why; the form's save catches it and stops.
 */
const open = new Map<string, Set<() => Promise<void>>>();

export function holdPlacePicker(id: string, settle: () => Promise<void>): () => void {
  const set = open.get(id) ?? open.set(id, new Set()).get(id)!;
  set.add(settle);
  return () => { set.delete(settle); if (!set.size) open.delete(id); };
}

/** Settle the pickers with these ids (each form passes its own); with none given, every open picker, for a page that has one. */
export async function settlePlaces(...ids: string[]): Promise<void> {
  const fs = ids.length ? ids.flatMap((id) => [...(open.get(id) ?? [])]) : [...open.values()].flatMap((s) => [...s]);
  await Promise.all(fs.map((f) => f()));
}
