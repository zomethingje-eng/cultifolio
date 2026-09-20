/**
 * How far apart two habitat climates are, as one number: the root of the mean
 * squared difference, month by month, in mean day °C and mean night °C, plus
 * the same for rain on a log scale weighted so that a factor of e (2.7×) in a
 * month's rain counts as three degrees. Months are compared in calendar
 * order, so a southern-hemisphere habitat is not matched to a northern one
 * with the same seasons six months apart: for a plant on a bench that is the
 * right answer, because the two would want opposite halves of the year.
 * Nothing else enters: not range, not family, not photographs. The six
 * nearest are written into the index at build time and shown on the species
 * page as "grows like", with this sentence beside them.
 */
export interface MonthLike {
  tmax: number;
  tmin: number;
  precipMm: number;
}
export const RAIN_WEIGHT = 9; // (3 °C per factor of e)²

export function climateDistance(a: MonthLike[], b: MonthLike[]): number {
  let t = 0, r = 0;
  for (let i = 0; i < 12; i++) {
    const dx = a[i].tmax - b[i].tmax, dn = a[i].tmin - b[i].tmin;
    t += dx * dx + dn * dn;
    const dr = Math.log1p(Math.max(0, a[i].precipMm)) - Math.log1p(Math.max(0, b[i].precipMm));
    r += dr * dr;
  }
  return Math.sqrt(t / 12 + (RAIN_WEIGHT * r) / 12);
}

/** For every key with months, the `n` nearest other keys by climateDistance, nearest first. O(k²): thousands of species in seconds, once, at index time. */
export function nearestByClimate(items: Array<{ key: number; months: MonthLike[] }>, n = 6): Map<number, number[]> {
  const out = new Map<number, number[]>();
  const best = items.map(() => [] as Array<[number, number]>); // per item: [distance, key], kept sorted, at most n
  const admit = (i: number, d: number, key: number) => {
    const arr = best[i];
    if (arr.length >= n && d >= arr[n - 1][0]) return;
    let j = arr.length;
    while (j > 0 && arr[j - 1][0] > d) j--;
    arr.splice(j, 0, [d, key]);
    if (arr.length > n) arr.length = n;
  };
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const d = climateDistance(items[i].months, items[j].months);
      admit(i, d, items[j].key);
      admit(j, d, items[i].key);
    }
  }
  items.forEach((it, i) => out.set(it.key, best[i].map((x) => x[1])));
  return out;
}
