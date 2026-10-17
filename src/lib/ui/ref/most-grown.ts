/**
 * The most-grown genera (round seventy-five, the owner's decision): the catalogue's "Most grown" chip, off by default and
 * the same on every device, shows the species of these genera. The counts are `scripts/most-grown-genera.txt`
 * (iNaturalist's observations marked captive or cultivated, written by `scripts/most-grown-genera.ts`); the rule is
 * `most-grown-rule.ts`. Read on the server only: the page is sent the chip's counts, and the genera's names only while
 * the chip is on (its search filters by them), never the file.
 */
import fileText from '../../../../scripts/most-grown-genera.txt?raw';
import { genusOf } from '$core/names';
import { parseMostGrown, openingGenera } from './most-grown-rule';

export const MOST_GROWN = parseMostGrown(fileText);

type Named = { name: string };
/** Kept once per index the corpus holds, not worked out per request. */
const kept = new WeakMap<Named[], { genera: ReadonlySet<string>; species: number }>();

function of(index: Named[]): { genera: ReadonlySet<string>; species: number } {
  let v = kept.get(index);
  if (!v) {
    const genera = new Set(openingGenera(MOST_GROWN, index.map((e) => genusOf(e.name))).genera);
    v = { genera, species: index.filter((e) => genera.has(genusOf(e.name))).length };
    kept.set(index, v);
  }
  return v;
}

/** The most-grown genera among those the index holds, by the rule; empty when no genus of it is counted. */
export const grownGenera = (index: Named[]): ReadonlySet<string> => of(index).genera;

/** What the chip says: how many genera and species it shows; null when none is counted (a file not written, or every request failed), and then no chip is drawn. */
export function grownChip(index: Named[]): { genera: number; species: number } | null {
  const v = of(index);
  return v.genera.size ? { genera: v.genera.size, species: v.species } : null;
}
