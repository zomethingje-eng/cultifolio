/** The pure part of derive-names.ts: merge, filter and cut the candidate lists. Unit-tested. */

export interface Candidate {
  /** As the source gave it. */
  name: string;
  /** The backbone's accepted canonical name, when resolved. */
  accepted?: string;
  why: 'inat' | 'genus';
  count?: number;
  family?: string;
  gbifKey?: number;
  inatId?: number;
}

export interface MergeOpts {
  target: number;
  excludedFamilies: Set<string>;
}

const isSpecies = (n: string) => /^[A-Z][a-z-]+ [a-z][a-z-]+$/.test(n);

/**
 * Every specialist-genus species is in. The rest of the budget goes to the
 * most-cultivated iNaturalist species, in count order, skipping excluded
 * families, hybrids, unresolved names and anything already in. Names are
 * accepted binomials; infraspecifics collapse to their species.
 */
export function mergeLists(inat: Candidate[], genera: Candidate[], o: MergeOpts): { list: string[]; report: Array<{ name: string; family?: string; why: string; count?: number }> } {
  const seen = new Set<string>();
  const report: Array<{ name: string; family?: string; why: string; count?: number }> = [];
  const take = (c: Candidate, why: string) => {
    const raw = (c.accepted ?? c.name).trim();
    const name = raw.split(' ').slice(0, 2).join(' '); // subsp./var. → species
    if (!isSpecies(name) || seen.has(name)) return false;
    if (why === 'inat' && c.family && o.excludedFamilies.has(c.family.toLowerCase())) return false;
    seen.add(name);
    report.push({ name, family: c.family, why, count: c.count });
    return true;
  };
  for (const c of genera) take(c, 'genus');
  const byCount = [...inat].filter((c) => c.gbifKey != null && !/×|\bx\b/.test(c.name)).sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
  for (const c of byCount) {
    if (report.length >= o.target) break;
    take(c, 'inat');
  }
  // The specialist genera can overshoot the target on their own; that is by design, the target bounds the iNat share.
  const list = report.map((r) => r.name).sort((a, b) => a.localeCompare(b));
  return { list, report: report.sort((a, b) => a.name.localeCompare(b.name)) };
}
