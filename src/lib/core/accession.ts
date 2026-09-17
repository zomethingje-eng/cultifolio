/**
 * Accession numbering is a vault setting. The default is the year-prefixed
 * scheme (2026-0001); an organisation may set its own prefix and width, and
 * imports may keep numbers they already have. A number is never reused: a dead
 * plant keeps its number, which is why accessions are archived, not deleted.
 */

export interface NumberingScheme {
  /** 'year' → YYYY-NNNN;  'prefix' → PREFIX-NNNN with a fixed prefix. */
  mode: 'year' | 'prefix';
  prefix?: string;
  width: number;
}

export const DEFAULT_SCHEME: NumberingScheme = { mode: 'year', width: 4 };

export function nextAccession(existing: Iterable<string>, scheme: NumberingScheme = DEFAULT_SCHEME, year = new Date().getFullYear()): string {
  const prefix = scheme.mode === 'year' ? String(year) : (scheme.prefix ?? 'ACC');
  const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)$`);
  let n = 0;
  const taken = new Set<string>();
  for (const id of existing) {
    taken.add(id);
    const m = re.exec(id);
    if (m) n = Math.max(n, Number(m[1]));
  }
  let id: string;
  do id = `${prefix}-${String(++n).padStart(scheme.width, '0')}`;
  while (taken.has(id));
  return id;
}

export function isAccessionNumber(s: string): boolean {
  return /^[A-Za-z0-9]+-\d+$/.test(s);
}
