/**
 * The habitat's hardiness, worked out from the page's own NASA POWER figures (round eighty-seven, the plan's C10 and the
 * stage-2 contract's `hardiness`): the zone of USDA's scheme the mean of the typical cell's yearly lowest nights falls
 * in, and the band of the RHS hardiness rating the record low falls in. Both are the habitat's, read from where the
 * plant grows wild; neither is a tested hardiness of the plant.
 *
 * USDA (the Plant Hardiness Zone Map, USDA Agricultural Research Service with Oregon State University's PRISM group,
 * https://planthardiness.ars.usda.gov/ and https://prism.oregonstate.edu/phzm/): a zone is the 30-year average of each
 * year's lowest winter temperature ("average annual extreme minimum temperature", 1991–2020 for the 2023 map), in 10 °F
 * zones from 1 (−60 to −50 °F) to 13 (60 to 70 °F), each split into 5 °F halves, "a" the colder. Here the mean is of
 * every complete calendar year the series holds (1981–2024 at most: 44 years, not USDA's 30), and the page says how
 * many; a zone's lower bound is in it, its upper bound the next half-zone's.
 *
 * RHS (the Royal Horticultural Society's hardiness rating, 2012,
 * https://www.rhs.org.uk/plants/trials-awards/award-of-garden-merit/rhs-hardiness-rating): H1a warmer than 15 °C; H1b 10
 * to 15; H1c 5 to 10; H2 1 to 5; H3 −5 to 1; H4 −10 to −5; H5 −15 to −10; H6 −20 to −15; H7 colder than −20. The RHS
 * rates a plant by the coldest it takes; here the record low is placed in the band it falls in, and a figure on a band's
 * edge (−5.0 °C) is in the warmer band, whose range it closes (the RHS's table gives each edge to both), but for 15.0 °C,
 * which is H1b: H1a is "warmer than 15 °C", so it does not hold 15 (round eighty-seven's review of stage 2, S7; the
 * sentence on /about/how names the exception).
 */

export interface HardinessFigures {
  /** USDA's zone of the mean yearly low; absent where the yearly lows are not held or too few years are whole. */
  usda?: {
    /** The complete calendar years averaged, and the first and last of the series. */
    years: number;
    from: number;
    to: number;
    /**
     * The mean of the yearly lows, °C to one decimal, and that figure in °F exactly (two decimals at most: −12.2 °C is
     * 10.04 °F), so the page's sum is true (`usdaOfShown`; round eighty-seven's review of stage 2, M1).
     */
    meanC: number;
    meanF: number;
    /** "9b"; "below 1a" or "above 13b" outside USDA's scale. */
    zone: string;
  };
  /** Why `usda` is absent: the words the page says. */
  usdaWhy?: string;
  /** The record low and the RHS band it falls in. */
  rhs: { lowC: number; band: RhsBand; years: number };
  /** Where the figures are from: the climate's own source of the extremes. */
  src: string;
}

export type RhsBand = 'H1a' | 'H1b' | 'H1c' | 'H2' | 'H3' | 'H4' | 'H5' | 'H6' | 'H7';

/** The RHS's bands, warmest first: each band's lower edge in °C (a figure at or above it, below the band before, is in it). */
export const RHS_BANDS: ReadonlyArray<{ band: RhsBand; above: number; words: string; range: string }> = [
  { band: 'H1a', above: 15, words: 'heated glasshouse, tropical', range: 'warmer than 15 °C' },
  { band: 'H1b', above: 10, words: 'heated glasshouse, subtropical', range: '10 to 15 °C' },
  { band: 'H1c', above: 5, words: 'heated glasshouse, warm temperate', range: '5 to 10 °C' },
  { band: 'H2', above: 1, words: 'tender, cool or frost-free glasshouse', range: '1 to 5 °C' },
  { band: 'H3', above: -5, words: 'half-hardy, unheated glasshouse or mild winter', range: '−5 to 1 °C' },
  { band: 'H4', above: -10, words: 'hardy, average winter', range: '−10 to −5 °C' },
  { band: 'H5', above: -15, words: 'hardy, cold winter', range: '−15 to −10 °C' },
  { band: 'H6', above: -20, words: 'hardy, very cold winter', range: '−20 to −15 °C' },
  { band: 'H7', above: -Infinity, words: 'very hardy', range: 'colder than −20 °C' }
];

/**
 * The band a temperature falls in. H1a is "warmer than 15", so 15.0 is H1b; every other edge is the warmer band's
 * (−5.0 is H3, "−5 to 1"), so a band is (its lower edge, the next one's] but for H1a, which is open at 15.
 */
export function rhsBand(c: number): RhsBand {
  if (c > 15) return 'H1a';
  for (const b of RHS_BANDS.slice(1)) if (c >= b.above) return b.band;
  return 'H7';
}
export const rhsOf = (band: RhsBand) => RHS_BANDS.find((b) => b.band === band)!;

/** °C as °F, unrounded. */
export const cToF = (c: number) => (c * 9) / 5 + 32;
const r1 = (x: number) => Math.round(x * 10) / 10;

/** USDA's zone of a temperature in °F: 1a from −60 °F, each half-zone 5 °F; "below 1a" under −60, "above 13b" from 70. */
export function usdaZone(f: number): string {
  if (f < -60) return 'below 1a';
  if (f >= 70) return 'above 13b';
  const steps = Math.floor((f + 60) / 5); // 0 = 1a, 1 = 1b, 2 = 2a …
  return `${Math.floor(steps / 2) + 1}${steps % 2 ? 'b' : 'a'}`;
}
/**
 * The USDA line as the page prints it (round eighty-seven's review of stage 2, M1): the mean °C to one decimal, that
 * figure × 9 ÷ 5 + 32 exactly (in hundredths of a degree, so no rounding at all: a tenth of a °C is 0.18 °F), and the zone
 * of that °F. Every figure the sum prints is the one the next is worked from, so the sum is true and the zone follows
 * from it. Before, the zone was the unrounded mean's: a mean of 4.44 °C printed "4.4 × 9 ÷ 5 + 32 = 40.0 °F, in zone
 * 10b (35 to 40 °F)", and −12.24 °C "10.0 °F, in zone 7b".
 */
export function usdaOfShown(meanC: number): { c: number; f: number; fText: string; zone: string } {
  const tenths = Math.round(meanC * 10);
  const hundredths = tenths * 18 + 3200;
  const a = Math.abs(hundredths), whole = Math.floor(a / 100), frac = a % 100;
  const fText = `${hundredths < 0 ? '-' : ''}${whole}.${frac % 10 === 0 ? frac / 10 : String(frac).padStart(2, '0')}`;
  // The zone from the hundredths themselves: an edge (−6000, 1000, 3500 …) is a whole number of them, never a float's near miss.
  const zone = hundredths < -6000 ? 'below 1a' : hundredths >= 7000 ? 'above 13b' : (() => { const steps = Math.floor((hundredths + 6000) / 500); return `${Math.floor(steps / 2) + 1}${steps % 2 ? 'b' : 'a'}`; })();
  return { c: tenths / 10, f: hundredths / 100, fText, zone };
}

/** A zone's range in °F, as USDA's legend gives it ("10 to 15 °F"). */
export function usdaRange(zone: string): string | null {
  const m = /^(\d{1,2})([ab])$/.exec(zone);
  if (!m) return null;
  const lo = -60 + (Number(m[1]) - 1) * 10 + (m[2] === 'b' ? 5 : 0);
  const f = (x: number) => (x < 0 ? `−${-x}` : String(x));
  return `${f(lo)} to ${f(lo + 5)} °F`;
}

/** The complete years a mean must rest on: 20, the least `extremesUsable` takes of the series. */
export const USDA_YEARS_MIN = 20;

type Ex = { years: number; minAbs: number; lows?: { from: number; t: Array<number | null> } | null };
type ClimateIn = { status: string; extremes?: Ex | null; src?: { extremes?: string } };

/**
 * The page's hardiness figures from its climate as shown (`setAsideExtremes` already applied: extremes read at sea or
 * beyond a lapse correction are none here). Null where the page shows no daily extremes: no record low, no band.
 */
export function hardinessOf(c: ClimateIn): HardinessFigures | null {
  if (c.status !== 'ok' || !c.extremes) return null;
  const ex = c.extremes;
  const src = c.src?.extremes ?? 'NASA POWER (MERRA-2) daily';
  const rhs = { lowC: r1(ex.minAbs), band: rhsBand(r1(ex.minAbs)), years: ex.years };
  const lows = ex.lows;
  if (!lows || !Array.isArray(lows.t) || !lows.t.length) return { rhs, usdaWhy: 'the yearly lows are not held in this page’s record yet', src };
  const whole = lows.t.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  if (whole.length < USDA_YEARS_MIN) return { rhs, usdaWhy: `only ${whole.length} of the ${lows.t.length} years are complete; a mean needs ${USDA_YEARS_MIN}`, src };
  const meanC = whole.reduce((a, x) => a + x, 0) / whole.length;
  // The zone of the mean as shown (one decimal) in °F as shown, so the page's sum and zone agree (M1).
  const u = usdaOfShown(meanC);
  return { usda: { years: whole.length, from: lows.from, to: lows.from + lows.t.length - 1, meanC: u.c, meanF: u.f, zone: u.zone }, rhs, src };
}
