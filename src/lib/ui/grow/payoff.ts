/**
 * The payoff after "Add one to my plants" (round 107; the first hand-off's round 7): one comparison, at once, of a figure
 * the grower entered for the plant's space and the species' habitat figure beside it, each named with its source, and no
 * advice (rules 1 and 3). The plant page's own comparison (its "Habitat and here" fold) and the species page's place line
 * read the same figures; this is the first of them that the records hold, in this order:
 *
 * 1. the space's floor against the habitat's cold floor (the night one in a hundred is colder, NASA POWER);
 * 2. the floor against the habitat's coldest-month mean nightly low (CHELSA), where the cold floor was not read;
 * 3. the space's light against the open sky over the habitat (CHELSA);
 * 4. none: the space holds neither figure, and the card asks for its floor.
 */
import { temp, deltaT, type Units } from '$core/units';

export interface PayoffIn {
  /** The space's name (the plant's own space), and the figures it holds or inherits (`collection.conditions`). */
  space: string;
  floorC: number | null;
  floorHeld: boolean;
  ppfd: number | null;
  lightHours: number | null;
  /** The habitat's cold floor (`climate.extremes`), when it was read. */
  coldFloor: { minP01: number; years: number } | null;
  /** The habitat's coldest month: its mean nightly low and the month's name. */
  coldMonth: { tmin: number; month: string } | null;
  /** The open sky's daily light over the habitat across the year (median year), mol/m²/day. */
  sky: { lo: number; hi: number } | null;
  units: Units;
}
export type Payoff = { kind: 'cold' | 'night' | 'light'; text: string } | { kind: 'none'; text: string };

/** "2.5 °C over" or "the same as": the gap at one decimal, said as the place line says it. */
function gap(here: number, there: number, u: Units): string {
  const d = here - there;
  const g = deltaT(Math.abs(d), u, 1);
  return Number(g.split(' ')[0]) === 0 ? 'the same as' : `${g} ${d < 0 ? 'under' : 'over'}`;
}

export function payoff(p: PayoffIn): Payoff {
  const u = p.units;
  const yours = `Your ${p.space}`;
  if (p.floorC != null) {
    const floor = `${p.floorHeld ? 'held at' : 'floor'} ${temp(p.floorC, u, 1)} (as you set it)`;
    if (p.coldFloor) return { kind: 'cold', text: `${yours}: ${floor}, ${gap(p.floorC, p.coldFloor.minP01, u)} this habitat's cold floor, ${temp(p.coldFloor.minP01, u, 1)} (one night in a hundred colder, over ${p.coldFloor.years} years, NASA POWER).` };
    if (p.coldMonth) return { kind: 'night', text: `${yours}: ${floor}, ${gap(p.floorC, p.coldMonth.tmin, u)} the habitat's coldest-month mean nightly low, ${temp(p.coldMonth.tmin, u, 1)} in ${p.coldMonth.month} (median year, CHELSA).` };
  }
  if (p.ppfd != null && p.sky) {
    const dli = (p.ppfd * (p.lightHours ?? 12) * 3600) / 1e6;
    return { kind: 'light', text: `${yours}: ${dli.toFixed(0)} mol/m²/day (from the light you set${p.lightHours == null ? ', 12 hours assumed' : ` over ${p.lightHours} hours`}); the open sky over the habitat ${p.sky.lo.toFixed(0)}–${p.sky.hi.toFixed(0)} mol/m²/day across the year (median year, CHELSA).` };
  }
  return { kind: 'none', text: `${yours} has no floor set: the coldest it gets, which the page sets beside the habitat's.` };
}
