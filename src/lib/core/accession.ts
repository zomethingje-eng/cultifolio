import { nowMs } from './hlc';
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

/**
 * Whether a stored numbering setting is one the numbering can use (round eighty-six; the plan's A10). The check was that
 * `width` is a number: a setting record synced from another device, merged from a backup or written by hand with a width
 * of 1e9, Infinity or -1 passed it, and `padStart` threw "Invalid string length" (or the import's pattern was no regular
 * expression) on every open of the add form, the import and Settings. Now the width is a whole number from 1 to the
 * fifteen digits a plant number may run to, and a prefix scheme's prefix a text that, with the hyphen and that many
 * digits, is a plant number (`plantNumberProblem`). Anything else is not a scheme, and the default stands.
 */
export function isScheme(s: unknown): s is NumberingScheme {
  if (!s || typeof s !== 'object') return false;
  const { mode, prefix, width } = s as Partial<NumberingScheme>;
  if (mode !== 'year' && mode !== 'prefix') return false;
  if (typeof width !== 'number' || !Number.isInteger(width) || width < 1 || width > PLANT_NUMBER_DIGITS) return false;
  if (mode === 'year') return true;
  if (prefix === undefined) return true; // `nextAccession` numbers it "ACC-"
  return typeof prefix === 'string' && prefix.trim() === prefix && prefix.length > 0 && plantNumberProblem(`${prefix}-${'0'.repeat(width)}`) === null;
}

/**
 * The longest plant number kept, in characters, and the longest run of digits in one (round eighty-five; outside review
 * A10): fifteen digits, every run of which is a whole number JavaScript counts exactly (2^53 has sixteen), so the next
 * number is always found; a nursery's thirteen-digit barcode still fits.
 */
export const PLANT_NUMBER_MAX = 32;
export const PLANT_NUMBER_DIGITS = 15;
/**
 * Whether a text is a plant number this app keeps: one line, 1 to 32 characters, no run of more than 15 digits. A run of
 * 309 digits is Infinity as a number, and the next number after "2026-Infinity" never came: the add form hung for good
 * on every open (round eighty-five; outside review A10). The form's "Use my own number", an import's numbers and the
 * numbering itself all read numbers by this one rule.
 */
export function isPlantNumber(no: string): boolean {
  return plantNumberProblem(no) === null;
}

/** Why a text is not a plant number this app keeps, as the end of a sentence, or null when it is one. */
export function plantNumberProblem(no: string): string | null {
  const t = no.trim();
  if (!t) return 'it is empty';
  if (t.length > PLANT_NUMBER_MAX) return `it is longer than ${PLANT_NUMBER_MAX} characters`;
  if (/[\u0000-\u001f\u007f]/.test(t)) return 'it holds a control character';
  if (new RegExp(`\\d{${PLANT_NUMBER_DIGITS + 1}}`).test(t)) return `it has more than ${PLANT_NUMBER_DIGITS} digits in a row`;
  return null;
}

export function nextAccession(existing: Iterable<string>, scheme: NumberingScheme = DEFAULT_SCHEME, year = new Date(nowMs()).getFullYear()): string { // the corrected clock's year: a phone set to 2031 minted 2031-0001, for good (round fifty-two, 1)
  const prefix = scheme.mode === 'year' ? String(year) : (scheme.prefix ?? 'ACC');
  // Only a number of fifteen digits or fewer counts towards the next: a longer one (a merged backup's, a kept list's, from
  // before this rule) is still taken, never given again, but does not set the count (round eighty-five; outside review A10).
  const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d{1,${PLANT_NUMBER_DIGITS}})$`);
  let n = 0;
  const taken = new Set<string>();
  for (const id of existing) {
    taken.add(id);
    const m = re.exec(id);
    if (m) n = Math.max(n, Number(m[1]));
  }
  // Each step passes one number taken, so a free one is reached within `taken.size + 1` steps: the loop is bounded (A10).
  let id: string;
  let steps = 0;
  do {
    id = `${prefix}-${String(++n).padStart(scheme.width, '0')}`;
    if (++steps > taken.size + 1) throw new Error('No free plant number was found.');
  } while (taken.has(id));
  return id;
}
