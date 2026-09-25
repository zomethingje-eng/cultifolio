/**
 * Two condensations of the cultivation sheet, made by rule and not by a person:
 *
 *   generatedNote()  a short paragraph a grower could read in twenty seconds:
 *                    each row's own one-sentence `short`, in card order. The
 *                    sentence is written by the rule that writes the row, at
 *                    the same moment, so the note cannot contradict a card.
 *   careLine()       one line for a plant label: season, cold floor, light.
 *
 * Neither invents anything the sheet does not say; when the sheet has nothing
 * on a topic the sentence is left out rather than filled in. Months on both
 * come from the sheet's own `runs()`, so a label and a sheet agree.
 */
import { cultivationSheet, runs, forReader, coldFloor, type SheetInput } from './sheet';
import { archFor, type ArchGuess } from './arch';
import { temp, METRIC } from './units';

/** "Nov–Feb" style span for a label; wraps the year and lists a bimodal season as two runs. */
export const span3 = (ms: number[]) => runs(ms, 'short');

export interface Condensed {
  text: string;
  /** Rows the sentences came from, by key, in order. */
  from: string[];
  /** True when at least one sentence rests on this species' own habitat figures. */
  hab: boolean;
}

/** Which hemisphere the reader is in decides which months to print. Default north. */
export interface NoteOpts {
  /** Latitude of the grower's place, when known; the months are shifted for the reader. */
  readerLat?: number | null;
}

export function generatedNote(input: SheetInput, o: NoteOpts = {}): Condensed | null {
  const { rows, arch, year } = cultivationSheet({ ...input, readerLat: o.readerLat ?? input.readerLat });
  if (!rows.length) return null;
  // The note IS the rows: each row's own one-sentence short, in card order, and nothing else. There is
  // no second rule here that could disagree with the card it summarises.
  const order = ['Its year', 'Rain', 'Light', 'Temperature', 'Humidity'];
  const picked = rows.filter((r) => r.short).sort((a, b) => (order.indexOf(a.k) === -1 ? 99 : order.indexOf(a.k)) - (order.indexOf(b.k) === -1 ? 99 : order.indexOf(b.k)));
  const s: string[] = [];
  const from: string[] = [];
  // Without a habitat climate the sentence says which kind of without: pending, not checked, or none derivable. Three different facts.
  const why = input.climateStatus === 'pending' ? 'the habitat climate is pending' : input.climateStatus === 'refused' ? 'the habitat climate was not checked (a source did not answer)' : 'no habitat climate could be derived for this species';
  if (arch) s.push(`Grouped as a ${arch.arch.lab.toLowerCase()} by ${arch.why} (archetype table)${year ? '.' : `; ${why}.`}`);
  for (const r of picked) {
    s.push(r.short!);
    from.push(r.k);
  }
  return { text: s.join(' '), from, hab: rows.some((r) => r.hab) };
}

/** One line for a label: the rain rule's season in the reader's hemisphere, the cold floor, the open-sky light. Empty when nothing is known. */
export function careLine(input: SheetInput, o: NoteOpts = {}): string {
  const { rows, year } = cultivationSheet(input);
  if (!rows.length) return '';
  const bits: string[] = [];
  if (year) {
    const months = span3(forReader(year, o.readerLat));
    if (year.none) bits.push('no season to read');
    else if (year.fog) bits.push(`cooler six months ${months}`);
    else if (year.spread) bits.push('rain spread, no season');
    else if (year.flat) bits.push(`rain ${months}, flat T`);
    else if (year.grow === 'even') bits.push(`rain ${months}`);
    else bits.push(`${year.grow} rain ${months}`);
  }
  const m = input.months && input.months.length === 12 ? input.months : null;
  const fl = coldFloor(m, input.extremes ?? null, archFor(input.scientific, input.family), input.units ?? METRIC);
  // The habitat night at one decimal, as the page prints it, named as what it is; "floor" alone reads as a thermostat setting.
  // The habitat night is printed as what it is, and a floor the archetype table raised is printed as the table's, never as a night the habitat had.
  if (fl) {
    if (fl.habitat != null) bits.push(`hab. night ${temp(fl.habitat, input.units ?? METRIC, 1)}`);
    if (fl.habitat == null || fl.raised) bits.push(`group min ${temp(fl.floor, input.units ?? METRIC, 0)}`);
  }
  const dlis = m ? m.map((x) => x.dli).filter((x): x is number => x != null) : [];
  if (dlis.length) bits.push(`sky ${Math.round(Math.min(...dlis))}–${Math.round(Math.max(...dlis))} DLI`);
  return bits.join(' · ');
}

export type { ArchGuess };
