/**
 * Two condensations of the cultivation sheet, made by rule and not by a person:
 *
 *   generatedNote()  a short paragraph a grower could read in twenty seconds,
 *                    one sentence per card the sheet has, in the sheet's own
 *                    figures. Every sentence traces to a row on the page.
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
  const { rows, arch, year } = cultivationSheet(input);
  if (!rows.length) return null;
  const readerSouth = (o.readerLat ?? 40) < 0;
  const s: string[] = [];
  const from: string[] = [];
  const has = (k: string) => rows.find((r) => r.k === k);

  // 1. What it is and its year.
  const lab = arch ? arch.arch.lab.toLowerCase() : null;
  if (year) {
    const grow = seasonFor(year, readerSouth);
    const rest = [...Array(12).keys()].map((i) => i + 1).filter((m) => !grow.includes(m));
    if (year.grow === 'even') s.push(`${lab ? `A ${lab} that` : 'It'} has no sharp season at home: it slows in the extremes rather than stopping, so let the plant rather than the calendar say when to water.`);
    else if (year.fog) s.push(`${lab ? `A ${lab} from` : 'From'} a fog desert (${Math.round(year.annualMm)} mm a year): it grows in the cool, foggy months, ${span(grow)} where you are, and sits tight the rest of the year on very little water.`);
    else s.push(`${lab ? `A ${lab} and a` : 'A'} ${year.grow} grower: where you are it grows ${span(grow)} and rests ${span(rest)}, dry, bright and unfed.`);
    from.push('Its year');
  } else if (arch) {
    s.push(`A ${lab}; no habitat climate is on file for this species, so what follows is what the group usually wants.`);
  }

  // 2. Water.
  const w = has('Water');
  if (w) {
    if (year && year.fog) s.push('Water lightly in its cool season and hardly at all outside it; a pot that stays wet is the one thing it has never met.');
    else if (year && year.annualMm < 400) s.push(`Its habitat gets about ${Math.round(year.annualMm)} mm of rain a year, ${Math.round(year.wetMm)} mm of it in the growing season; soak it then, and let the pot dry right through between waterings.`);
    else if (year) s.push(`Its habitat gets about ${Math.round(year.annualMm)} mm a year, so it is not a desert plant: water when the top of the mix has dried, not when the whole pot has.`);
    else if (arch) s.push(arch.arch.water.split('. ')[0] + '.');
    from.push('Water');
  }
  const wq = has('What you water it with');
  if (wq) {
    s.push(wq.s.split('. ')[0] + '.');
    from.push('What you water it with');
  }

  // 3. Light.
  const l = has('Light');
  if (l) {
    const m = /delivers (\d+) to (\d+) mol/.exec(l.s) ?? /Conventionally (\d+) to (\d+) mol/.exec(l.s);
    const exp = arch?.arch.exposure ?? 'full';
    s.push(
      (exp === 'shade' ? 'Keep it out of direct sun' : exp === 'part' ? 'Bright shade or a window without full sun' : 'As much light as you can give it') +
        (m ? ` (habitat sky ${m[1]}–${m[2]} mol/m²/day${exp === 'full' ? '' : ', of which it sees a fraction'}; a good grow light gives 15–25).` : '.')
    );
    from.push('Light');
  }

  // 4. Cold.
  const fl = floorC(rows);
  if (fl != null) {
    const t = has('Temperature')!;
    s.push(`Keep it above ${fl} °C${/meets real frost/.test(t.s) ? '; dry, it takes a few degrees less, wet it does not' : ''}.`);
    from.push('Temperature');
  }

  // 5. Air, feeding, repotting: one clause each when the sheet has them.
  const a = has('Air');
  if (a && arch?.arch.rh != null) {
    s.push(`It wants ${arch.arch.rh}% humidity or better, which a heated room in winter does not give.`);
    from.push('Air');
  }
  const f = has('Feeding');
  if (f && arch) {
    s.push(arch.arch.feedD === 0 ? 'Never feed it.' : `Feed every ${arch.arch.feedD} days in growth and not at all at rest; repot about every ${arch.arch.repotD >= 730 ? Math.round(arch.arch.repotD / 365) + ' years' : Math.round(arch.arch.repotD / 30) + ' months'}.`);
    from.push('Feeding', 'Repotting');
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
