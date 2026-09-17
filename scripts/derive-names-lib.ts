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
  /** How many of the most-cultivated iNaturalist species to take, on top of the specialist genera, which come whole. */
  inat: number;
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
  let taken = 0;
  const byCount = [...inat].filter((c) => c.accepted != null && !/×|\bx\b/.test(c.name)).sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
  for (const c of byCount) {
    if (taken >= o.inat) break;
    if (take(c, 'inat')) taken++;
  }
  // A cultivated species already in a specialist genus is credited to the genus and does not use up the iNat share.
  const list = report.map((r) => r.name).sort((a, b) => a.localeCompare(b));
  return { list, report: report.sort((a, b) => a.name.localeCompare(b.name)) };
}

export interface WcvpLookup {
  /** Accepted species of the wanted genera. */
  genera: Candidate[];
  /** A name (accepted or synonym, any rank) → its accepted species name and family, or null when WCVP does not know it. */
  resolve(name: string): { accepted: string; family: string } | null;
  names: number;
}

/**
 * One pass over WCVP's names file (pipe-delimited, header first): the accepted
 * species of the given genera, and a resolver from any name WCVP knows to its
 * accepted species. WCVP rather than the GBIF backbone because the backbone
 * lists unresolved names as accepted (Aeonium comes back with 122 "accepted"
 * species; WCVP says 40) and its genus match fails on homonyms (Mammillaria).
 * Hybrids are left out of the genera: they have no native range.
 */
export function indexWcvp(lines: Iterable<string>, genera: Set<string>): WcvpLookup {
  const out: Candidate[] = [];
  const byId = new Map<string, { name: string; family: string; rank: string; status: string }>();
  const acceptedOf = new Map<string, string>(); // taxon_name → accepted_plant_name_id (or own id)
  let header: string[] | null = null;
  let iId = -1, iAcc = -1, iGenus = -1, iRank = -1, iStatus = -1, iFamily = -1, iName = -1, iGh = -1, iSh = -1;
  for (const line of lines) {
    if (!line) continue;
    const cells = line.split('|');
    if (!header) {
      header = cells;
      iId = header.indexOf('plant_name_id');
      iAcc = header.indexOf('accepted_plant_name_id');
      iGenus = header.indexOf('genus');
      iRank = header.indexOf('taxon_rank');
      iStatus = header.indexOf('taxon_status');
      iFamily = header.indexOf('family');
      iName = header.indexOf('taxon_name');
      iGh = header.indexOf('genus_hybrid');
      iSh = header.indexOf('species_hybrid');
      if ([iId, iAcc, iGenus, iRank, iStatus, iFamily, iName].includes(-1)) throw new Error('not a WCVP names file: missing plant_name_id/accepted_plant_name_id/genus/taxon_rank/taxon_status/family/taxon_name columns');
      continue;
    }
    const id = cells[iId], name = cells[iName], rank = cells[iRank], status = cells[iStatus], family = cells[iFamily];
    byId.set(id, { name, family, rank, status });
    if (!acceptedOf.has(name) || status === 'Accepted') acceptedOf.set(name, cells[iAcc] || id);
    if (!genera.has(cells[iGenus])) continue;
    if (rank !== 'Species' || status !== 'Accepted') continue;
    if ((iGh >= 0 && cells[iGh]) || (iSh >= 0 && cells[iSh])) continue;
    out.push({ name, why: 'genus', family });
  }
  return {
    genera: out,
    names: byId.size,
    resolve(name: string) {
      const accId = acceptedOf.get(name);
      if (!accId) return null;
      const acc = byId.get(accId);
      if (!acc) return null;
      // An infraspecific accepted name resolves to its species: the first two words.
      const sp = acc.name.split(' ').slice(0, 2).join(' ');
      return { accepted: sp, family: acc.family };
    }
  };
}

/** Kept for callers that only want the genera. */
export function wcvpGenera(lines: Iterable<string>, genera: Set<string>): Candidate[] {
  return indexWcvp(lines, genera).genera;
}
