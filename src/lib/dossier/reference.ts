/**
 * The reference's species, as a build or a fill reads them from the corpus (round seventy, second pass;
 * REVIEW-TRIAGE-69 B5, R47-1): by name, by key, by genus, and by epithet within a family. Built from the index's entries
 * or the dossiers on disk; pure, so a test builds one from a list.
 */
import { spellingKey } from './epithet';

export interface Reference {
  /** The key of the species that holds this name as its accepted name, if any. */
  keyOf(name: string): number | undefined;
  /** Whether a key is a species of this reference. */
  isSpecies(key: number): boolean;
  /** Whether a genus is the genus of any species of this reference. */
  hasGenus(genus: string): boolean;
  /** The species of a family whose epithet is this one in some spelling or gender (`spellingKey`). */
  byEpithet(epithet: string, family?: string): Array<{ key: number; name: string }>;
}

export function referenceOf(entries: ReadonlyArray<{ key: number; name: string; family?: string }>): Reference {
  const byName = new Map<string, number>();
  const keys = new Set<number>();
  const genera = new Set<string>();
  const epithets = new Map<string, Array<{ key: number; name: string; family?: string }>>();
  for (const e of entries) {
    byName.set(e.name.toLowerCase(), e.key);
    keys.add(e.key);
    const [g, ep] = e.name.split(' ');
    genera.add(g.toLowerCase());
    if (ep) epithets.set(spellingKey(ep), [...(epithets.get(spellingKey(ep)) ?? []), e]);
  }
  return {
    keyOf: (name) => byName.get(name.toLowerCase()),
    isSpecies: (key) => keys.has(key),
    hasGenus: (genus) => genera.has(genus.toLowerCase()),
    byEpithet: (epithet, family) => (epithets.get(spellingKey(epithet)) ?? []).filter((e) => !family || !e.family || e.family === family).map(({ key, name }) => ({ key, name }))
  };
}

