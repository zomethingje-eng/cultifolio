/**
 * `--check-summaries` (round eighty-seven), in the style of `--check-ranges`: every page's Wikipedia summary read against
 * the page's own names, offline, from the dossiers alone. At round eighty-six's second stop a read of every summary's title
 * found 1,355 quoted under another title than the page's name, all a spelling, an older name, the page's own item's
 * article, its rank or a genus of one species, but four, which quoted another plant's article, reached through
 * Wikipedia's redirect from their own names and carried by walks since 22 October: Mentha ×rotundifolia (Mentha
 * longifolia's), Salix ×pendulina (S. babylonica's), Begonia metallica (B. incarnata's) and Amelanchier stolonifera (A.
 * ×spicata's). This check finds such a page by rule.
 *
 * Each summary is one of:
 *   - `name`, `older-name`: its title is the page's name or one of its older names (`nameMatch`, the proofs' own rule);
 *   - `item`: its record names the proof that the title is the English article of the page's own Wikidata item, the item
 *     the page holds now;
 *   - `rank`: its title is the species of a page below species (the first two words of the page's name);
 *   - `another-plant`, a fault: its title is another page's name, or an older name of another page and none of this
 *     one's; a title reached through a redirect says so;
 *   - `proof`: another proof is recorded (a genus of one species, a product, the same type, IPNI): listed, to read;
 *   - `not-checked`: no proof is recorded, and reading one needs Wikidata and Wikipedia (`--fill summaries` asks them).
 *     Never said as none: rule 2.
 * Pure: the script hands it the pages and writes the lines.
 */
import { recordedProof, recordedTitles } from './summary-fill';
import { nameMatch, titleKey } from './summary-proof';

export type SummaryVerdict = 'name' | 'older-name' | 'item' | 'rank' | 'another-plant' | 'proof' | 'not-checked';
export const SUMMARY_VERDICTS: ReadonlyArray<SummaryVerdict> = ['name', 'older-name', 'item', 'rank', 'another-plant', 'proof', 'not-checked'];

export interface SummaryPage {
  key: string;
  name: { scientific: string; synonyms?: readonly string[] | null };
  ids?: { wikidata?: string };
  summary?: { title: string } | null;
  upstream?: Record<string, { status?: string; detail?: string } | undefined>;
}

/** A name as the check compares titles: the hybrid sign and underscores left off, lower case. */
const key = (n: string) => titleKey(n.replace(/×\s*/g, '').replace(/\bx\s+(?=[a-z])/g, ''));
const two = (n: string) => n.replace(/×\s*/g, '').trim().split(/\s+/).slice(0, 2).join(' ');
const RANK = /^(subsp|ssp|var|subvar|f|fo|forma|nothosubsp|nothovar)\.?$/;
/** A name without its author: the genus and epithet, and a rank word and its epithet after them. */
const nameOnly = (n: string) => { const w = n.replace(/×\s*/g, '').trim().split(/\s+/); return (RANK.test(w[2] ?? '') ? w.slice(0, 4) : w.slice(0, 2)).join(' '); };

/** The reference's names, to tell another plant's title: each page's name, and each of its older names, by page. */
export class ReferenceNames {
  private accepted = new Map<string, Array<{ key: string; name: string }>>();
  private older = new Map<string, Array<{ key: string; name: string }>>();
  add(p: Pick<SummaryPage, 'key' | 'name'>): void {
    const at = (m: Map<string, Array<{ key: string; name: string }>>, n: string) => { const k = key(n); const l = m.get(k) ?? []; if (!l.some((x) => x.key === p.key)) l.push({ key: p.key, name: p.name.scientific }); m.set(k, l); };
    at(this.accepted, p.name.scientific);
    // An older name as GBIF lists it, with its author ("Tritoma uvaria Ker Gawl."): its name alone, a rank's epithet kept.
    for (const s of p.name.synonyms ?? []) at(this.older, nameOnly(s));
  }
  /** The other page whose name the title is, else one whose older name it is; null when neither. */
  other(title: string, self: string): { key: string; name: string; older: boolean } | null {
    const a = (this.accepted.get(key(title)) ?? []).find((x) => x.key !== self);
    if (a) return { ...a, older: false };
    const o = (this.older.get(key(title)) ?? []).find((x) => x.key !== self);
    return o ? { ...o, older: true } : null;
  }
}

const ITEM_WORDS = /^the English article of this species' Wikidata item \((Q\d+)\)/;

/** One page's summary by the rule above, with the words its line says. Null for a page with no summary. */
export function summaryVerdict(d: SummaryPage, names: ReferenceNames): { verdict: SummaryVerdict; words: string } | null {
  const t = d.summary?.title;
  if (!t) return null;
  const rec = d.upstream?.wikipedia;
  const titles = recordedTitles(rec);
  const via = titles.redirect && titles.asked && key(titles.asked) !== key(t) ? `, reached through Wikipedia's redirect from ${titles.asked}` : '';
  const who = { name: d.name.scientific, synonyms: [...(d.name.synonyms ?? [])] };
  const own = nameMatch(t, who);
  const other = names.other(t, d.key);
  // Another page's own name is that plant's article, whatever this page's older names hold.
  if (other && !other.older) return { verdict: 'another-plant', words: `the article of ${other.name} [${other.key}], another page of the reference${via}` };
  if (own) return { verdict: own.proof, words: own.proof === 'name' ? "the page's name" : `an older name of the page (${own.as})` };
  if (other) return { verdict: 'another-plant', words: `an older name of ${other.name} [${other.key}], and none of this page's${via}` };
  const below = d.name.scientific.replace(/×\s*/g, '').trim().split(/\s+/).length > 2;
  if (below && key(two(d.name.scientific)) === key(t)) return { verdict: 'rank', words: `the article of the species of this page's name${via}` };
  const proof = recordedProof(rec);
  const item = proof ? ITEM_WORDS.exec(proof)?.[1] : undefined;
  if (item && item === d.ids?.wikidata) return { verdict: 'item', words: `the English article of the page's Wikidata item (${item})` };
  if (proof) return { verdict: 'proof', words: `${item ? `the English article of Wikidata's ${item}, not the page's item (${d.ids?.wikidata ?? 'none'}): ` : ''}its record names the proof "${proof}"${via}` };
  return { verdict: 'not-checked', words: `no proof is recorded${via}; not checked: reading one needs Wikidata and Wikipedia (--fill summaries asks them)` };
}

export interface SummaryCheck {
  read: number;
  withSummary: number;
  by: Record<SummaryVerdict, number>;
  /** Every summary not under the page's name, an older name or its item's article: "<id> <name>\t<title>: <words>". */
  lines: string[];
  /** Of those, the summaries not checked (no proof recorded), as the same lines (round eighty-seven's review, S5). */
  unchecked: string[];
}

/** The whole check over the pages (read twice: the names of all, then each summary). */
export function checkSummaryTitles(pages: readonly SummaryPage[]): SummaryCheck {
  const names = new ReferenceNames();
  for (const p of pages) names.add(p);
  const c: SummaryCheck = { read: 0, withSummary: 0, by: Object.fromEntries(SUMMARY_VERDICTS.map((v) => [v, 0])) as Record<SummaryVerdict, number>, lines: [], unchecked: [] };
  for (const p of pages) {
    c.read++;
    const v = summaryVerdict(p, names);
    if (!v) continue;
    c.withSummary++;
    c.by[v.verdict]++;
    const line = `${p.key} ${p.name.scientific}\t${p.summary!.title}: ${v.verdict === 'another-plant' ? 'ANOTHER PLANT: ' : ''}${v.words}`;
    if (v.verdict !== 'name' && v.verdict !== 'older-name' && v.verdict !== 'item') c.lines.push(line);
    if (v.verdict === 'not-checked') c.unchecked.push(line);
  }
  c.lines.sort();
  c.unchecked.sort();
  return c;
}

/** The pages whose summary is another plant's article, one a line as `--keys` reads them. */
export const FAULTS_FILE = 'rebuild-summaries.txt';
export const faultLines = (c: SummaryCheck): string[] => c.lines.filter((l) => l.includes(': ANOTHER PLANT: '));

/**
 * The summaries not checked (round eighty-seven's review, S5), one a line as `--keys` reads them, and the exit the
 * command then gives when no page quotes another plant's article: neither 0 (all checked) nor 2 (a fault), so a review
 * stop reads it (`classify` in corpus-step.mjs). A summary not checked may be another plant's article that is not a page
 * of the reference, so "no page quotes another plant's article" is said only when every summary was checked (rule 2).
 */
export const UNCHECKED_FILE = 'check-summaries-unchecked.txt';
export const UNCHECKED_EXIT = 4;

/** The check's lines as the command prints them. */
export function summaryCheckWords(c: SummaryCheck, file: string): string[] {
  const b = c.by;
  const n = b['not-checked'], checked = c.withSummary - n;
  const unchecked = `${n} not checked (no proof recorded) → ${UNCHECKED_FILE}: read them, or run --fill summaries, which asks Wikidata and Wikipedia, and this check again`;
  return [
    `  ${c.read} dossiers read, ${c.withSummary} with a Wikipedia summary: ${b.name} under the page's name, ${b['older-name']} an older name of it, ${b.item} its Wikidata item's article; ${b.rank} the species of a page below species, ${b.proof} with another proof recorded (a genus of one species, a product, the same type, IPNI), ${n} not checked (no proof recorded: --fill summaries asks Wikidata and Wikipedia), ${b['another-plant']} another plant's article${c.lines.length ? ` → ${file} (${c.lines.length} pages)` : ''}`,
    b['another-plant']
      ? `  Not ready to upload: ${b['another-plant']} page${b['another-plant'] === 1 ? ' quotes' : 's quote'} another plant's article (marked ANOTHER PLANT in ${file}) → ${FAULTS_FILE}; build ${b['another-plant'] === 1 ? 'it' : 'them'} online with --keys ${FAULTS_FILE} --grid climate --bulk bulk, then --index and this check.${n ? ` And ${unchecked}.` : ''}`
      : n
        ? `  None of the ${checked} summar${checked === 1 ? 'y' : 'ies'} checked quotes another plant's article; ${unchecked}.`
        : `  No page quotes another plant's article.`
  ];
}
