/**
 * "Habitat in brief" (round 114; SPECIES 18 d): the six answers read aloud, one paragraph of fixed sentences filled from
 * the page's figures, in the HTML the server sends; and the page's title and description from the same figures.
 *
 * Rule 3: every sentence is fixed and filled by code, never written by hand or by a model; each says "in habitat" or "its
 * habitat", never "hardy to", "tolerates", "survives" or "needs". Rule 2: a sentence or clause whose figure is missing is
 * left out, never written as none or 0. Rule 1: each figure's source is on the line beneath, and every figure is the one
 * the six answers show, by the same rounding and the reader's units (`temp`, `rain`, `usdaOfShown`).
 *
 * The sentences, in order, each only when its figures are held:
 * 1. "rarely sees nights below X: only 1 night in 100 is colder at a typical spot." (`extremes.minP01`)
 * 2. "The lowest in N years of records was X" and the frost clause (`extremes.minAbs`; the years with a low; the frost count)
 * 3. "That places its habitat in USDA zone Z and RHS B." (the hardiness the page shows)
 * 4. "Rain is X a year at the median across its range" and ", and N months bring under 5 mm"
 * 5. "The hottest 1 day in 100 reaches X." (`extremes.maxP99`)
 * 6. "Kew places it in P; it is native to L." (Kew's climate phrase; the native list)
 * "In habitat, Name" opens whichever of 1 and 4 comes first.
 */
import { temp, rain, type Units } from '$core/units';
import { usdaOfShown } from '$dossier/hardiness';

type Month = { tmax: number; tmin: number; precipMm: number };
export interface BriefIn {
  name: string;
  months: readonly Month[] | null;
  annualRain?: { p50?: number | null } | null;
  /** The daily extremes as the page shows them (null where none are shown: not read, set aside, or failed). */
  extremes?: { minP01: number; minAbs: number; maxP99: number; years: number; frostDaysPerYear: number; frostNights?: number; lows?: { from: number; t: ReadonlyArray<number | null> } } | null;
  hardiness?: { usda?: { meanC: number } | null; rhs?: { band: string } | null } | null;
  /** Kew's climate phrase, as Kew gives it ("desert or dry shrubland"). */
  kewClimate?: string | null;
  /** The native regions' names, as the header writes them. */
  native?: readonly string[];
  /** The record's source sentences, for the years each source line names. */
  src?: { normals?: string; extremes?: string } | null;
}
/** A run of the paragraph: plain, a figure (bold), or the name (italic). */
export type Run = { t: string; b?: true; i?: true };
export interface Brief { runs: Run[]; text: string; sources: string[] }

const minus = (s: string) => s.replace(/(^|[\s(])-(?=\d)/g, '$1−');
const t1 = (c: number, u: Units) => minus(temp(c, u, 1));

/** The places as one phrase: "Angola and Namibia"; past three, "A, B and N more regions". */
export function placesPhrase(xs: readonly string[]): string {
  if (xs.length <= 1) return xs.join('');
  if (xs.length <= 3) return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
  return `${xs.slice(0, 2).join(', ')} and ${xs.length - 2} more regions`;
}

/** The frost count the Cold answer reads, or null where it is not held. */
const frostCount = (e: NonNullable<BriefIn['extremes']>) => e.frostNights ?? (Number.isFinite(e.frostDaysPerYear) ? Math.round(e.frostDaysPerYear * e.years) : null);

export function habitatBrief(b: BriefIn, u: Units): Brief | null {
  const m = b.months && b.months.length === 12 ? b.months : null;
  const e = b.extremes ?? null;
  if (!m && !e) return null;
  const runs: Run[] = [];
  const say = (t: string) => runs.push({ t });
  const fig = (t: string) => runs.push({ t, b: true });
  const sources: string[] = [];
  const src = (s: string) => { if (!sources.includes(s)) sources.push(s); };
  const opener = () => { say('In habitat, '); runs.push({ t: b.name, i: true }); };
  const powerYears = (() => {
    const l = e?.lows;
    if (l && l.t.length) return `${l.from}–${l.from + l.t.length - 1}`;
    const x = /daily (\d{4})\D(\d{4})/.exec(b.src?.extremes ?? '');
    return x ? `${x[1]}–${x[2]}` : null;
  })();
  const power = `NASA POWER${powerYears ? `, daily ${powerYears}` : ''}`;
  const chelsaYears = /CHELSA V2\.1 (\d{4})\D(\d{4})/.exec(b.src?.normals ?? '');
  const chelsa = chelsaYears ? `CHELSA V2.1, ${chelsaYears[1]}–${chelsaYears[2]}` : 'CHELSA V2.1';

  let opened = false;
  // 1. The cold floor.
  if (e) {
    opener(); opened = true;
    say(' rarely sees nights below '); fig(t1(e.minP01, u)); say(': only 1 night in 100 is colder at a typical spot. ');
    src(power);
    // 2. The lowest, and the frost.
    const n = e.lows ? e.lows.t.filter((x) => x != null).length : e.years;
    say(`The lowest in ${n} years of records was `); fig(t1(e.minAbs, u));
    const frost = frostCount(e);
    if (frost === 0) say(', with no frost nights');
    else if (frost != null) say(`, with ${frost.toLocaleString('en-GB')} frost night${frost === 1 ? '' : 's'}`);
    say('. ');
  }
  // 3. The hardiness of the habitat, as the page shows it.
  const zone = e && b.hardiness?.usda ? usdaOfShown(b.hardiness.usda.meanC).zone : null;
  const band = e && b.hardiness?.rhs ? b.hardiness.rhs.band : null;
  if (zone || band) {
    say('That places its habitat in ');
    if (zone) fig(`USDA zone ${zone}`);
    if (zone && band) say(' and ');
    if (band) fig(`RHS ${band}`);
    say('. ');
  }
  // 4. The rain.
  if (m) {
    const added = m.reduce((s, x) => s + x.precipMm, 0);
    const across = b.annualRain?.p50 != null;
    const mm = across ? b.annualRain!.p50! : added;
    const dry = m.filter((x) => x.precipMm < 5).length;
    const how = across ? ' at the median across its range' : ', its monthly medians added';
    if (!opened) { opener(); opened = true; say(' gets '); fig(`${rain(mm, u)}`); say(` of rain a year${how}`); }
    else { say('Rain is '); fig(`${rain(mm, u)} a year`); say(how); }
    if (dry) say(`, and ${dry} month${dry === 1 ? '' : 's'} bring${dry === 1 ? 's' : ''} under 5 mm`);
    say('. ');
    src(chelsa);
  }
  // 5. The hottest day in 100.
  if (e) { say('The hottest 1 day in 100 reaches '); fig(t1(e.maxP99, u)); say('. '); }
  // 6. Kew's phrase and the native list.
  const kew = b.kewClimate?.trim() || null;
  const native = b.native?.length ? placesPhrase(b.native) : null;
  if (kew && native) say(`Kew places it in ${kew}; it is native to ${native}.`);
  else if (kew) say(`Kew places it in ${kew}.`);
  else if (native) say(`It is native to ${native}.`);
  if (kew || native) src('Kew, Plants of the World Online');
  // Tidy the runs: no trailing space, adjacent plain runs joined.
  const out: Run[] = [];
  for (const r of runs) { const last = out[out.length - 1]; if (last && !last.b && !last.i && !r.b && !r.i) last.t += r.t; else out.push({ ...r }); }
  if (out.length) out[out.length - 1].t = out[out.length - 1].t.trimEnd();
  return { runs: out, text: out.map((r) => r.t).join(''), sources };
}

/**
 * The title's words after the names (SPECIES 18 d): "hardiness zone" where the page holds a USDA zone or an RHS band,
 * "minimum temperature" where it shows its daily extremes, then "habitat climate"; null where it holds neither, so the
 * title stays as round 103 makes it.
 */
export function titleWords(o: { hardiness: boolean; extremes: boolean }): string | null {
  if (!o.hardiness && !o.extremes) return null;
  return [o.hardiness ? 'hardiness zone' : '', o.extremes ? 'minimum temperature' : '', 'habitat climate'].filter(Boolean).join(', ');
}

/** The description from the same figures: "Name in habitat: nights rarely below X, lowest Y in N years, no frost (NASA POWER); USDA zone Z; R of rain a year (CHELSA)." At most 160 characters (SPECIES 18 d): the zone is left out first, then parts off the end. */
export function briefDescription(b: BriefIn, u: Units): string | null {
  const m = b.months && b.months.length === 12 ? b.months : null;
  const e = b.extremes ?? null;
  if (!m && !e) return null;
  const parts: string[] = [];
  if (e) {
    const frost = frostCount(e);
    const n = e.lows ? e.lows.t.filter((x) => x != null).length : e.years;
    parts.push(`nights rarely below ${t1(e.minP01, u)}, lowest ${t1(e.minAbs, u)} in ${n} years${frost === 0 ? ', no frost' : frost != null ? `, ${frost.toLocaleString('en-GB')} frost night${frost === 1 ? '' : 's'}` : ''} (NASA POWER)`);
  }
  const zone = e && b.hardiness?.usda ? usdaOfShown(b.hardiness.usda.meanC).zone : null;
  const band = e && b.hardiness?.rhs ? b.hardiness.rhs.band : null;
  if (zone) parts.push(`USDA zone ${zone}`);
  else if (band) parts.push(`RHS ${band}`);
  if (m) {
    const across = b.annualRain?.p50 != null;
    const mm = across ? b.annualRain!.p50! : m.reduce((s, x) => s + x.precipMm, 0);
    // The monthly medians added are the median year's total, and said so (round sixty-seven; triage-66 N11).
    parts.push(across ? `${rain(mm, u)} of rain a year (CHELSA)` : `${rain(mm, u)} of rain in the median year (CHELSA)`);
  }
  // 160 at most (SPECIES 18 d's "under about 160"; round fifty-nine held 155). Too long, the zone goes first (the paragraph and the chips give it), then the end, so
  // the rain said as the median year's (round sixty-seven) is kept where the zone would push it out.
  const line = (xs: string[]) => `${b.name} in habitat: ${xs.join('; ')}.`;
  let use = parts;
  if (line(use).length > 160 && zone) use = use.filter((x) => x !== `USDA zone ${zone}`);
  while (use.length > 1 && line(use).length > 160) use = use.slice(0, -1);
  return line(use);
}
