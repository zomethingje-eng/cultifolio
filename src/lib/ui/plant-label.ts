/**
 * How a plant is named where plants are told apart: the species with its cultivar, or a hybrid's cross when the parents
 * are known. Today's chips and the list said "Echeveria" for Echeveria 'Blue Curls' and "Ariocarpus" for five different
 * Ariocarpus crosses, which read as identical rows (round sixty; the grower review, 7).
 */
import { kindOf } from '$lib/db/types';

type Named = { taxonName: string; cultivar?: string | null; nameKind?: string | null; parentage?: string | null };

/**
 * The cross as a name: the parents, with the second parent's genus dropped when it repeats the first's
 * ("Ariocarpus retusus × trigonus"). Null when the plant is not a hybrid filed under its genus, or its parents are not stated.
 */
export function crossName(a: Named): string | null {
  if (kindOf(a) !== 'hybrid' || !a.parentage?.trim() || a.taxonName.trim().includes(' ')) return null;
  const ps = a.parentage.split('×').map((x) => x.trim()).filter(Boolean);
  if (ps.length < 2) return null;
  const genus = ps[0].split(' ')[0];
  return ps.map((p, i) => (i && p.startsWith(genus + ' ') ? p.slice(genus.length + 1) : p)).join(' × ');
}

/** The scientific part to italicise (the cross, or the name as filed) and the cultivar, said apart so a page can set them. */
export function plantName(a: Named): { sci: string; cultivar: string | null } {
  return { sci: crossName(a) ?? a.taxonName, cultivar: a.cultivar?.trim() || null };
}

/** The full name as one string, for an accessible name, a toast or a title: "Haworthia truncata ‘Lime Green’". */
export function plantLabel(a: Named): string {
  const n = plantName(a);
  return n.cultivar ? `${n.sci} ‘${n.cultivar}’` : n.sci;
}

/**
 * The part of a place path that tells two rows apart: its last segment. The list cut "Greenhouse › Bench 1 › Tray A"
 * from the right, so Tray A and Bench 2 both read "Greenhouse › Benc…" (round sixty; the grower review, 8).
 */
export function placeTail(path: string): string {
  const parts = path.split(' › ');
  return parts[parts.length - 1] ?? path;
}
