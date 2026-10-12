import type { JsonFetcher, FetchResult, SourceResult } from '../fetch';

/* ---------- Wikidata (CC0): cross-identifiers ---------- */

export interface CrossIds {
  wikidata: string;
  powo?: string;
  ipni?: string;
  inat?: number;
  gbif?: number;
  wfo?: string;
  commonsCategory?: string;
  enTitle?: string;
}

const P = { gbif: 'P846', powo: 'P5037', ipni: 'P961', inat: 'P3151', wfo: 'P7715', commonsCat: 'P373', basionym: 'P566', taxonName: 'P225' };

/** MediaWiki answers HTTP 200 with an error body (maxlag, bad params); treat that as the source not answering, never as "none". */
export function mwError(data: unknown): string | null {
  const e = (data as { error?: { code?: string; info?: string } })?.error;
  return e ? `${e.code ?? 'error'}: ${e.info ?? ''}`.trim() : null;
}

/**
 * How long to wait before asking again, in seconds; a test makes it instant. MediaWiki answers a busy moment with HTTP 200
 * and `maxlag`, "Waiting for wdqs1011: 9.2 seconds lagged.", asking a client to come back when the replicas have caught
 * up. Taken as the source not answering, it failed Wikidata for 141 of the 156 species of round sixty-seven's online
 * rebuild, and with it the iNaturalist taxon it names, so the rebuild found no photographs for 113 (round sixty-eight).
 */
export const mwWait = {
  sleep: (s: number) => new Promise<void>((r) => setTimeout(r, s * 1000)),
  /** Asks of one call: one unless the corpus script sets `MAXLAG_TRIES` (`startCorpusRun`). No Worker route builds a
   *  dossier, so one ask only governs tests and a lag spell (round sixty-nine; triage-68 M10, S-A7). */
  tries: 1
};
/** The corpus script's asks of one call: the first and four more, each after the lag it names and a second, 5 to 30 s. */
export const MAXLAG_TRIES = 5;
export async function mwGet<T>(f: JsonFetcher, url: string): Promise<FetchResult<T>> {
  for (let i = 0; ; i++) {
    const r = await f<T>(url);
    if (r.status !== 'ok') return r;
    const e = (r.data as { error?: { code?: string; info?: string } })?.error;
    if (e?.code !== 'maxlag' || i >= mwWait.tries - 1) return r;
    const lag = Number(/([\d.]+) seconds? lagged/.exec(e.info ?? '')?.[1] ?? 5);
    await mwWait.sleep(Math.min(30, Math.max(5, Math.ceil(lag) + 1)));
  }
}

/**
 * A lag spell (round sixty-nine; triage-68 M10, S-A7): after `LAG_SPELL` species in a row whose Wikidata row ended lagged,
 * the corpus script stops waiting, one ask a call, so each species fails at once and keeps the previous build's
 * identifiers; the first species Wikidata answers again ends the spell. Five asks of 5 to 30 s each, at about 35 s a
 * species, would have taken some 87 hours over the corpus.
 */
export const LAG_SPELL = 10;
export function lagSpell(tries = MAXLAG_TRIES) {
  let run = 0;
  return {
    /** Called after each species with its Wikidata row; a species that did not ask Wikidata leaves the count as it was. */
    after(row?: { status?: string; detail?: string }): void {
      if (!row || row.status === 'skipped') return;
      run = row.status === 'error' && /maxlag/.test(row.detail ?? '') ? run + 1 : 0;
      mwWait.tries = run >= LAG_SPELL ? 1 : tries;
    },
    get run() {
      return run;
    }
  };
}

type Claims = Record<string, Array<{ mainsnak: { datavalue?: { value: unknown } } }>>;
type Entity = { claims?: Claims; sitelinks?: Record<string, { title: string }> };
const strings = (ent: Entity, p: string) => (ent.claims?.[p] ?? []).map((c) => c.mainsnak?.datavalue?.value).filter((v): v is string => typeof v === 'string');

async function entityOf(f: JsonFetcher, id: string): Promise<FetchResult<Entity | null>> {
  const e = await mwGet<{ entities?: Record<string, Entity>; error?: unknown }>(f,
    `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&ids=${id}&props=claims|sitelinks&sitefilter=enwiki&maxlag=5`
  );
  if (e.status !== 'ok') return e;
  const err = mwError(e.data);
  if (err) return { status: 'error', detail: `wikidata ${err}` };
  return { status: 'ok', data: e.data.entities?.[id] ?? null };
}

function crossOf(id: string, ent: Entity): CrossIds {
  const str = (p: string) => strings(ent, p)[0];
  const inatS = str(P.inat);
  const gbifS = str(P.gbif);
  return { wikidata: id, powo: str(P.powo), ipni: str(P.ipni), wfo: str(P.wfo), inat: inatS ? Number(inatS) : undefined, gbif: gbifS ? Number(gbifS) : undefined, commonsCategory: str(P.commonsCat), enTitle: ent.sitelinks?.enwiki?.title };
}

/**
 * The Wikidata item for a GBIF taxon key, found by the key itself (P846), so the identity can never be another species'
 * from a name search. When no item carries the key:
 *   - by name: taken only when one item's label is the name exactly, and that item proves it: its P846 is the species'
 *     key or a same-type older name's, or, carrying no P846, its taxon name (P225) is the name (round sixty-nine;
 *     triage-68 M7, IND-8: the first exact label was taken, and an item with no P846 passed unchecked);
 *   - by the GBIF records of the older names with the same type, in one search (round sixty-eight, third part), asking
 *     for one more item than there are keys, so a search that could hold more is never read as holding all (R46-16).
 * Two items left standing is `ambiguous`, "not taken: two items answered", never "none"; an answer by an older name
 * names it (triage-68 M8, R46-15).
 */
/**
 * Whether one of an item's GBIF keys is GBIF's record of this name or of a synonym of this species: its canonical name
 * is the name, in the plant kingdom, or its accepted key is this species'. `data` says which, for the record; null
 * when none is. A GBIF that does not answer is the answer, so the step is asked again, never decided without it.
 */
async function sameNameRecord(f: JsonFetcher, keys: readonly number[], name: string, gbifKey?: number): Promise<FetchResult<string | null>> {
  for (const k of keys.slice(0, 3)) {
    const r = await f<{ canonicalName?: string; scientificName?: string; kingdom?: string; acceptedKey?: number }>(`https://api.gbif.org/v1/species/${k}`);
    if (r.status === 'none') continue;
    if (r.status !== 'ok') return r;
    if (gbifKey && r.data.acceptedKey === gbifKey) return { status: 'ok', data: `${k} is GBIF's record of ${r.data.scientificName ?? 'a synonym'}, a synonym of this species` };
    if ((r.data.canonicalName ?? '').toLowerCase() === name.toLowerCase() && (r.data.kingdom ?? 'Plantae') === 'Plantae') return { status: 'ok', data: `${k} is GBIF's record of ${r.data.scientificName ?? name}, the same name` };
  }
  return { status: 'ok', data: null };
}

export async function crossIds(f: JsonFetcher, scientificName: string, gbifKey?: number, olderNames: ReadonlyArray<number | { key: number; name: string }> = []): Promise<SourceResult<CrossIds>> {
  const older = olderNames.slice(0, 10).map((o) => (typeof o === 'number' ? { key: o, name: '' } : o));
  const olderKeys = older.map((o) => o.key);
  const mw = <T,>(url: string) => mwGet<T & { error?: unknown }>(f, url);
  const failed = (data: unknown) => { const err = mwError(data); return err ? ({ status: 'error', detail: `wikidata ${err}` } as const) : null; };
  if (gbifKey) {
    const q = await mw<{ query?: { search?: Array<{ title: string }> } }>(`https://www.wikidata.org/w/api.php?action=query&format=json&list=search&srlimit=2&srsearch=${encodeURIComponent(`haswbstatement:P846=${gbifKey}`)}&maxlag=5`);
    if (q.status !== 'ok') return q;
    const bad = failed(q.data);
    if (bad) return bad;
    const hits = q.data.query?.search ?? [];
    if (hits.length === 1) {
      const e = await entityOf(f, hits[0].title);
      if (e.status !== 'ok') return e;
      if (!e.data) return { status: 'none' };
      return { status: 'ok', data: crossOf(hits[0].title, e.data) };
    }
  }
  const notes: string[] = [];
  let twoByName: string | undefined;
  {
    const s = await mw<{ search?: Array<{ id: string; label: string }> }>(`https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&type=item&limit=5&search=${encodeURIComponent(scientificName)}&maxlag=5`);
    if (s.status !== 'ok') return s;
    const bad = failed(s.data);
    if (bad) return bad;
    const exact = [...new Set((s.data.search ?? []).filter((x) => x.label.toLowerCase() === scientificName.toLowerCase()).map((x) => x.id))];
    // Each item with the label is read, and only a taxon's counts (a print or a painting of the plant carries its label
    // too: Q52515621 for Oxalis corniculata). Of the taxa, the ones whose identity is shown are taken, and only one.
    const proven: Array<{ id: string; e: Entity; detail?: string }> = [];
    for (const id of exact) {
      const e = await entityOf(f, id);
      if (e.status !== 'ok') return e;
      if (!e.data) continue;
      const names = strings(e.data, P.taxonName);
      const keys = strings(e.data, P.gbif).map(Number);
      const isTaxon = names.length > 0 || keys.length > 0 || strings(e.data, 'P31').includes('Q16521');
      if (!isTaxon) continue;
      if (keys.some((k) => k === gbifKey || olderKeys.includes(k))) { proven.push({ id, e: e.data }); continue; }
      if (!keys.length) {
        if (names.some((n) => n === scientificName)) proven.push({ id, e: e.data });
        else notes.push(`not taken: the item labelled ${scientificName}, ${id}, carries no GBIF key, and its taxon name is not this one`);
        continue;
      }
      // Its GBIF key is another record: taken when GBIF says that record is this name (another author's, or an older
      // record of it: Q146400 carries 2932865, "Solanum nigrum Forssk.", for Solanum nigrum L.) or is a synonym of this
      // species. Round sixty-nine, the owner's rebuild: nine species lost their item, Solanum nigrum and Prunus
      // armeniaca among them, to the rule that asked for the key alone.
      const same = await sameNameRecord(f, keys, scientificName, gbifKey);
      if (same.status !== 'ok') return same;
      if (same.data) proven.push({ id, e: e.data, detail: `found by its label; its GBIF key ${same.data}` });
      else notes.push(`not taken: the item labelled ${scientificName}, ${id}, carries GBIF key ${keys.join(', ')}, GBIF's record of another name`);
    }
    if (proven.length > 1) twoByName = `not taken: two items answered to the label ${scientificName} (${proven.map((p) => p.id).join(', ')})`;
    else if (proven.length === 1) return { status: 'ok', ...(proven[0].detail ? { detail: proven[0].detail } : {}), data: crossOf(proven[0].id, proven[0].e) };
  }
  // Wikidata files the species under an older name with the same type (Q310510, Ferocactus glaucescens, for Bisnaga
  // glaucescens): found by the GBIF record of that name, in one search, and taken only when one item answers (round
  // sixty-eight, third part). Two items that are not one the other's basionym is no answer.
  if (older.length) {
    const q = await mw<{ query?: { search?: Array<{ title: string }> } }>(`https://www.wikidata.org/w/api.php?action=query&format=json&list=search&srlimit=${older.length + 1}&srsearch=${encodeURIComponent(`haswbstatement:${olderKeys.map((k) => `P846=${k}`).join('|')}`)}&maxlag=5`);
    if (q.status !== 'ok') return q;
    const bad = failed(q.data);
    if (bad) return bad;
    let ids = (q.data.query?.search ?? []).map((h) => h.title);
    if (ids.length > 1) {
      // Wikidata often keeps the basionym as an item of its own (Q14943671, Echinocactus glaucescens), which the item for
      // the current placement names as its basionym (P566). An item another answer names so is that answer's older name,
      // not a second species: it is set aside, and what is left must still be one item.
      const b = await mw<{ entities?: Record<string, Entity> }>(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&ids=${ids.join('|')}&props=claims&maxlag=5`);
      if (b.status !== 'ok') return b;
      const berr = failed(b.data);
      if (berr) return berr;
      const named = new Set(ids.flatMap((q) => (b.data.entities?.[q]?.claims?.[P.basionym] ?? []).map((c) => (c.mainsnak.datavalue?.value as { id?: string } | undefined)?.id)));
      ids = ids.filter((q) => !named.has(q));
    }
    if (ids.length > 1) return { status: 'ambiguous', detail: `not taken: two items answered to the older names' GBIF records (${ids.join(', ')})` };
    if (ids.length === 1) {
      const e = await entityOf(f, ids[0]);
      if (e.status !== 'ok') return e;
      if (e.data) {
        const keys = strings(e.data, P.gbif).map(Number);
        // Found by an older name, the item must carry that name's key, or this species' own.
        const by = older.find((o) => keys.includes(o.key));
        if (by || !keys.length || keys.includes(gbifKey ?? NaN)) {
          const named = by?.name ? `the GBIF record of ${by.name}, an older name with the same type` : 'the GBIF record of an older name with the same type';
          return { status: 'ok', detail: `found by ${named}`, data: crossOf(ids[0], e.data) };
        }
        notes.push(`not taken: ${ids[0]}, found by an older name's GBIF record, carries GBIF key ${keys.join(', ')}`);
      }
    }
  }
  if (twoByName) return { status: 'ambiguous', detail: twoByName };
  return notes.length ? { status: 'none', detail: notes.join('; ') } : { status: 'none' };
}

/* ---------- Wikipedia (CC BY-SA): the lead paragraph, kept segregated ---------- */

/** A Wikipedia title as compared: lower case, underscores read as spaces. */
const titleKey = (t: string) => t.replace(/_/g, ' ').trim().toLowerCase();

/**
 * The lead of the English Wikipedia article. `accept` names the titles that are this species' article: the Wikidata
 * item's own sitelink, the species' name and its older names. Wikipedia follows a redirect without saying so, and with
 * no sitelink the name was asked: Weingartia pulchra's redirect gave Weingartia canigueralii's article, another species
 * with its own page here, and Kopsia fruticosa's gave the genus's. A final title outside `accept` is not this species'
 * article, and the answer is "none: Wikipedia redirects X to Y" (round sixty-nine; triage-68 M3, R46-12).
 */
export async function summary(f: JsonFetcher, title: string, accept?: readonly string[], who?: { name: string; synonyms: readonly string[] }): Promise<SourceResult<{ text: string; url: string; title: string }>> {
  const r = await f<{ extract?: string; content_urls?: { desktop?: { page?: string } }; title?: string; type?: string }>(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`
  );
  if (r.status !== 'ok') return r;
  if (r.data.type === 'https://mediawiki.org/wiki/HyperSwitch/errors/not_found') return { status: 'none' };
  if (typeof r.data.type === 'string' && /error/i.test(r.data.type)) return { status: 'error', detail: `wikipedia ${r.data.type}` };
  if (!r.data.extract || r.data.type === 'disambiguation') return { status: 'none' };
  const got = (r.data.title ?? title).replace(/_/g, ' ');
  // Under another title, the lead may still be this species' article: a genus of one species, a crop's common name, the
  // species placed in another genus (`redirectIsThisSpecies`; round sixty-nine, the owner's fill). Said so in the record.
  let detail: string | undefined;
  if (accept && !accept.some((a) => titleKey(a) === titleKey(got))) {
    if (!who || !redirectIsThisSpecies(got, r.data.extract, who.name, who.synonyms)) return { status: 'none', detail: redirected(title, got) };
    detail = `${redirected(title, got)}, whose lead is this species'`;
  }
  return { status: 'ok', ...(detail ? { detail } : {}), data: { text: r.data.extract.slice(0, 1500), url: r.data.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`, title: got } };
}

/** The binomials a species may be quoted under: its name and its older names at species rank, authors left off. */
function speciesBinomials(name: string, synonyms: readonly string[]): string[] {
  const out = [name.replace(/×\s*/g, '')];
  for (const s of synonyms) {
    const w = s.replace(/×\s*/g, '').split(/\s+/);
    if (/^(subsp|ssp|var|subvar|f|fo|forma|nothosubsp|nothovar)\.?$/.test(w[2] ?? '')) continue;
    if (w.length >= 2) out.push(`${w[0]} ${w[1]}`);
  }
  return out;
}
/** Two epithets that are one with another spelling or gender ending: scaphirostrus and scaphirostris, nudicaule and nudicaulis, luciae and lucieae. */
function sameEpithet(a: string, b: string): boolean {
  const stem = (e: string) => e.toLowerCase().replace(/(us|um|a|is|e|er|ii|i)$/, '');
  if (stem(a) === stem(b)) return true;
  // One or two letters apart, for a word of seven letters or more (stolonifer and stoloniferus are a stem apart).
  const [x, y] = [a.toLowerCase(), b.toLowerCase()];
  if (Math.min(x.length, y.length) < 6) return false;
  const d: number[][] = Array.from({ length: x.length + 1 }, (_, i) => Array.from({ length: y.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= x.length; i++) for (let j = 1; j <= y.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
  return d[x.length][y.length] <= 2;
}
const BINOMIAL = /^([A-Z][a-z-]+) ([a-z-]+)$/;

/**
 * Whether the lead Wikipedia gave under another title is still this species' article (round sixty-nine, the owner's
 * `--fill summaries`: 108 summaries dropped by title alone, and about nine in ten were this species' own article: the
 * page of a genus of one species, "Welwitschia"; a crop's, "Apple", "Coconut"; the species placed in another genus,
 * "Huernia zebrina" for Ceropegia zebrina; another spelling, "Ariocarpus scaphirostris"). Taken, when the title is
 *   - two words: the same epithet, in this genus (another spelling) or another (the same type placed elsewhere). Another
 *     epithet in one of this species' genera is another species, or this one lumped into it: Weingartia canigueralii for
 *     Weingartia pulchra. Another epithet in another genus, or a common name ("Date palm"), only when its lead names
 *     this species.
 *   - one word or more than two: when the lead names this species or an older name of it, or a near spelling of one in the same
 *     genus ("The sole species is Harpephyllum afrum"); and otherwise only when the lead is not a genus's or a group's
 *     ("Kopsia is a genus…", "a common name for several species"), so a crop's page by its common name stands.
 */
export function redirectIsThisSpecies(got: string, text: string, name: string, synonyms: readonly string[]): boolean {
  const ours = speciesBinomials(name, synonyms).map((b) => BINOMIAL.exec(b)).filter((m): m is RegExpExecArray => !!m);
  const named = [...text.matchAll(/\b([A-Z][a-z-]+) ([a-z-]{3,})\b/g)];
  const namesUs = named.some((n) => ours.some((m) => m[1] === n[1] && (m[2] === n[2] || sameEpithet(m[2], n[2]))));
  const title = BINOMIAL.exec(got.replace(/_/g, ' ').trim());
  if (title) {
    if (ours.some((m) => sameEpithet(m[2], title[2]))) return true;
    // Another species of one of this species' genera, whatever its lead says; in another genus (or a two-word common
    // name, "Date palm"), only when its lead names this species.
    if (ours.some((m) => m[1] === title[1])) return false;
    return namesUs;
  }
  if (namesUs) return true;
  if (!text.trim()) return false; // no lead to read: nothing says it is this species'
  return !/\b(is|was|are) an? (small |large |monotypic )?genus\b|\bgenus of\b|\bseveral species\b|\bcommon name (for|of|used)\b|\bgroup of\b/i.test(text);
}

/** The record of a summary set aside because Wikipedia's article is under another title. */
export const redirected = (asked: string, got: string) => `Wikipedia redirects ${asked.replace(/_/g, ' ')} to ${got}`;

/**
 * Whether a stored summary's title is one this species may quote: its name, or one of its older names (the binomial of
 * each of GBIF's synonyms as stored, author left off), or a title the caller has confirmed as the item's sitelink.
 * `--fill summaries` reads it offline (round sixty-nine; triage-68 M3).
 */
export function summaryTitleFits(title: string, name: string, synonyms: readonly string[], sitelink?: string): boolean {
  const t = titleKey(title);
  if (t === titleKey(name) || (sitelink && t === titleKey(sitelink))) return true;
  return synonyms.some((s) => {
    const w = s.replace(/×\s*/g, '').split(/\s+/);
    // A subspecies or variety is not a species' name: its first two words are another species' (Rebutia canigueralii subsp. pulchra).
    if (/^(subsp|ssp|var|subvar|f|fo|forma|nothosubsp|nothovar)\.?$/.test(w[2] ?? '')) return false;
    return titleKey(w.slice(0, 2).join(' ')) === t;
  });
}
