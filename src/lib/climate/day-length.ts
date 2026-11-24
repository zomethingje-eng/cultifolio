/**
 * Day length by month (round 118; SPECIES 19): arithmetic on a latitude, for the 15th of each month. No source is asked.
 *
 * - declination δ = 23.44° × sin(2π × (284 + n) ÷ 365), with n the day of the year;
 * - cos ω = (sin(−0.833°) − sin φ × sin δ) ÷ (cos φ × cos δ), clamped to −1 and 1 for the polar day and night;
 * - hours = 24 ÷ π × ω.
 *
 * The −0.833° is sunrise and sunset by the sun's upper edge with refraction; without it Pittsburgh's December came out
 * at 9.1 h, with it 9.3 h, against Weather Spark's 9 h 17 min (SPECIES 19).
 */
const RAD = Math.PI / 180;
/** The day of the year of the 15th of each month, in a common year. */
export const MID_MONTH_DAY = [15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349] as const;

export function dayLengthHours(latDeg: number, dayOfYear: number): number {
  const decl = 23.44 * Math.sin((2 * Math.PI * (284 + dayOfYear)) / 365);
  const phi = latDeg * RAD, d = decl * RAD;
  const c = (Math.sin(-0.833 * RAD) - Math.sin(phi) * Math.sin(d)) / (Math.cos(phi) * Math.cos(d));
  const omega = Math.acos(Math.max(-1, Math.min(1, c)));
  return (24 / Math.PI) * omega;
}

/** The twelve months' day lengths at a latitude, January first, to a tenth of an hour. */
export function dayLengths(latDeg: number): number[] {
  return MID_MONTH_DAY.map((n) => Math.round(dayLengthHours(latDeg, n) * 10) / 10);
}
