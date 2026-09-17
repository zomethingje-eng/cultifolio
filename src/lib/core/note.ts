/**
 * Two condensations of the cultivation sheet, made by rule and not by a person:
 *
 *   generatedNote()  a short paragraph a grower could read in twenty seconds:
 *                    each row's own one-sentence `short`, in card order. The
 *                    sentence is written by the rule that writes the row, at
 *                    the same moment, so the note cannot contradict a card.
 *   careLine()       one line for a plant label: season, floor, light, water.
 *
 * Neither invents anything the sheet does not say; when the sheet has nothing
 * on a topic the sentence is left out rather than filled in.
 */
import { cultivationSheet, span, type SheetInput, type Year } from './sheet';
import type { ArchGuess } from './arch';

const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Nov–Feb" style span for a label; wraps the year. */
export function span3(ms: number[]): string {
  if (!ms.length) return '';
  if (ms.length === 12) return 'all year';
  const sorted = [...new Set(ms)].sort((a, b) => a - b);
  // Find the start: the month whose predecessor is not in the set.
  let start = sorted.find((m) => !sorted.includes(((m + 10) % 12) + 1)) ?? sorted[0];
  let end = start;
  while (sorted.includes((end % 12) + 1) && (end % 12) + 1 !== start) end = (end % 12) + 1;
  return start === end ? MON3[start - 1] : `${MON3[start - 1]}–${MON3[end - 1]}`;
}

export interface Condensed {
  text: string;
  /** Rows the sentences came from, by key, in order. */
  from: string[];
  /** True when at least one sentence rests on this species' own habitat figures. */
  hab: boolean;
}

/** The floor the sheet states, if it states one, in °C. */
function floorC(rows: Array<{ k: string; s: string }>): number | null {
  const t = rows.find((r) => r.k === 'Temperature');
  const m = t && /Keep it above (-?\d+) ?°C/.exec(t.s);
  return m ? Number(m[1]) : null;
}

/** Which hemisphere the reader is in decides which months to print. Default north. */
export interface NoteOpts {
  /** Latitude of the grower's place, when known; the months are shifted for the reader. */
  readerLat?: number | null;
}

const seasonFor = (year: Year, readerSouth: boolean) => (readerSouth === year.south ? year.growMonths : year.shifted);

export function generatedNote(input: SheetInput, o: NoteOpts = {}): Condensed | null {
  const { rows, arch, year } = cultivationSheet({ ...input, readerLat: o.readerLat ?? input.readerLat });
  if (!rows.length) return null;
  // The note IS the rows: each row's own one-sentence short, in card order, and nothing else. There is
  // no second rule here that could disagree with the card it summarises.
  const order = ['Its year', 'Water', 'What you water it with', 'Light', 'Temperature', 'Air', 'Feeding', 'Repotting'];
  const picked = rows.filter((r) => r.short).sort((a, b) => (order.indexOf(a.k) === -1 ? 99 : order.indexOf(a.k)) - (order.indexOf(b.k) === -1 ? 99 : order.indexOf(b.k)));
  const s: string[] = [];
  const from: string[] = [];
  const lab = arch ? arch.arch.lab.toLowerCase() : null;
  if (lab && !year) s.push(`A ${lab}; no habitat climate is on file for this species, so what follows is what the group usually wants.`);
  else if (lab && year) s.push(`A ${lab}.`);
  for (const r of picked) {
    s.push(r.short!);
    from.push(r.k);
  }
  return { text: s.join(' '), from, hab: rows.some((r) => r.hab) };
}

/** One line for a label. Empty when nothing is known. */
export function careLine(input: SheetInput, o: NoteOpts = {}): string {
  const { rows, arch, year } = cultivationSheet(input);
  if (!rows.length) return '';
  const readerSouth = (o.readerLat ?? 40) < 0;
  const bits: string[] = [];
  if (year && year.grow !== 'even') {
    const grow = seasonFor(year, readerSouth);
    bits.push(`${year.fog ? 'cool-season' : year.grow} grower ${span3(grow)}`);
  } else if (year) bits.push('no strict rest');
  const fl = floorC(rows);
  if (fl != null) bits.push(`>${fl} °C`);
  const exp = arch?.arch.exposure;
  if (exp) bits.push(exp === 'full' ? 'full sun' : exp === 'part' ? 'bright shade' : 'shade');
  if (arch?.arch.dry === 'through') bits.push('dry between');
  else if (arch?.arch.dry === 'never') bits.push('never dry');
  if (arch?.arch.waterQ === 'pure') bits.push('rain/RO water');
  return bits.join(' · ');
}

export type { ArchGuess };
