/**
 * Round 108 (docs/PLAN-108.md; the first hand-off's round 5): a habitat climate from records placed only to within 30 km,
 * where the records placed to within 10 km give none. iNaturalist obscures a threatened or collected plant's location by moving
 * it to a random point in a 0.2° cell, and many succulents and orchids are only so placed: of 9,948 pages with no climate for
 * want of placed records, 1,093 would have one from such records (round 107's count, bulk/r107).
 *
 * The proof (scripts/dev/r108-blur-proof.ts; bulk/r108): 422 species with 30 or more records placed to within 1 km, blurred
 * as iNaturalist blurs and read by this rule, against the same records read exactly. The months, the rain and the light held
 * within the bar set before the run, twice on independent blurs; the cold floor, read at one point (NASA POWER's 0.5° cell
 * at the typical spot), moved over 2.5 °C for one species in ten, so a coarse climate carries no NASA POWER figure.
 *
 * The rule:
 *   - a record is coarse when its dataset states an uncertainty over 10 km and at most `COARSE_M`;
 *   - only inside the regions the proof read (`COARSE_REGIONS`); another region joins by its own proof;
 *   - each coarse record is read as an area: the mean of the climate grid's land cells whose centres lie within
 *     `areaRadiusM` of it (the half-diagonal of iNaturalist's 0.2° cell, the area the proof measured), not as a point;
 *   - one area per three-decimal position; three areas are needed, as three cells are for the 10 km climate;
 *   - the two tiers are never mixed: a coarse climate is read from coarse records alone, and only where the 10 km records
 *     give no climate.
 */
export const COARSE_M = 30_000;
/** iNaturalist's obscured cell, in degrees. */
export const OBSCURED_DEG = 0.2;
export const COARSE_KM = COARSE_M / 1000;

/** The regions the proof read, by the boxes it used. */
export const COARSE_REGIONS = [
  { id: 'southern-africa', name: 'southern Africa', s: -35, n: -17, w: 11, e: 33 },
  { id: 'south-east-asia', name: 'South-East Asia (the Malay peninsula, Sumatra, Borneo, Java)', s: -6.5, n: 7.5, w: 95, e: 119.5 }
] as const;

/** The proved region a position lies in, or null. */
export function coarseRegionOf(lat: number, lon: number): (typeof COARSE_REGIONS)[number] | null {
  return COARSE_REGIONS.find((r) => lat >= r.s && lat <= r.n && lon >= r.w && lon <= r.e) ?? null;
}

/** Whether a record's stated uncertainty makes it a coarse one (over 10 km, at most 30 km). */
export const isCoarse = (uncertaintyM: number | null | undefined): boolean => uncertaintyM != null && uncertaintyM > 10_000 && uncertaintyM <= COARSE_M;

/** The radius a coarse record's area is read over: the half-diagonal of a 0.2° cell at its latitude, in metres. */
export function areaRadiusM(lat: number): number {
  const dy = (OBSCURED_DEG / 2) * 111_320, dx = (OBSCURED_DEG / 2) * 111_320 * Math.cos((lat * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

/** Why a coarse climate has no cold floor, said where the floor would be (rule 2: not derived, and why, never none). */
export const COARSE_NO_FLOOR = `not derived: the records are placed only to within ${COARSE_KM} km, and the cold floor is read at one point, which such records cannot fix (round 108's proof: it moved more than 2.5 °C for one species in ten)`;

/** The mark a coarse climate carries beside its figures. */
export const COARSE_MARK = `from records placed only to within ${COARSE_KM} km`;

/**
 * The Climate section's notice on a coarse climate (`#coarse-records`): what the figures rest on, what is left out and why,
 * and the few-records counts where they apply, in one sentence each.
 */
export function coarseSentence(c: { km: number; areas: number }, records: number): string {
  return `From records placed only to within ${c.km} km: no three land cells hold a record of this plant placed to within 10 km, so this habitat climate is read from ${records} record${records === 1 ? '' : 's'} in ${c.areas} area${c.areas === 1 ? '' : 's'}, each placed by its publisher only to within ${c.km} km and read as the mean of the land around it. The months, the rain and the light are shown; no cold floor, record low or hardiness band is derived, since those are read at one point, which such records cannot fix.`;
}
