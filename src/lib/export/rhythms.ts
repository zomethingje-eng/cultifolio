/**
 * The grower's watering rhythms as calendar events (round sixty; the product review's 9): one per place that has
 * growing plants following its rhythm, and one per plant with a rhythm of its own. The next due day is the earliest of
 * the plants' (last watering, else the day the record was made, plus the rhythm), today when that is past. A reading of
 * the log: nothing is written.
 */
import { addDays, buildIcs, type Rhythm } from './ics';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface RhythmPlant { id: string; no: string; name: string; placeId: string | null; ownDays: number | null }
export interface RhythmSource {
  plants: RhythmPlant[];
  placeName(id: string): string;
  /** The rhythm and dry months as they apply at a place (inherited down the tree); null place: the default. */
  rule(placeId: string | null): { every: number; dry: number[] };
  /** The day a plant's rhythm counts from: its last watering, else the day its record was made. */
  from(plantId: string): string;
  today: string;
}

const dryWords = (dry: number[]) => (dry.length ? ` Not in the months kept dry: ${[...dry].sort((a, b) => a - b).map((m) => MONTHS[m - 1]).join(', ')}.` : '');

export function rhythmsOf(src: RhythmSource): Rhythm[] {
  const out: Rhythm[] = [];
  const next = (ps: RhythmPlant[], every: number) => {
    const due = ps.map((p) => addDays(src.from(p.id), every)).sort()[0];
    return due < src.today ? src.today : due;
  };
  const groups = new Map<string | null, RhythmPlant[]>();
  for (const p of src.plants) {
    if (p.ownDays && p.ownDays > 0) {
      const rule = src.rule(p.placeId);
      out.push({ uid: `water-plant-${p.id}@cultifolio`, summary: `Water ${p.no} ${p.name} (every ${p.ownDays} days)`, description: `This plant's own rhythm, from Cultifolio.${dryWords(rule.dry)}`, start: next([p], p.ownDays), every: p.ownDays, dry: rule.dry });
      continue;
    }
    const g = groups.get(p.placeId) ?? [];
    g.push(p);
    groups.set(p.placeId, g);
  }
  for (const [placeId, ps] of groups) {
    const rule = src.rule(placeId);
    const where = placeId ? src.placeName(placeId) : 'plants with no place';
    out.push({ uid: `water-place-${placeId ?? 'none'}@cultifolio`, summary: `Water ${where} (every ${rule.every} days)`, description: `${ps.length} growing plant${ps.length === 1 ? '' : 's'} on this rhythm, from Cultifolio.${dryWords(rule.dry)}`, start: next(ps, rule.every), every: rule.every, dry: rule.dry });
  }
  return out.sort((a, b) => a.summary.localeCompare(b.summary));
}

export const icsOf = (src: RhythmSource, now = new Date()): string => buildIcs(rhythmsOf(src), now);
