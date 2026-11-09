/**
 * What each stored older name of a page is against Kew's names for its plant (round eighty-seven, derived agent; outside
 * review B's note, the plan's B17): of 1,563 stored older-name strings B sampled, 1,226 matched a direct checklist synonym
 * and 337 did not, "not established wrong, unverified". This sorts every shown older name of every page into one kind, from
 * the dossiers alone (a report; nothing is changed):
 *
 *   - `direct`: its binomial, as written, is one of Kew's names for the plant (`name.kew.synonyms`, or Kew's entry's own
 *     name, `name.kew.accepted.name`), and what follows it is an author (no rank word);
 *   - `citation`: the same name as one of those once its citation form is read the one way: the hybrid sign (×, "x "),
 *     letter case, accents, spacing and a rank word's spelling ("ssp." for "subsp.", "fo." for "f.") aside;
 *   - `descendant`: a name below species (a variety, subspecies, form …) whose species is the page's own name or one of
 *     Kew's names for the plant, directly or by its citation form: a name of a part of the plant, not of the plant;
 *   - `other`: none of these: GBIF's synonymy that Kew's file does not give the plant (the strings B could not verify);
 *   - `unread`: the page holds no Kew names (`name.kew` absent, or held by another page), so nothing is compared.
 *
 * The older names are the page's shown ones (`ownSynonyms`: `name.synonyms` less `name.kew.elsewhere`, which Kew places only
 * in another plant and the page does not show).
 */
import { ownSynonyms } from '../core/shown-names';

export type OlderKind = 'direct' | 'citation' | 'descendant' | 'other' | 'unread';
export const OLDER_KINDS: readonly OlderKind[] = ['direct', 'citation', 'descendant', 'other', 'unread'];

type Page = { key?: string; name: { scientific: string; synonyms?: readonly string[] | null; kew?: { entry?: string; synonyms?: readonly string[] | null; heldBy?: string; accepted?: { name?: string } | null; elsewhere?: readonly string[] | null } | null } };

/** The rank words below species, in any spelling a source writes them. */
const RANK = /^(?:var|subsp|ssp|f|fo|forma|subvar|subf|nothosubsp|nothovar|nothof|convar|prol|proles|lusus|race|grex|cv)\.?$/i;
const RANK_SAME: Record<string, string> = { ssp: 'subsp', fo: 'f', forma: 'f', prol: 'proles' };

/** A name's words with its citation form read one way: no hybrid sign, accents off, lower case, the rank word's one spelling. */
export function citationWords(s: string): string[] {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/×\s*/g, ' ').replace(/^\s*x\s+/i, ' ').replace(/^(\S+)\s+x\s+(?=[a-z])/i, '$1 ').trim().split(/\s+/).filter(Boolean)
    .map((w) => { const l = w.toLowerCase().replace(/\.$/, ''); return RANK.test(w) ? (RANK_SAME[l] ?? l) : w.toLowerCase(); });
}

/** A stored name split: its binomial as written, the rank word and epithet below species if any, and what follows. */
function parts(s: string): { binomial: string; infra?: string; rest: string } | null {
  const w = s.replace(/×\s+/g, '×').trim().split(/\s+/);
  // A hybrid sign written as a letter between the genus and the epithet ("Aloe x nobilis") is part of the binomial.
  if (w.length >= 3 && /^x$/i.test(w[1])) w.splice(1, 2, `${w[1]} ${w[2]}`);
  if (w.length < 2) return null;
  if (w.length >= 4 && RANK.test(w[2])) return { binomial: `${w[0]} ${w[1]}`, infra: `${w[2]} ${w[3]}`, rest: w.slice(4).join(' ') };
  return { binomial: `${w[0]} ${w[1]}`, rest: w.slice(2).join(' ') };
}

const key2 = (s: string) => citationWords(s).slice(0, 2).join(' ');

/** The kind of one stored older name of a page. */
export function olderKind(stored: string, page: Page): OlderKind {
  const kew = page.name.kew;
  if (!kew || kew.heldBy || !Array.isArray(kew.synonyms)) return 'unread';
  const names = [...kew.synonyms, ...(kew.accepted?.name ? [kew.accepted.name] : [])].filter((x): x is string => typeof x === 'string');
  const exact = new Set(names.map((n) => n.replace(/×\s+/g, '×').trim()));
  const folded = new Set(names.map(key2));
  const p = parts(stored);
  if (!p) return 'other';
  if (!p.infra) {
    if (exact.has(p.binomial)) return 'direct';
    if (folded.has(key2(p.binomial))) return 'citation';
    return 'other';
  }
  // Below species: a part of the page's plant when its species is the plant's own name or one of Kew's names for it.
  const sp = key2(p.binomial);
  if (sp === key2(page.name.scientific) || folded.has(sp)) return 'descendant';
  return 'other';
}

export interface OlderKindsReport {
  pages: number;
  counts: Record<OlderKind, number>;
  /** One line per `other` name: "Name [key]\tstored string". */
  others: string[];
}

/** Every shown older name of every page, by kind. */
export function olderKinds(pages: Iterable<Page>): OlderKindsReport {
  const counts = Object.fromEntries(OLDER_KINDS.map((k) => [k, 0])) as Record<OlderKind, number>;
  const others: string[] = [];
  let n = 0;
  for (const d of pages) {
    n++;
    for (const s of ownSynonyms(d.name)) {
      if (typeof s !== 'string' || !s.trim()) continue;
      const k = olderKind(s, d);
      counts[k]++;
      if (k === 'other') others.push(`${d.name.scientific} [${d.key ?? '?'}]\t${s}`);
    }
  }
  return { pages: n, counts, others: others.sort() };
}

/** The report's first line, as the script prints it. */
export function olderKindsLine(r: OlderKindsReport): string {
  const all = OLDER_KINDS.reduce((a, k) => a + r.counts[k], 0);
  return `${r.pages} pages, ${all} shown older names: ${r.counts.direct} one of Kew's names for the plant as written, ${r.counts.citation} the same by its citation form, ${r.counts.descendant} a name below species of the plant, ${r.counts.other} other (not Kew's for the plant), ${r.counts.unread} on pages whose Kew names are not read`;
}
