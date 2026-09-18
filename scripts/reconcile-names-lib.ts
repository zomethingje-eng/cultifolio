/**
 * The pure part of reconcile-names.ts: read a build report for the names the
 * backbone refused, and find in WCVP every other spelling each one has
 * carried, so the script can offer those spellings to the backbone instead.
 * Unit-tested on a small WCVP-shaped file.
 */

/** The names a build report marks ✗, with the reason it gave. */
export function refusedNames(report: string): Array<{ name: string; reason: string }> {
  const out: Array<{ name: string; reason: string }> = [];
  for (const line of report.split(/\r?\n/)) {
    const m = /^(?:\[\d+\/\d+\] )?✗ (.+?): (.+)$/.exec(line);
    if (m) out.push({ name: m[1].trim(), reason: m[2].trim() });
  }
  return out;
}

export interface Spellings {
  /** WCVP's accepted name for it (may be the name itself). */
  accepted: string;
  acceptedStatus: string;
  /** Every other name WCVP sinks into the same accepted taxon: synonyms first as Kew lists them, species rank only. */
  synonyms: string[];
  /** The name is not in WCVP at all. */
  unknown?: boolean;
}

/**
 * One pass over the WCVP names file. For each wanted name: its accepted taxon
 * and the other names that resolve to that taxon. A name at species rank only;
 * infraspecific synonyms are not offered because the build refuses a match
 * that changes rank.
 */
export function spellingsOf(lines: Iterable<string>, wanted: Iterable<string>): Map<string, Spellings> {
  const want = new Set([...wanted].map((n) => n.toLowerCase()));
  const rows = new Map<string, { name: string; status: string; acc: string; rank: string }>(); // id → row (all rows; ~1.4M)
  const idOfName = new Map<string, string>(); // lower name → id (accepted preferred)
  let header: string[] | null = null;
  let iId = -1, iAcc = -1, iRank = -1, iStatus = -1, iName = -1;
  for (const line of lines) {
    if (!line) continue;
    const c = line.split('|');
    if (!header) {
      header = c;
      iId = header.indexOf('plant_name_id');
      iAcc = header.indexOf('accepted_plant_name_id');
      iRank = header.indexOf('taxon_rank');
      iStatus = header.indexOf('taxon_status');
      iName = header.indexOf('taxon_name');
      if ([iId, iAcc, iRank, iStatus, iName].includes(-1)) throw new Error('not a WCVP names file');
      continue;
    }
    const id = c[iId], name = c[iName], status = c[iStatus];
    rows.set(id, { name, status, acc: c[iAcc] || id, rank: c[iRank] });
    const k = name.toLowerCase();
    if (want.has(k) && (!idOfName.has(k) || status === 'Accepted')) idOfName.set(k, id);
  }
  // Group every species-rank row by the accepted id it resolves to, but only for the accepted ids we need.
  const need = new Set<string>();
  for (const id of idOfName.values()) need.add(rows.get(id)!.acc);
  const members = new Map<string, string[]>();
  for (const r of rows.values()) {
    if (!need.has(r.acc) || r.rank !== 'Species') continue;
    const arr = members.get(r.acc) ?? [];
    arr.push(r.name);
    members.set(r.acc, arr);
  }
  const out = new Map<string, Spellings>();
  for (const n of wanted) {
    const id = idOfName.get(n.toLowerCase());
    if (!id) {
      out.set(n, { accepted: n, acceptedStatus: 'unknown', synonyms: [], unknown: true });
      continue;
    }
    const r = rows.get(id)!;
    const acc = rows.get(r.acc) ?? r;
    const syn = (members.get(r.acc) ?? []).filter((m) => m.toLowerCase() !== n.toLowerCase() && m !== acc.name);
    out.set(n, { accepted: acc.name, acceptedStatus: acc.status, synonyms: [...new Set(syn)] });
  }
  return out;
}

/** The spellings to try for a refused name, in order: the accepted name if different, then the synonyms. Never the name itself. */
export function candidates(name: string, s: Spellings): string[] {
  const out: string[] = [];
  if (s.accepted.toLowerCase() !== name.toLowerCase()) out.push(s.accepted);
  for (const x of s.synonyms) if (!out.includes(x)) out.push(x);
  return out;
}
