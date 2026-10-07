/**
 * The grower's watering rhythms as calendar events (round sixty; the product review's 9): one per place that has
 * growing plants following its rhythm, and one per plant with a rhythm of its own. The next due day is the earliest of
 * the plants' (last watering, else the day the record was made, plus the rhythm), today when that is past. A reading of
 * the log: nothing is written.
 */
import { addDays, allDry, buildIcs, type Rhythm } from './ics';
import { monthRuns } from '$lib/ui/today-words';

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

/** The dry months as the place page says them, in the order the seasons run: "Dec to Feb", not "Jan, Feb, Dec" (round sixty-one; the grower review). */
const dryWords = (dry: number[]) => (dry.length ? ` Not in the months kept dry: ${monthRuns(dry)}.` : '');

/** Every rhythm, the ones dry in every month included: `calendarOf` says which of those it left out. */
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
      out.push({ uid: `water-plant-${p.id}@cultifolio`, what: `${p.no} ${p.name}`, summary: `Water ${p.no} ${p.name} (every ${p.ownDays} days)`, description: `This plant's own rhythm, from Cultifolio.${dryWords(rule.dry)}`, start: next([p], p.ownDays), every: p.ownDays, dry: rule.dry });
      continue;
    }
    const g = groups.get(p.placeId) ?? [];
    g.push(p);
    groups.set(p.placeId, g);
  }
  for (const [placeId, ps] of groups) {
    const rule = src.rule(placeId);
    const where = placeId ? src.placeName(placeId) : 'plants with no place';
    out.push({ uid: `water-place-${placeId ?? 'none'}@cultifolio`, what: where, summary: `Water ${where} (every ${rule.every} days)`, description: `${ps.length} growing plant${ps.length === 1 ? '' : 's'} on this rhythm, from Cultifolio.${dryWords(rule.dry)}`, start: next(ps, rule.every), every: rule.every, dry: rule.dry });
  }
  return out.sort((a, b) => a.summary.localeCompare(b.summary));
}

export const icsOf = (src: RhythmSource, now = new Date()): string => buildIcs(rhythmsOf(src), now);

/**
 * The file and what it holds: the number of events (a rhythm with dry months is one per run of watered months), and the
 * rhythms left out because they are kept dry in every month, by name, for the page to say (round sixty-one; the grower
 * review: an event whose every repeat was excepted showed as nothing in some calendars and was refused by others).
 */
export function calendarOf(src: RhythmSource, now = new Date()): { text: string; events: number; leftOut: string[] } {
  const all = rhythmsOf(src);
  const text = buildIcs(all, now);
  return { text, events: (text.match(/BEGIN:VEVENT\r\n/g) ?? []).length, leftOut: all.filter(allDry).map((r) => r.what ?? r.summary) };
}
