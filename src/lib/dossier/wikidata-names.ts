/**
 * English common names from Wikidata (round eighty, the owner's decision): the taxon common name statements (P1843) of a
 * page's own Wikidata item, for a page without a GBIF key, whose common names GBIF is never asked for. The item is the
 * one the page already holds (`ids.wikidata`): for a page without a GBIF key, the one item carrying Kew's IPNI or POWO
 * identifier (`kewItem`, round seventy-nine). Nothing is matched by name (rule 3).
 *
 * The rule, written here and on /about/how:
 *
 *   - **Read:** every P1843 statement of the item in English: language `en`, and every regional English (`en-gb`,
 *     `en-us`, `en-ca` and any other `en-…`), each read as English, since GBIF's English names do not tell them apart
 *     either. Any other language is not English, and is not read (Scots `sco` included).
 *   - **Refused**, each said in the record with why:
 *       - a statement Wikidata ranks deprecated;
 *       - a name with a letter outside the Latin script;
 *       - the species' scientific name, or one of Kew's names for it, written as an English one;
 *       - a genus named on its own: the species' own genus, a genus of the reference, or a genus English uses as a
 *         noun (`bareGenus`), since for a page without any other source of names it would be the headline;
 *       - a scientific name the reference holds as another of its species ("Babiana odorata").
 *   - **Taken:** each other name, as a row of the page's common names (`source` "Wikidata"), so the common-name rule
 *     every page reads them by (`englishNames`) puts them in order and shows them, as it does GBIF's: a comma list
 *     split, spellings pooled, a generic noun never the headline, another genus set back, capitals as a source gave them.
 *   - **The headline:** the rule's own order, read so: a name's sources are Wikidata itself and each of the statement's
 *     references that names a source outside Wikimedia, counted once each (its "stated in" item, P248, else the host of
 *     its reference URL, P854); a reference that only says the name was imported from a Wikimedia project (P143,
 *     English Wikipedia or Wikispecies) names no source and counts nothing. So the name more references give comes
 *     first; then a statement Wikidata ranks preferred (which only breaks a tie, as GBIF's preferred flag does); then
 *     the alphabet, since a query does not give the item's own order of its statements.
 *
 * Rule 2: the record (`upstream['wikidata.names']`) says "none" only where Wikidata answered and holds no English name,
 * or only refused ones; a page with no item taken is "none" only where Wikidata answered that no item carries Kew's
 * identifiers; two items, or a query that did not answer, is not checked, with why.
 */
import type { Upstream } from './schema';
import type { VernacularName } from './index-entry';
import { bareGenus, nameKey, englishNames, generaOf } from './index-entry';
import type { JsonFetcher } from './fetch';

/** The source a row taken from Wikidata names: GBIF's rows name their dataset, these the database. */
export const WIKIDATA_SOURCE = 'Wikidata';
/** The record of a page's names from Wikidata. */
export const WD_NAMES = 'wikidata.names';
/** Items a query asks for: each is `wd:Q…`, so 200 keep the address near 4 kB, as the batches by GBIF key do. */
export const WD_NAMES_ITEMS = 200;

/** One P1843 statement as the rule reads it. `refs` are its references, one key each (`refKey`); `rank` Wikidata's. */
export interface WdNameStatement {
  name: string;
  lang: string;
  rank: 'preferred' | 'normal' | 'deprecated';
  refs: string[];
}

/** Whether a language tag is English: `en` and any regional English. */
export const isEnglishTag = (lang: string) => lang === 'en' || lang.startsWith('en-');

/**
 * One reference as a source: its "stated in" item, else its reference URL's host, else nothing (a reference that says
 * only "imported from" a Wikimedia project, or nothing the rule reads, names no source).
 */
export function refKey(r: { statedIn?: string; url?: string }): string | undefined {
  if (r.statedIn) return `stated in ${r.statedIn}`;
  if (r.url) {
    try {
      const host = new URL(r.url).host.toLowerCase().replace(/^www\./, '');
      // A reference URL on a Wikimedia site is the same as "imported from" one: no source of its own.
      if (/(^|\.)(wikipedia|wikidata|wikimedia|wikispecies)\.org$/.test(host)) return undefined;
      return host ? `at ${host}` : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

type Snak = { datavalue?: { value?: unknown } };
type Claim = { mainsnak?: Snak; rank?: string; references?: Array<{ snaks?: Record<string, Snak[]> }> };

/** An item's P1843 statements in English, from its entity JSON (`wbgetentities`, claims), as the builder reads them. */
export function statementsOfEntity(ent: { claims?: Record<string, unknown> } | undefined): WdNameStatement[] {
  const out: WdNameStatement[] = [];
  for (const c of ((ent?.claims?.P1843 ?? []) as Claim[])) {
    const v = c.mainsnak?.datavalue?.value as { text?: unknown; language?: unknown } | undefined;
    if (!v || typeof v.text !== 'string' || typeof v.language !== 'string' || !isEnglishTag(v.language)) continue;
    const refs = new Set<string>();
    for (const r of c.references ?? []) {
      const statedIn = (r.snaks?.P248?.[0]?.datavalue?.value as { id?: unknown } | undefined)?.id;
      const url = r.snaks?.P854?.[0]?.datavalue?.value;
      const k = refKey({ statedIn: typeof statedIn === 'string' ? statedIn : undefined, url: typeof url === 'string' ? url : undefined });
      if (k) refs.add(k);
    }
    out.push({ name: v.text, lang: v.language, rank: c.rank === 'preferred' || c.rank === 'deprecated' ? c.rank : 'normal', refs: [...refs] });
  }
  return out;
}

/**
 * The query for many items' English P1843 statements, any rank, with each reference's "stated in" and URL. A statement
 * comes back once for each of its references (and once with none), and the reading pools them (`statementsOfAnswer`).
 */
export const wdNamesQuery = (items: readonly string[]) =>
  `SELECT ?item ?st ?name ?rank ?ref ?in ?url WHERE { VALUES ?item { ${items.map((q) => `wd:${q}`).join(' ')} } ?item p:P1843 ?st . ?st ps:P1843 ?name ; wikibase:rank ?rank . FILTER(LANG(?name) = "en" || STRSTARTS(LANG(?name), "en-")) OPTIONAL { ?st prov:wasDerivedFrom ?ref . OPTIONAL { ?ref pr:P248 ?in } OPTIONAL { ?ref pr:P854 ?url } } }`;
export const wdNamesUrl = (items: readonly string[]) => `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(wdNamesQuery(items))}`;

type Binding = Record<string, { value?: string; 'xml:lang'?: string } | undefined>;
const tail = (u?: string) => /([^/#]+)$/.exec(u ?? '')?.[1];

/** Each item's statements from a query's answer, by item; an item asked with no statement is in it with none. */
export function statementsOfAnswer(items: readonly string[], bindings: readonly Binding[]): Map<string, WdNameStatement[]> {
  const byStatement = new Map<string, { item: string; s: WdNameStatement; refs: Set<string> }>();
  for (const b of bindings) {
    const item = tail(b.item?.value), st = b.st?.value, name = b.name?.value, lang = b.name?.['xml:lang'];
    if (!item || !st || typeof name !== 'string' || !lang || !isEnglishTag(lang)) continue;
    const rank = tail(b.rank?.value);
    let e = byStatement.get(st);
    if (!e) {
      e = { item, s: { name, lang, rank: rank === 'PreferredRank' ? 'preferred' : rank === 'DeprecatedRank' ? 'deprecated' : 'normal', refs: [] }, refs: new Set() };
      byStatement.set(st, e);
    }
    const k = refKey({ statedIn: tail(b.in?.value), url: b.url?.value });
    if (k) e.refs.add(k);
  }
  const out = new Map<string, WdNameStatement[]>(items.map((q) => [q, []]));
  for (const { item, s, refs } of byStatement.values()) out.get(item)?.push({ ...s, refs: [...refs].sort() });
  return out;
}

/** What the rule makes of an item's statements: the rows taken, and each name refused with why. */
export interface WdNames {
  rows: VernacularName[];
  refused: Array<{ name: string; why: string }>;
}

/** What the rule needs of the species: its name, Kew's names for it, the reference's genera, and its other species' names. */
export interface WdNameScope {
  scientific: string;
  /** Kew's names for it, or its older names, with or without authors. */
  synonyms?: readonly string[];
  genera?: ReadonlySet<string>;
  /** Whether the reference holds a name as another of its species. */
  heldElsewhere?: (name: string) => boolean;
}

const LATIN = /^[\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]*$/u;
const binomialOf = (s: string) => s.replace(/^×\s*/, '').split(/\s+/).slice(0, 2).join(' ');

/** The rule above, over one item's statements. */
export function wikidataNames(statements: readonly WdNameStatement[], scope: WdNameScope): WdNames {
  const own = new Set([scope.scientific, ...(scope.synonyms ?? [])].map((n) => nameKey(binomialOf(n))).filter(Boolean));
  const refused: WdNames['refused'] = [];
  const kept: WdNameStatement[] = [];
  for (const s of statements) {
    const name = s.name.trim().replace(/\s+/g, ' ');
    if (!name) continue;
    const why =
      s.rank === 'deprecated' ? 'ranked deprecated in Wikidata'
      : !LATIN.test(name) ? 'not in the Latin script'
      : own.has(nameKey(name)) ? 'the scientific name'
      : bareGenus(name, { genus: scope.scientific, genera: scope.genera }) ? 'a genus named alone'
      : /^\p{Lu}\p{Ll}+ \p{Ll}+$/u.test(name) && scope.heldElsewhere?.(name) ? 'a scientific name this reference holds as another species'
      : undefined;
    if (why) { if (!refused.some((r) => r.name === name)) refused.push({ name, why }); continue; }
    kept.push({ ...s, name });
  }
  // The alphabet, so the order is the same however the statements were read (a query gives no order of its own).
  kept.sort((a, b) => nameKey(a.name).localeCompare(nameKey(b.name)) || a.name.localeCompare(b.name) || a.lang.localeCompare(b.lang));
  const rows: VernacularName[] = [];
  for (const s of kept) {
    const same = rows.find((r) => r.name === s.name);
    if (same) {
      // One spelling stated twice (in `en` and `en-gb`, say): one row, its references pooled.
      same.alsoFrom = [...new Set([...(same.alsoFrom ?? []), ...s.refs])].sort();
      if (!same.alsoFrom.length) delete same.alsoFrom;
      if (s.rank === 'preferred') same.preferred = true;
      continue;
    }
    rows.push({ name: s.name, lang: 'eng', source: WIKIDATA_SOURCE, ...(s.rank === 'preferred' ? { preferred: true } : {}), ...(s.refs.length ? { alsoFrom: [...s.refs] } : {}) });
  }
  return { rows, refused };
}

/** Whether a row was taken from Wikidata. */
export const fromWikidata = (v: Pick<VernacularName, 'source'>) => v.source === WIKIDATA_SOURCE;

/** The record of what the rule made of an item, as the page's Provenance and its name line say it. */
export function wdNamesRecord(item: string, r: WdNames, at: string): Upstream {
  const taken = r.rows.map((v) => `"${v.name}"`).join(', ');
  const refused = r.refused.map((x) => `"${x.name}" (${x.why})`).join(', ');
  const detail = [`Wikidata's item ${item}`, r.rows.length ? `${r.rows.length} English name${r.rows.length === 1 ? '' : 's'} taken: ${taken}` : 'no English name taken', ...(refused ? [`refused: ${refused}`] : [])].join('; ');
  return { status: r.rows.length ? 'ok' : 'none', at, detail };
}

/**
 * The record where no item's names were read: why, from the page's own Wikidata record. Wikidata answered that no item
 * carries the page's identifiers: "none". Two items, a refusal, a failure, or Wikidata not asked: not checked (rule 2).
 */
export function wdNamesNoItem(wikidata: Pick<Upstream, 'status' | 'detail'> | undefined, at: string): Upstream {
  const st = wikidata?.status;
  if (st === 'none') return { status: 'none', at, detail: `no Wikidata item taken for this species${wikidata?.detail ? ` (${wikidata.detail})` : ''}, so no name` };
  if (st === 'ambiguous') return { status: 'skipped', at, detail: `not asked: ${(wikidata?.detail ?? 'two Wikidata items answered').replace(/^not taken: /, '')}, so no item was taken` };
  if (st === 'refused' || st === 'error') return { status: st, at, detail: `not checked: Wikidata ${st === 'refused' ? 'refused the request' : 'did not answer'} for the item${wikidata?.detail ? ` (${wikidata.detail})` : ''}` };
  return { status: 'skipped', at, detail: 'not asked: Wikidata was not asked for this species\' item' };
}

/** What `--fill wikidata-names` did. */
export interface WdNamesCounts {
  /** Pages read, and of them the ones asked about: without a GBIF key, and with `--keyed` those with a key and no English name from GBIF. */
  read: number;
  keyless: number;
  keyed: number;
  /** Items asked, and in how many queries. */
  items: number;
  queries: number;
  /** Pages given at least one name, and of them the ones whose page now shows one (the generic nouns apart). */
  taken: number;
  shown: number;
  /** Pages whose item holds no English name the rule takes. */
  none: number;
  /** Pages with no item taken, said with why. */
  noItem: number;
  /** Pages left as they were because their query did not answer. */
  unchecked: number;
  written: number;
  lines: string[];
  failed?: string;
}

type Store = { files(): string[]; read<T>(file: string): T; write(file: string, d: unknown): void };
type Page = {
  key: string;
  ids: { gbif?: number; wikidata?: string };
  name: { scientific: string; synonyms?: string[]; vernacular: VernacularName[]; kew?: { synonyms?: string[] } };
  upstream: Record<string, Upstream>;
};

/**
 * `--fill wikidata-names` (round eighty): the English common names of every page without a GBIF key, from its own
 * Wikidata item, `WD_NAMES_ITEMS` items a query; with `keyed`, also of every page with a GBIF key whose GBIF names give
 * it no English name (the owner's decision: off by default). Each page's earlier Wikidata rows are replaced by the
 * answer, its GBIF rows left as they are; a page whose query did not answer is left as it was, and counted (rule 2).
 * Where no item was taken, the page's record says why. Then the index.
 */
export async function fillWikidataNames(store: Store, f: JsonFetcher, o: { keyed?: boolean; now?: () => string } = {}): Promise<WdNamesCounts> {
  const en = englishNames;
  const now = o.now ?? (() => new Date().toISOString());
  const c: WdNamesCounts = { read: 0, keyless: 0, keyed: 0, items: 0, queries: 0, taken: 0, shown: 0, none: 0, noItem: 0, unchecked: 0, written: 0, lines: [] };
  const files = store.files();
  // First pass: the reference's names and genera, and the pages to ask, read one at a time (48,000 pages are not held).
  const names = new Map<string, string>();
  const want: Array<{ file: string; item?: string }> = [];
  for (const file of files) {
    let d: Page;
    try { d = store.read<Page>(file); } catch { continue; }
    c.read++;
    names.set(d.name.scientific.toLowerCase(), d.key);
    if (d.ids?.gbif == null) { c.keyless++; want.push({ file, item: d.ids?.wikidata }); continue; }
    if (!o.keyed) continue;
    const gbifOnly = (d.name.vernacular ?? []).filter((v) => !fromWikidata(v));
    if (en(gbifOnly, { genus: d.name.scientific }).common) {
      // GBIF gives it an English name now: Wikidata's, taken by an earlier run, go.
      if (d.upstream?.[WD_NAMES] || gbifOnly.length !== (d.name.vernacular ?? []).length) want.push({ file });
      continue;
    }
    if (d.ids?.wikidata) { c.keyed++; want.push({ file, item: d.ids.wikidata }); }
  }
  const genera = generaOf(names.keys());
  const items = [...new Set(want.flatMap((w) => (w.item ? [w.item] : [])))];
  c.items = items.length;
  const answers = new Map<string, WdNameStatement[] | null>();
  for (let i = 0; i < items.length; i += WD_NAMES_ITEMS) {
    const part = items.slice(i, i + WD_NAMES_ITEMS);
    c.queries++;
    const r = await f<{ results?: { bindings?: Binding[] } }>(wdNamesUrl(part), { timeoutMs: 60_000, headers: { accept: 'application/sparql-results+json' } });
    if (r.status !== 'ok' || !Array.isArray(r.data?.results?.bindings)) {
      c.failed = r.status === 'ok' ? 'no results in the answer' : `${r.status}${'detail' in r && r.detail ? `: ${r.detail}` : ''}`;
      for (const q of part) answers.set(q, null);
      continue;
    }
    for (const [q, s] of statementsOfAnswer(part, r.data.results!.bindings!)) answers.set(q, s);
  }
  const at = now();
  for (const w of want) {
    let d: Page;
    try { d = store.read<Page>(w.file); } catch { continue; }
    const said = () => JSON.stringify([d.name.vernacular, d.upstream?.[WD_NAMES]?.status ?? null, d.upstream?.[WD_NAMES]?.detail ?? null]);
    const before = said();
    d.upstream = d.upstream ?? {};
    const gbifRows = (d.name.vernacular ?? []).filter((v) => !fromWikidata(v));
    if (!w.item) {
      d.name.vernacular = gbifRows;
      if (d.ids?.gbif == null) { d.upstream[WD_NAMES] = wdNamesNoItem(d.upstream?.wikidata, at); c.noItem++; }
      else delete d.upstream[WD_NAMES];
    } else {
      const s = answers.get(w.item);
      if (s == null) { c.unchecked++; continue; }
      const self = d.key;
      const r = wikidataNames(s, {
        scientific: d.name.scientific,
        synonyms: [...(d.name.synonyms ?? []), ...(d.name.kew?.synonyms ?? [])],
        genera,
        heldElsewhere: (n) => { const k = names.get(n.toLowerCase()); return k != null && k !== self; }
      });
      d.name.vernacular = [...gbifRows, ...r.rows];
      d.upstream[WD_NAMES] = wdNamesRecord(w.item, r, at);
      if (r.rows.length) {
        c.taken++;
        const shown = en(d.name.vernacular, { genus: d.name.scientific, genera }).common;
        if (shown) c.shown++;
        c.lines.push(`${d.name.scientific} [${d.key}]: ${shown ?? 'no name shown'} (${w.item}: ${r.rows.map((v) => v.name).join('; ')})${r.refused.length ? `; refused ${r.refused.map((x) => `"${x.name}" (${x.why})`).join(', ')}` : ''}`);
      } else {
        c.none++;
        if (r.refused.length) c.lines.push(`${d.name.scientific} [${d.key}]: none taken (${w.item}); refused ${r.refused.map((x) => `"${x.name}" (${x.why})`).join(', ')}`);
      }
    }
    // A page the answer leaves as it was is not written: its record keeps the day it was first read so.
    if (said() === before) continue;
    store.write(w.file, d);
    c.written++;
  }
  return c;
}
