/**
 * The grower's watering rhythms as calendar events (round sixty; the product review's 9): one per place that has
 * growing plants following its rhythm, and one per plant with a rhythm of its own. The next due day is the earliest of
 * the plants' (last watering, else the day the record was made, plus the rhythm), today when that is past. A reading of
 * the log: nothing is written.
 */
import { addDays, allDry, buildIcs, wholeDays, DEFAULT_EVERY, type Rhythm } from './ics';
import { monthRuns, everyWords } from '$lib/ui/today-words';

export interface RhythmPlant { id: string; no: string; name: string; placeId: string | null; ownDays: number | null }
export interface RhythmSource {
  plants: RhythmPlant[];
  placeName(id: string): string;
  /** The rhythm and dry months as they apply at a place (inherited down the tree); null place: the default. */
  rule(placeId: string | null): { every: number; dry: number[] };
  /** The day a plant's rhythm counts from: its last watering, else the day its record was made. */
  from(plantId: string): string;
  today: string;
  /**
   * The collection's tag, carried by every UID, so two collections' events never share one (round sixty-two; the outside
   * review's A27). The same on every device of the collection, and across downloads.
   */
  collection?: string;
}

/** The dry months as the place page says them, in the order the seasons run: "Dec to Feb", not "Jan, Feb, Dec" (round sixty-one; the grower review). */
const dryWords = (dry: number[]) => (dry.length ? ` Not in the months kept dry: ${monthRuns(dry)}.` : '');

/** Every rhythm, the ones dry in every month included: `calendarOf` says which of those it left out. */
export function rhythmsOf(src: RhythmSource): Rhythm[] {
  const out: Rhythm[] = [];
  const tag = src.collection ?? 'cultifolio';
  // A rhythm the calendar can write, whatever reached the record (a backup, an import, a sync): a whole number of days
  // from 1 to 365; a place's other figure is written at the default, a plant's follows its place (round sixty-two; A27).
  const rule = (id: string | null) => { const r = src.rule(id); return { every: wholeDays(r.every, DEFAULT_EVERY), dry: r.dry }; };
  const next = (ps: RhythmPlant[], every: number) => {
    const due = ps.map((p) => addDays(src.from(p.id), every)).sort()[0];
    return due < src.today ? src.today : due;
  };
  const groups = new Map<string | null, RhythmPlant[]>();
  for (const p of src.plants) {
    const own = wholeDays(p.ownDays, 0);
    if (own) {
      const at = rule(p.placeId);
      out.push({ uid: `water-plant-${p.id}.${tag}@cultifolio`, what: `${p.no} ${p.name}`, summary: `Water ${p.no} ${p.name} (${everyWords(own)})`, description: `This plant's own rhythm, from Cultifolio.${dryWords(at.dry)}`, start: next([p], own), every: own, dry: at.dry });
      continue;
    }
    const g = groups.get(p.placeId) ?? [];
    g.push(p);
    groups.set(p.placeId, g);
  }
  for (const [placeId, ps] of groups) {
    const at = rule(placeId);
    const where = placeId ? src.placeName(placeId) : 'plants with no place';
    out.push({ uid: `water-place-${placeId ?? 'none'}.${tag}@cultifolio`, what: where, summary: `Water ${where} (${everyWords(at.every)})`, description: `${ps.length} growing plant${ps.length === 1 ? '' : 's'} on this rhythm, from Cultifolio.${dryWords(at.dry)}`, start: next(ps, at.every), every: at.every, dry: at.dry });
  }
  return out.sort((a, b) => a.summary.localeCompare(b.summary));
}

export const icsOf = (src: RhythmSource, now = new Date()): string => buildIcs(rhythmsOf(src), now, src.collection);

/**
 * The file and what it holds: the number of events (a rhythm with dry months is one per run of watered months), and the
 * rhythms left out because they are kept dry in every month, by name, for the page to say (round sixty-one; the grower
 * review: an event whose every repeat was excepted showed as nothing in some calendars and was refused by others).
 */
export function calendarOf(src: RhythmSource, now = new Date()): { text: string; events: number; leftOut: string[] } {
  const all = rhythmsOf(src);
  const text = buildIcs(all, now, src.collection);
  // The repeating events: the one that says to download again is not one of them (round sixty-two).
  return { text, events: (text.match(/\r\nRRULE:/g) ?? []).length, leftOut: all.filter(allDry).map((r) => r.what ?? r.summary) };
}
