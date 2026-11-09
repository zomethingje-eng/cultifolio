/**
 * "Next door" (round eighty-seven, stage 2): the TDWG level-3 regions whose outlines touch a region's, from the
 * repository's own shapes file (scripts/dev/r87-tdwg-neighbours.py says how: Natural Earth's states and provinces as
 * round eighty placed them in TDWG's regions; a corner of one within 0.022 degrees of the other's outline; minor islands
 * left out). TDWG's own tables hold no adjacency, so this is the shapes' reading of it, and the page says so. Three
 * regions have no outline in the file (Cocos (Keeling) Is., Christmas I., the South China Sea): for them nothing is said
 * to be next door, and the page says none was worked out, never that none is.
 *
 * Read on the server only, as the TDWG hierarchy is.
 */
import data from './tdwg-neighbours.json';
import { level3Of } from './tdwg';

const NEXT = (data as { next: Record<string, string[]> }).next;
const NO_SHAPE = new Set((data as { noShape: string[] }).noShape);
export const NEIGHBOURS_SOURCE = (data as { source: string }).source;

/** The level-3 regions next door to a region (to any of its level-3 parts, outside it); null where its outline is not in the file. */
export function nextDoor(code: string): string[] | null {
  const parts = level3Of(code);
  if (!parts.length || parts.every((c) => NO_SHAPE.has(c))) return null;
  const inside = new Set(parts);
  const out = new Set<string>();
  for (const c of parts) for (const n of NEXT[c] ?? []) if (!inside.has(n)) out.add(n);
  return [...out].sort();
}
