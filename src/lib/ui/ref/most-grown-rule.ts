/**
 * The popular genera (round seventy-five, the owner's decision): the file `scripts/most-grown-genera.txt` read, and the
 * rule behind the catalogue's "Popular genera" chip, a filter off by default and the same on every device. Pure, so the rule
 * is tested on the real file and on made-up ones.
 *
 * The rule, as /about/how says it: the fewest genera of the reference, taken from the most observed down, that together
 * hold half of the observations marked captive or cultivated on iNaturalist of all the reference's genera that were
 * counted. A genus refused, not checked or not in the file is not counted, and is not under the chip.
 *
 * Why half (measured on 17 October 2026, round seventy-five's report): over the reference's 1,291 counted genera it is 95
 * genera, 1,225 species; over every active genus iNaturalist has a captive observation of, 8,464 (a genus without one adds
 * nothing), it is 119, what a reference that held every cultivated genus would show. Four fifths would be 315 now and
 * 414 then, most of the catalogue rather than its head. The share, not a fixed number, so the set follows the reference
 * as it grows without a number chosen by hand.
 */

export const SHARE = 0.5;

export type MostGrown = {
  /** The day the counts were read (YYYY-MM-DD), or '' when the file names none. */
  day: string;
  /** Each counted genus: its iNaturalist taxon id and its captive observations. */
  counts: Map<string, { id: number; n: number }>;
  /** Genera whose request failed: no count, never 0. */
  notChecked: Set<string>;
  /** Genera no iNaturalist taxon was taken for, with the reason. */
  refused: Map<string, string>;
};

/** The file's lines: `day`, `genus` (name, id, count or "not checked"), `refused` (name, reason); comments and the rest are read past. */
export function parseMostGrown(text: string): MostGrown {
  const m: MostGrown = { day: '', counts: new Map(), notChecked: new Set(), refused: new Map() };
  for (const raw of text.split(/\r?\n/)) {
    if (!raw || raw.startsWith('#')) continue;
    const f = raw.split('\t');
    if (f[0] === 'day' && /^\d{4}-\d{2}-\d{2}$/.test(f[1] ?? '')) m.day = f[1];
    else if (f[0] === 'genus' && f[1]) {
      const id = Number(f[2]);
      const n = /^\d+$/.test(f[3] ?? '') ? Number(f[3]) : NaN;
      if (Number.isSafeInteger(n) && Number.isSafeInteger(id) && id > 0) m.counts.set(f[1], { id, n });
      else m.notChecked.add(f[1]); // "not checked", or a line that does not read: no count is taken from it
    } else if (f[0] === 'refused' && f[1]) m.refused.set(f[1], f[2] ?? '');
  }
  for (const g of m.counts.keys()) m.notChecked.delete(g);
  return m;
}

/** The rule: the genera the reference holds that the file counts, most observed first (then by name), until they hold half. */
export function openingGenera(m: MostGrown, held: Iterable<string>, share = SHARE): { genera: string[]; counted: number; observations: number; covered: number } {
  const ranked = [...new Set(held)].flatMap((g) => { const c = m.counts.get(g); return c ? [{ g, n: c.n }] : []; }).sort((a, b) => b.n - a.n || a.g.localeCompare(b.g));
  const observations = ranked.reduce((s, r) => s + r.n, 0);
  const genera: string[] = [];
  let covered = 0;
  if (observations > 0) for (const r of ranked) { if (covered >= share * observations) break; genera.push(r.g); covered += r.n; }
  return { genera, counted: ranked.length, observations, covered };
}
