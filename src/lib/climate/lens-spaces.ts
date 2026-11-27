/**
 * The lens's views that read the reader's own spaces (round 127; SPECIES 20): Greenhouse, Windowsill and Under lights,
 * and which view the panel opens on. As with Outdoors (`lens-outdoors.ts`), every line names two figures, the reader's
 * and the habitat's, and none says what the plant will do, want, need or tolerate (rule 3). A line whose input is missing
 * is not drawn; the panel names the missing input and links to where it is set. Nothing here asks anything of anyone:
 * the spaces are read from the collection on the device.
 *
 * The sums, as the hand-off gives them and /about/how says them:
 * - mol a day = µmol/m²/s × hours × 3,600 ÷ 1,000,000;
 * - a reading in lux × 0.0185 = µmol/m²/s, Apogee Instruments' factor for sunlight (credited to Thimijan and Heins,
 *   1983), daylight through glass taken as sunlight;
 * - a lamp's µmol/m²/s at the plant for a share of a day's light = mol a day × share × 1,000,000 ÷ (hours × 3,600).
 */
import type { LocationKind } from '$lib/db/types';

export type LensView = 'none' | 'outdoors' | 'greenhouse' | 'windowsill' | 'lights' | 'species';
export const LENS_VIEWS: Array<{ k: LensView; label: string }> = [
  { k: 'none', label: 'Nothing' },
  { k: 'outdoors', label: 'Outdoors' },
  { k: 'greenhouse', label: 'Greenhouse' },
  { k: 'windowsill', label: 'Windowsill' },
  { k: 'lights', label: 'Under lights' },
  { k: 'species', label: 'Another species' }
];
export const isLensView = (v: unknown): v is LensView => LENS_VIEWS.some((x) => x.k === v);

/** Apogee Instruments' factor from lux to µmol/m²/s for sunlight. */
export const LUX_TO_PPFD = 0.0185;
export const luxToPpfd = (lux: number): number => Math.round(lux * LUX_TO_PPFD);
export const molADay = (ppfd: number, hours: number): number => (ppfd * hours * 3600) / 1e6;
export const LAMP_HOURS = [12, 14, 16] as const;
export const LAMP_SHARES = [0.25, 0.5, 0.75, 1] as const;
/** µmol/m²/s at the plant that gives `mol` a day over `hours`. */
export const ppfdFor = (mol: number, hours: number): number => Math.round((mol * 1e6) / (hours * 3600));

/** The view a space's kind opens: the hand-off's table; a room, shelf, bench, tray or other space with lamp hours is under lights. */
export function viewOfKind(kind: LocationKind | string | null | undefined, lampHours: number | null): LensView | null {
  if (kind === 'garden' || kind === 'outdoor') return 'outdoors';
  if (kind === 'greenhouse' || kind === 'coldframe') return 'greenhouse';
  if (kind === 'windowsill') return 'windowsill';
  if (kind === 'room' || kind === 'shelf' || kind === 'bench' || kind === 'tray' || kind === 'other') return lampHours != null && lampHours > 0 ? 'lights' : 'windowsill';
  return null;
}

/**
 * Which view opens: the space of the reader's plant of this species (with several, the one whose log was written last,
 * else the one added last), by its kind; else the view used last; else Nothing.
 */
export function openingView(plants: Array<{ space: { kind: LocationKind | string | null | undefined; lampHours: number | null } | null; latest: string }>, last: unknown): { view: LensView; from: 'plant' | 'last' | 'none'; index: number } {
  const placed = plants.map((p, i) => ({ p, i })).filter((x) => x.p.space && viewOfKind(x.p.space.kind, x.p.space.lampHours));
  if (placed.length) {
    const top = placed.reduce((a, b) => (b.p.latest > a.p.latest ? b : a));
    return { view: viewOfKind(top.p.space!.kind, top.p.space!.lampHours)!, from: 'plant', index: top.i };
  }
  if (isLensView(last) && last !== 'none') return { view: last, from: 'last', index: -1 };
  return { view: 'none', from: 'none', index: -1 };
}

type HabitatMonth = { tmax: number; tmin: number; dli?: number };
export type SpaceLine = { k: string; text: string };
type Fmt = { temp: (c: number) => string; dtemp: (c: number) => string };

const coolestNight = (h: HabitatMonth[]) => Math.min(...h.map((m) => m.tmin));
/** "0.5 °C under its cold floor (5.5 °C)", "over", or "at", in the reader's units. */
function against(yours: number, its: number, what: string, f: Fmt): string {
  const d = Math.round((yours - its) * 10) / 10;
  return d === 0 ? `at ${what} (${f.temp(its)})` : `${f.dtemp(Math.abs(d))} ${d < 0 ? 'under' : 'over'} ${what} (${f.temp(its)})`;
}

export const GLASS = 'Light under glass is not estimated.';

/** Greenhouse or cold frame: the temperature the space is held at (or bottoms out at) against the floor and the coolest nights. */
export function greenhouseLines(o: { heldC: number; held: boolean; floorC: number | null; habitat: HabitatMonth[] } & Fmt): SpaceLine[] {
  const out: SpaceLine[] = [];
  const said = `${o.held ? 'Held at' : 'Its coldest'} ${o.temp(o.heldC)}`;
  if (o.floorC != null) out.push({ k: 'floor', text: `${said}: ${against(o.heldC, o.floorC, 'its cold floor', o)}.` });
  out.push({ k: 'nights', text: `${said}: ${against(o.heldC, coolestNight(o.habitat), "its coolest month's average night", o)}.` });
  return out;
}

/** Windowsill: the space's light and hours as mol a day against the habitat's darkest and brightest months; its winter night against the coolest nights. */
export function windowsillLines(o: { ppfd: number | null; hours: number | null; nightC: number | null; habitat: HabitatMonth[] } & Fmt): SpaceLine[] {
  const out: SpaceLine[] = [];
  const dli = o.habitat.map((m) => m.dli).filter((v): v is number => v != null);
  if (o.ppfd != null && o.hours != null && dli.length === 12) {
    const mol = molADay(o.ppfd, o.hours), dark = Math.min(...dli), bright = Math.max(...dli);
    out.push({ k: 'light', text: `${o.ppfd} µmol/m²/s for ${o.hours} h is ${mol.toFixed(1)} mol a day: ${Math.round((mol / dark) * 100)}% of its darkest month (${dark.toFixed(1)}) and ${Math.round((mol / bright) * 100)}% of its brightest (${bright.toFixed(1)}).` });
  }
  if (o.nightC != null) {
    const its = coolestNight(o.habitat), d = Math.round((o.nightC - its) * 10) / 10;
    out.push({ k: 'nights', text: `Your winter night, ${o.temp(o.nightC)}: ${d === 0 ? 'the same as' : `${o.dtemp(Math.abs(d))} ${d > 0 ? 'warmer' : 'cooler'} than`} its coolest month's average night (${o.temp(its)}).` });
  }
  return out;
}

/** Under lights: the table of µmol/m²/s at the plant for shares of the darkest month's light, by hours; the year's mean last. */
export function lampTable(habitat: HabitatMonth[]): { dark: number; mean: number; rows: Array<{ label: string; share: number | null; cells: number[] }> } | null {
  const dli = habitat.map((m) => m.dli).filter((v): v is number => v != null);
  if (dli.length !== 12) return null;
  const dark = Math.min(...dli), mean = dli.reduce((a, v) => a + v, 0) / 12;
  const rows = LAMP_SHARES.map((s) => ({ label: `${s * 100}% of its darkest month`, share: s as number | null, cells: LAMP_HOURS.map((h) => ppfdFor(dark * s, h)) }));
  rows.push({ label: "The year's mean", share: null, cells: LAMP_HOURS.map((h) => ppfdFor(mean, h)) });
  return { dark, mean, rows };
}

export function lightsLines(o: { ppfd: number | null; hours: number | null; habitat: HabitatMonth[]; days: number[] } & Fmt): SpaceLine[] {
  const out: SpaceLine[] = [];
  const dli = o.habitat.map((m) => m.dli).filter((v): v is number => v != null);
  if (o.ppfd != null && o.hours != null && dli.length === 12) {
    const mol = molADay(o.ppfd, o.hours), dark = Math.min(...dli);
    out.push({ k: 'lamp', text: `Your lamp, ${o.ppfd} µmol/m²/s for ${o.hours} h, is ${mol.toFixed(1)} mol a day: ${Math.round((mol / dark) * 100)}% of its darkest month (${dark.toFixed(1)}).` });
  }
  const gap = o.habitat.reduce((a, m) => a + (m.tmax - m.tmin), 0) / o.habitat.length;
  out.push({ k: 'day', text: `Its day length runs ${Math.min(...o.days).toFixed(1)} to ${Math.max(...o.days).toFixed(1)} h through the year, and its nights average ${o.dtemp(gap)} cooler than its days.` });
  return out;
}

/** Which of a lamp table's cells is the space's own lamp: its hours a column and its light within 5% of the cell's. */
export function lampCell(table: NonNullable<ReturnType<typeof lampTable>>, ppfd: number | null, hours: number | null): [number, number] | null {
  if (ppfd == null || hours == null) return null;
  const c = LAMP_HOURS.indexOf(hours as 12 | 14 | 16);
  if (c < 0) return null;
  let best: [number, number] | null = null, gap = Infinity;
  table.rows.forEach((r, i) => { const g = Math.abs(r.cells[c] - ppfd) / r.cells[c]; if (g < gap) { gap = g; best = [i, c]; } });
  return gap <= 0.05 ? best : null;
}

/**
 * Another species (round 128; SPECIES 20): two habitats side by side, each in its own season. Where the two typical cells
 * lie in different hemispheres the other's months are moved six, and the card says so. The lines: the two ranges of
 * nights, the two cold floors, the two years' rain, the two warmest months' days. Two figures a line, as every view.
 */
export const otherShift = (lat: number, otherLat: number): number => ((lat < 0) !== (otherLat < 0) ? 6 : 0);
export function speciesLines(o: {
  name: string; other: string; habitat: Array<{ tmax: number; tmin: number; precipMm: number }>; theirs: Array<{ tmax: number; tmin: number; precipMm: number }>;
  floorC: number | null; theirFloorC: number | null; temp: (c: number) => string; mm: (n: number) => string;
}): SpaceLine[] {
  const nights = (h: typeof o.habitat) => `${o.temp(Math.min(...h.map((m) => m.tmin)))} to ${o.temp(Math.max(...h.map((m) => m.tmin)))}`;
  const out: SpaceLine[] = [{ k: 'nights', text: `Average nights through the year: ${nights(o.theirs)} for ${o.other}; ${nights(o.habitat)} for ${o.name}.` }];
  if (o.floorC != null && o.theirFloorC != null) out.push({ k: 'floor', text: `Cold floors: ${o.temp(o.theirFloorC)} for ${o.other}; ${o.temp(o.floorC)} for ${o.name}.` });
  const yr = (h: typeof o.habitat) => o.mm(h.reduce((a, m) => a + m.precipMm, 0));
  out.push({ k: 'rain', text: `Rain a year: ${yr(o.theirs)} for ${o.other}; ${yr(o.habitat)} for ${o.name}.` });
  const warm = (h: typeof o.habitat) => o.temp(Math.max(...h.map((m) => m.tmax)));
  out.push({ k: 'days', text: `The warmest month's average day: ${warm(o.theirs)} for ${o.other}; ${warm(o.habitat)} for ${o.name}.` });
  return out;
}

/**
 * A space's view from its path, the space first, then each above it (round 130): a garden bed, outdoors, a greenhouse, a
 * cold frame or a windowsill decides by its kind; a room, shelf, bench, tray or other space with its light and hours set
 * is under lights; without them, the nearest space above it that decides gives its view (a bench in a greenhouse is under
 * glass), else Windowsill, as the hand-off's table has it for such a space alone.
 */
export function viewOfPath(kinds: Array<string | null | undefined>, lampHours: number | null): LensView | null {
  let holder = false;
  for (const k of kinds) {
    if (k === 'garden' || k === 'outdoor' || k === 'greenhouse' || k === 'coldframe' || k === 'windowsill') return viewOfKind(k, null);
    if (k === 'room' || k === 'shelf' || k === 'bench' || k === 'tray' || k === 'other') {
      if (lampHours != null && lampHours > 0) return 'lights';
      holder = true;
    }
  }
  return holder ? 'windowsill' : null;
}
