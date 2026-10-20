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

/**
 * For every key with months, the `n` nearest other keys by climateDistance, nearest first. O(k²), once, at index time.
 * Round seventy-nine: each species' 36 figures (day and night °C, and the rain's log) are worked out once, not once a
 * pair, and each pair's distance is then climateDistance's to the bit (the same operations in the same order), so the
 * lists are the same. The logarithms a pair took most of the time: 73 s for 5,567 species on the review's shared machine
 * (15 million pairs), where the full list's corpus has 30,000 to 40,000 species with a climate (450 to 820 million).
 */
export function nearestByClimate<K>(items: Array<{ key: K; months: MonthLike[] }>, n = 6): Map<K, K[]> {
  const out = new Map<K, K[]>();
  const best = items.map(() => [] as Array<[number, K]>); // per item: [distance, key], kept sorted, at most n
  const admit = (i: number, d: number, key: K) => {
    const arr = best[i];
    if (arr.length >= n && d >= arr[n - 1][0]) return;
    let j = arr.length;
    while (j > 0 && arr[j - 1][0] > d) j--;
    arr.splice(j, 0, [d, key]);
    if (arr.length > n) arr.length = n;
  };
  const k = items.length;
  const f = new Float64Array(k * 36); // per item: tmax × 12, tmin × 12, then log1p(rain) × 12
  items.forEach((it, i) => {
    for (let m = 0; m < 12; m++) {
      f[i * 36 + m] = it.months[m].tmax;
      f[i * 36 + 12 + m] = it.months[m].tmin;
      f[i * 36 + 24 + m] = Math.log1p(Math.max(0, it.months[m].precipMm));
    }
  });
  // Each item's sixth nearest so far once it has six (NaN before: no distance is at least NaN). A pair whose distance
  // over the first months is already at least both is admitted by neither, since the sum only grows (and a rounded sum
  // and its root grow with it), so its other months are not read: the same lists, in about half the time at full size
  // (818 million pairs for the 40,466 climates of the review's full-size corpus).
  const worst = new Float64Array(k).fill(NaN);
  const keep = (i: number) => { if (best[i].length >= n) worst[i] = best[i][n - 1][0]; };
  for (let i = 0; i < k; i++) {
    const a = i * 36;
    for (let j = i + 1; j < k; j++) {
      const b = j * 36;
      let t = 0, r = 0, m = 0;
      for (; m < 12; m++) {
        const dx = f[a + m] - f[b + m], dn = f[a + 12 + m] - f[b + 12 + m];
        t += dx * dx + dn * dn;
        const dr = f[a + 24 + m] - f[b + 24 + m];
        r += dr * dr;
        if ((m === 3 || m === 7) && worst[i] === worst[i] && worst[j] === worst[j]) {
          const so = Math.sqrt(t / 12 + (RAIN_WEIGHT * r) / 12);
          if (so >= worst[i] && so >= worst[j]) break;
        }
      }
      if (m < 12) continue;
      const d = Math.sqrt(t / 12 + (RAIN_WEIGHT * r) / 12);
      admit(i, d, items[j].key); keep(i);
      admit(j, d, items[i].key); keep(j);
    }
  }
  items.forEach((it, i) => out.set(it.key, best[i].map((x) => x[1])));
  return out;
}
