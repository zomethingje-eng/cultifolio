/**
 * CITES Appendix status (round eighty-seven, stage 2; the sources agent), resolved from the plant listings of the
 * Appendices as CITES publishes them, in the table transcribed by hand beside this file (`cites-appendices.tsv`, whose
 * header says what was read, from where, and on which day). Never from Species+ or the CITES Checklist: their terms
 * (https://checklist.cites.org/terms_of_use_page_en.html, read 9 November 2026) forbid redistribution, derivative works
 * and commercial use without written permission.
 *
 * The table applies only once the owner has checked it against the edition in force and said so in its `checked:`
 * line (the edition and its md5); before that, every page is "not asked" (rule 2), never "not listed".
 *
 * How a page's status is read from the listings (rule 3: by the names the page holds, Kew's accepted name and Kew's
 * synonyms of it, exactly; never a likeness):
 * 1. a listing of the page's own name (a species, a subspecies or a variety; "ssp." read as Kew's "subsp."), or of
 *    names it includes ({Includes …}): that listing;
 * 2. else a listing of a name Kew holds as a synonym of the page's: that listing, said to be under that name (`via`).
 *    Not a synonym spelt as another page's accepted name (round eighty-seven's review of stage 2, S1): Kew's "Taxus
 *    chinensis Roxb." under Podocarpus macrophyllus, "Pterocarpus santalinus Blanco" under P. indicus, "Pelargonium
 *    crassicaule E.Mey." under P. carnosum are later homonyms, and the Appendices' name is the plant Kew accepts by it,
 *    which has its own page. Such a synonym is read for nothing here (not for a listing, an exception or a genus), and
 *    the page says why. The table gives no authors (the Appendices print none), so the authors cannot be compared;
 *    Kew's authors of the synonym (`name.kew.by`) are said;
 * 3. a name a listing excepts ("Aloe vera … which is not included"), the page's or a synonym's: not listed;
 * 4. else a genus listing ("Ariocarpus spp.") of the page's genus. Not decided where the listing's genus is read
 *    narrower than Kew's (`narrow:` in the table: Kew has moved species of those genera into it), or where the listing
 *    takes "succulent species only" (the page's names do not say which a species is);
 * 5. else, where only a synonym's genus is listed, not decided: the Appendices read a genus by their own nomenclature
 *    reference, which the reference does not read, and Kew's genus is not the synonym's;
 * 6. else a family listing ("CACTACEAE spp.") of Kew's family, with its exceptions (a genus excepted, or a synonym in
 *    one: not decided) and, where the table names them, only the genera the Appendices' family holds (`genera:`);
 * 7. else not listed: no listing of the page's names, genus or family.
 * A listing of the page's subspecies or varieties is given beside the page's own (`infra`).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Cites } from './schema';

export const CITES_TABLE = 'src/lib/dossier/cites-appendices.tsv';
/** The table on disk, beside this file: the build runs from other folders than the repo's (the tests' builds do). */
export const CITES_TABLE_FILE = fileURLToPath(new URL('./cites-appendices.tsv', import.meta.url));
export const CITES_PAGE = 'https://cites.org/eng/app/appendices.php';

export type Appendix = 'I' | 'II' | 'III';
export interface CitesRow {
  appendix: Appendix;
  taxon: string;
  annotation?: string;
  scope?: string;
  party?: string;
  except: string[];
  includes: string[];
  rule?: string;
  family: string;
  source: string;
  url: string;
}
export interface CitesTable { validFrom?: string; edition?: string; checked?: { day: string; md5: string } | null; rows: CitesRow[] }

/** The table's text read: its header lines (`# key: value`) and its rows. Throws on a row it cannot read. */
export function parseCitesTable(text: string): CitesTable {
  const t: CitesTable = { rows: [] };
  let head = false;
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    if (line.startsWith('#')) {
      const m = /^#\s*(valid-from|edition|checked):\s*(.*)$/.exec(line);
      if (m?.[1] === 'valid-from') t.validFrom = m[2].trim();
      if (m?.[1] === 'edition') t.edition = m[2].trim();
      // The md5 in either case, kept in lower case: PowerShell's Get-FileHash prints it in capitals (round eighty-seven's
      // review of stage 2, S6), md5sum in small letters.
      if (m?.[1] === 'checked') { const c = /^(\d{4}-\d{2}-\d{2})\s+md5\s+([0-9a-f]{32})$/i.exec(m[2].trim()); t.checked = c ? { day: c[1], md5: c[2].toLowerCase() } : null; }
      continue;
    }
    if (!head) { head = true; continue; }
    const c = line.split('\t');
    if (c.length !== 11 || !['I', 'II', 'III'].includes(c[0])) throw new Error(`the CITES table's row cannot be read: ${line}`);
    const list = (s: string) => s.split(';').map((x) => x.trim()).filter(Boolean);
    t.rows.push({ appendix: c[0] as Appendix, taxon: c[1], ...(c[2] ? { annotation: c[2] } : {}), ...(c[3] ? { scope: c[3] } : {}), ...(c[4] ? { party: c[4] } : {}), except: list(c[5]), includes: list(c[6]), ...(c[7] ? { rule: c[7] } : {}), family: c[8], source: c[9], url: c[10] });
  }
  return t;
}

export function loadCitesTable(path = CITES_TABLE_FILE): CitesTable { return parseCitesTable(readFileSync(path, 'utf8')); }

/** A name as the table and Kew's file are compared: one space, "ssp." as Kew's "subsp.", "forma" as "f.". */
export const citesKey = (s: string) => s.replace(/\s+/g, ' ').replace(/ ssp\. /g, ' subsp. ').replace(/ forma /g, ' f. ').trim();
const levelOf = (taxon: string): NonNullable<Cites['level']> => (/ spp\.$/.test(taxon) ? (/^[A-Z]+ /.test(taxon) ? 'family' : 'genus') : / (ssp\.|subsp\.|var\.|f\.|forma) /.test(taxon) ? 'infraspecific' : 'species');
const genusOf = (name: string) => name.replace(/^× /, '').split(' ')[0];
const ruleList = (row: CitesRow, kind: string) => (row.rule?.startsWith(`${kind}:`) ? row.rule.slice(kind.length + 1).split(',').map((x) => x.trim()) : null);

/** What a page gives the table: Kew's accepted name, Kew's family, Kew's synonyms of it (their words), Kew's life form. */
export interface CitesPage { name: string; family?: string | null; synonyms?: readonly string[]; lifeform?: string | null; /** For each of `synonyms`, Kew's authors of it (`name.kew.by`). */ synonymAuthors?: readonly (readonly string[])[] }

export class CitesIndex {
  readonly byName = new Map<string, CitesRow[]>();
  readonly byGenus = new Map<string, CitesRow>();
  readonly byFamily = new Map<string, CitesRow>();
  readonly excepted = new Map<string, CitesRow>();
  /**
   * Every page's accepted name (`citesKey`), the corpus's, not only the pages read in one run: a synonym spelt as one of
   * them is a homonym, read for nothing (rule 2 above). Empty where the caller gives none (then no synonym is set aside).
   */
  readonly headings: ReadonlySet<string>;
  constructor(readonly table: CitesTable, headings: Iterable<string> = []) {
    this.headings = new Set([...headings].map(citesKey));
    for (const r of table.rows) {
      const lv = levelOf(r.taxon);
      if (lv === 'family') this.byFamily.set(r.taxon.split(' ')[0], r);
      // A genus listing's braces may include another genus ("Anacampseros spp. {Includes Avonia spp.}", the edition of
      // 5 March 2026, where Avonia spp. had a row of its own before): that genus is read as the listing's.
      else if (lv === 'genus') { this.byGenus.set(r.taxon.split(' ')[0], r); for (const n of r.includes) if (levelOf(n) === 'genus') this.byGenus.set(n.split(' ')[0], r); }
      else for (const n of [r.taxon, ...r.includes]) { const k = citesKey(n), a = this.byName.get(k); if (a) a.push(r); else this.byName.set(k, [r]); }
      for (const x of r.except) if (!/ spp\.$/.test(x)) this.excepted.set(citesKey(x), r);
    }
  }
}

/** The field for a page. `today` is the day of this read; `checked` false when the table's own line has not been filled. */
export function citesOf(idx: CitesIndex, page: CitesPage, today: string): Cites {
  const t = idx.table;
  const base = { read: today, table: t.edition ? t.edition.replace(/^.*\//, '') : CITES_TABLE.replace(/^.*\//, ''), ...(t.validFrom ? { validFrom: t.validFrom } : {}) };
  if (!t.checked) return { status: 'skipped', read: today, detail: `not asked: the table of the Appendices (${CITES_TABLE}) has not yet been checked against the edition in force` };
  const name = citesKey(page.name);
  const allSyns = [...new Set((page.synonyms ?? []).map(citesKey))].filter((s) => s !== name);
  // Another page's accepted name: a homonym, set aside, and said where its words are listed (S1).
  const homs = allSyns.filter((s) => idx.headings.has(s));
  const syns = allSyns.filter((s) => !idx.headings.has(s));
  const byOf = (s: string) => { const i = (page.synonyms ?? []).findIndex((x) => citesKey(x) === s); const a = i >= 0 ? page.synonymAuthors?.[i] ?? [] : []; return a.length ? ` ${a.join(' or ')}` : ''; };
  const homListed = homs.filter((s) => idx.byName.has(s) || idx.excepted.has(s));
  const homNote = homListed.length ? `; ${homListed.map((s) => `${s}${byOf(s)}`).join(', ')}, which Kew holds as ${homListed.length === 1 ? 'a synonym' : 'synonyms'} of this one, ${homListed.length === 1 ? 'is' : 'are'} spelt as another plant Kew accepts, with a page of its own, whose listing ${homListed.length === 1 ? 'it is' : 'they are'}: not read as this one's` : '';
  const listing = (r: CitesRow, extra: Partial<Cites> = {}): Cites => ({ status: 'ok', ...base, appendix: r.appendix, level: levelOf(r.taxon), listed: r.taxon, ...(r.annotation ? { annotation: r.annotation } : {}), ...(r.scope ? { scope: r.scope } : {}), ...(r.party ? { party: r.party } : {}), url: r.url, ...extra });
  // The page's subspecies and varieties listed apart (a species page whose subspecies is in Appendix I).
  // Each by its own taxon, so a species' listing that includes its subspecies ({Includes ssp. …}) is not said twice.
  const infra = [...new Set([...idx.byName.values()].flat())].filter((r) => citesKey(r.taxon).startsWith(`${name} `)).map((r) => ({ appendix: r.appendix, listed: r.taxon }));
  const noted = (c: Cites): Cites => (!homNote || c.detail?.endsWith(homNote.slice(2)) ? c : { ...c, detail: c.detail ? `${c.detail}${homNote}` : homNote.slice(2) });
  const withInfra = (c: Cites): Cites => noted(infra.length && c.status !== 'undecided' ? { ...c, infra } : c);
  const undecided = (detail: string): Cites => noted({ status: 'undecided', ...base, detail });

  // 1. The page's own name, or (for a subspecies or variety) its species' listing.
  const own = idx.byName.get(name);
  if (own?.length) return withInfra(listing(own[0]));
  // 3, for the page's own name first: "Aloe vera … which is not included in the Appendices".
  const ex = idx.excepted.get(name) ?? syns.map((s) => idx.excepted.get(s)).find(Boolean);
  if (ex) return withInfra({ status: 'none', ...base, detail: `the Appendices except ${idx.excepted.get(name) ? page.name : syns.find((s) => idx.excepted.get(s))} from ${ex.taxon} (Appendix ${ex.appendix})`, url: ex.url });
  // 2. A synonym's listing: said to be under that name. Two synonyms in two Appendices are not decided between.
  const bySyn = syns.flatMap((s) => (idx.byName.get(s) ?? []).map((r) => ({ s, r })));
  if (bySyn.length) {
    const apps = new Set(bySyn.map((x) => x.r.appendix));
    if (apps.size > 1) return undecided(`names Kew holds as synonyms of this one are listed in different Appendices: ${bySyn.map((x) => `${x.r.taxon} (${x.r.appendix})`).join(', ')}`);
    return withInfra(listing(bySyn[0].r, { via: bySyn[0].s }));
  }
  const parts = name.split(' ');
  const species = parts.length > 2 ? parts.slice(0, 2).join(' ') : null;
  if (species) { const sp = idx.byName.get(species); if (sp?.length) return noted(listing(sp[0], { detail: `the species ${species} is listed` })); }
  // 4. The page's genus.
  const genus = genusOf(page.name);
  const g = idx.byGenus.get(genus);
  const synGenera = [...new Set(syns.map(genusOf))].filter((x) => x !== genus);
  if (g) {
    const narrow = ruleList(g, 'narrow');
    const moved = narrow ? synGenera.filter((x) => narrow.includes(x)) : [];
    if (moved.length) return undecided(`CITES lists ${g.taxon} in Appendix ${g.appendix} by its own reference's genus; Kew holds this species' name in ${moved.join(', ')} as a synonym, a genus Kew has joined to ${genus}`);
    if (g.rule === 'succulent') return withInfra(undecided(`CITES lists ${g.taxon} in Appendix ${g.appendix}, succulent species only; whether this species is one is not read here${page.lifeform ? ` (Kew gives its life form as "${page.lifeform}")` : ''}`));
    return withInfra(listing(g));
  }
  // 5. Only a synonym's genus is listed.
  const gs = synGenera.map((x) => idx.byGenus.get(x)).filter((x): x is CitesRow => !!x);
  if (gs.length) return undecided(`CITES lists ${[...new Set(gs.map((x) => `${x.taxon} (Appendix ${x.appendix})`))].join(' and ')}; Kew holds a name of this species in that genus as a synonym, and the Appendices read a genus by their own reference, which is not read here`);
  // 6. Kew's family.
  const f = page.family ? idx.byFamily.get(page.family.toUpperCase()) : undefined;
  if (f) {
    const exG = f.except.filter((x) => / spp\.$/.test(x)).map((x) => x.split(' ')[0]);
    if (exG.includes(genus)) return noted({ status: 'none', ...base, detail: `the Appendices except ${genus} spp. from ${f.taxon} (Appendix ${f.appendix})`, url: f.url });
    const synEx = synGenera.filter((x) => exG.includes(x));
    if (synEx.length) return undecided(`the Appendices except ${synEx.map((x) => `${x} spp.`).join(', ')} from ${f.taxon}; Kew holds a name of this species in ${synEx.join(', ')} as a synonym`);
    const genera = ruleList(f, 'genera');
    if (genera && !genera.includes(genus)) return undecided(`CITES lists ${f.taxon} in Appendix ${f.appendix}, the family as its own reference holds it (${genera.join(', ')}); Kew's ${page.family} holds ${genus} too`);
    return withInfra(listing(f));
  }
  // 7. Not in the Appendices.
  return withInfra({ status: 'none', ...base, detail: 'no listing of its name, its genus or its family' });
}
