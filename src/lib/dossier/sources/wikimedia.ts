import type { JsonFetcher, FetchResult, SourceResult } from '../fetch';
import * as gbif from './gbif';
import { spellingKey } from '../epithet';

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
export type Entity = { claims?: Claims; sitelinks?: Record<string, { title: string }> };
const strings = (ent: Entity, p: string) => (ent.claims?.[p] ?? []).map((c) => c.mainsnak?.datavalue?.value).filter((v): v is string => typeof v === 'string');
/** An item-valued property's items: P31's and P566's values are `{ id }`, which `strings` would drop (R47-5: the taxon test never ran). */
const items = (ent: Entity, p: string) => (ent.claims?.[p] ?? []).map((c) => (c.mainsnak?.datavalue?.value as { id?: unknown } | undefined)?.id).filter((v): v is string => typeof v === 'string');
/** What an item is an instance of (P31) when it is a taxon: a taxon, a monotypic, fossil or extinct taxon. */
const TAXON = new Set(['Q16521', 'Q310890', 'Q23038290', 'Q98961713']);
/**
 * Whether an item is a taxon (round seventy, second pass; triage-69 B6, R47-5, R47-19): by its P31 when it states one
 * (a print, a painting or a "Wikimedia duplicated page" with the plant's taxon name is not), else by carrying a taxon
 * name or a GBIF key.
 */
export function isTaxonItem(ent: Entity): boolean {
  const p31 = items(ent, 'P31');
  return p31.length ? p31.some((q) => TAXON.has(q)) : strings(ent, P.taxonName).length > 0 || strings(ent, P.gbif).length > 0;
}
/**
 * Items that name one basionym (P566) are one plant under two combinations (Ceropegia sociarum: Q18079039, Larryleachia
 * sociarum, and Q94365634, Hoodia sociarum, both on Q38452189): one answer, not two (round seventy, second pass;
 * triage-69 B6, R47-5). The one taken is the one Wikidata links to iNaturalist, else the first answer. Undefined when
 * the items do not all name one basionym.
 */
function oneByBasionym(found: ReadonlyArray<{ id: string; e: Entity }>): string | undefined {
  const b = found.map((x) => items(x.e, P.basionym));
  if (found.length < 2 || b.some((x) => x.length !== 1) || new Set(b.map((x) => x[0])).size !== 1) return undefined;
  return (found.find((x) => strings(x.e, P.inat).length) ?? found[0]).id;
}

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

/** How many of an item's GBIF keys are read to prove it, and how many hits a search by IPNI identifier reads. */
export const LABEL_KEYS = 5;

/**
 * What the cross-identifier step answers. A refusal or failure of GBIF, asked to check an item Wikidata gave, carries
 * `by: 'gbif'`: Wikidata answered, and the record says GBIF did not (round seventy; triage-69 B2, S-B6).
 */
export type CrossResult = SourceResult<CrossIds> & { by?: 'gbif' };

/** GBIF's answer, while checking an item, as the step's: marked as GBIF's. */
const gbifs = <T,>(r: Exclude<FetchResult<T>, { status: 'ok' } | { status: 'none' }>): CrossResult => ({ ...r, by: 'gbif' });

/** Two binomials are one name when the genus is the same and the epithet one spelling of the other (`spellingKey`). */
function sameName(a: string, b: string): boolean {
  const x = a.trim().split(/\s+/), y = b.trim().split(/\s+/);
  return x.length === 2 && y.length === 2 && x[0].toLowerCase() === y[0].toLowerCase() && spellingKey(x[1]) === spellingKey(y[1]);
}

type KeyReading = { proof?: string; against?: string; why: string[]; served: number };

/**
 * An item's GBIF keys read against this species, `LABEL_KEYS` at most (round seventy; triage-69 B2, S-B2, S-B3, IND-3).
 * A key proves the item when GBIF's record of it is a synonym of this species, or is this name (the genus and an epithet
 * of one spelling) at species rank, in the plant kingdom as the record states it, and filed under no other species. A
 * record GBIF files under another species (`acceptedKey` neither this species nor a rank below it) proves nothing,
 * whatever its name, and refuses the item (`against`): "Agave variegata Steud.", filed under Agave americana, is another
 * plant than Agave variegata Jacobi. A key GBIF no longer serves is no key (`served` counts those it does): Catalpa
 * speciosa's 317261. A GBIF that does not answer is the answer, so the step is asked again, never decided without it.
 */
async function readKeys(f: JsonFetcher, keys: readonly number[], name: string, gbifKey?: number): Promise<FetchResult<KeyReading>> {
  const out: KeyReading = { why: [], served: 0 };
  for (const k of keys.slice(0, LABEL_KEYS)) {
    const r = await f<{ canonicalName?: string; scientificName?: string; kingdom?: string; rank?: string; acceptedKey?: number; accepted?: string; speciesKey?: number }>(`https://api.gbif.org/v1/species/${k}`);
    if (r.status === 'none') { out.why.push(`${k}, which GBIF no longer serves`); continue; }
    if (r.status !== 'ok') return r;
    out.served++;
    const d = r.data;
    const sci = d.scientificName ?? d.canonicalName ?? 'a record';
    if (gbifKey && r.data.acceptedKey === gbifKey) { out.proof ??= `${k} is GBIF's record of ${sci}, a synonym of this species`; continue; }
    if (!sameName(d.canonicalName ?? '', name)) { out.why.push(`${k}, GBIF's record of another name`); continue; }
    if (d.acceptedKey != null && d.acceptedKey !== gbifKey && d.speciesKey !== gbifKey) { out.against ??= `${k}, GBIF's record of ${sci}, which GBIF files under ${d.accepted ?? 'another species'}`; out.why.push(out.against); continue; }
    if (d.kingdom !== 'Plantae') { out.why.push(`${k}, GBIF's record of ${sci}, not stated to be a plant`); continue; }
    if ((d.rank ?? 'SPECIES').toUpperCase() !== 'SPECIES') { out.why.push(`${k}, GBIF's record of ${sci}, at ${d.rank!.toLowerCase()} rank`); continue; }
    out.proof ??= `${k} is GBIF's record of ${sci}, the same name`;
  }
  return { status: 'ok', data: out };
}

/**
 * The Wikidata item for a GBIF taxon key, found by the key itself (P846), so the identity can never be another species'
 * from a name search. When no item carries the key:
 *   - by name: the items whose label is the name exactly, each a taxon (a print of the plant carries the label too), each
 *     proved (round seventy; triage-69 B2, S-B2, S-B3, S-B6, IND-3; before it, round sixty-nine's section 14 and
 *     triage-68 M7):
 *       - by carrying the species' GBIF key or a same-type older name's;
 *       - IPNI first: an item that carries an IPNI identifier (P961) is taken when it is Kew's for this name and author
 *         (`gbif.kewIpni`), and refused when Kew holds the name by this author under another identifier: Agave variegata
 *         Jacobi's label item carries 62332-1, "Agave variegata hort. ex Steud.", where Kew's is 62333-1;
 *       - otherwise by its GBIF keys (`readKeys`): a synonym of this species, or this name at species rank in the plant
 *         kingdom stated, and never a record GBIF files under another species;
 *       - carrying no GBIF key GBIF still serves, by its taxon name (P225) alone, which is taken only when no other item
 *         is proved: a homonym's item carries the name too;
 *   - by IPNI: with no item proved by key or label, the item that carries Kew's IPNI identifier for this name and
 *     author (`haswbstatement:P961=`), reading one hit more than Kew has identifiers for it;
 *   - by the GBIF records of the older names with the same type, in one search (round sixty-eight, third part), asking
 *     for one more item than there are keys, so a search that could hold more is never read as holding all (R46-16).
 * Two items left standing is `ambiguous`, "not taken: two items answered", never "none"; an answer by an older name
 * names it (triage-68 M8, R46-15). A GBIF that does not answer while an item is checked is the step's answer, marked as
 * GBIF's (`by`), so the previous identifiers are kept and the record says which source did not answer.
 */
export async function crossIds(f: JsonFetcher, scientificName: string, gbifKey?: number, olderNames: ReadonlyArray<number | { key: number; name: string }> = [], opts: { authorship?: string } = {}): Promise<CrossResult> {
  const older = olderNames.slice(0, 10).map((o) => (typeof o === 'number' ? { key: o, name: '' } : o));
  const olderKeys = older.map((o) => o.key);
  const mw = <T,>(url: string) => mwGet<T & { error?: unknown }>(f, url);
  const failed = (data: unknown) => { const err = mwError(data); return err ? ({ status: 'error', detail: `wikidata ${err}` } as const) : null; };
  // Kew's identifiers for this name and author, asked of GBIF once, when an item carries an IPNI identifier or none is found.
  type Kew = { ids: string[]; label?: string; others?: Array<{ id: string; label: string }>; acceptedKeys?: number[] };
  let kew: Kew | undefined;
  const kewOf = async (): Promise<FetchResult<Kew>> => {
    if (kew) return { status: 'ok', data: kew };
    const r = await gbif.kewIpni(f, scientificName, opts.authorship);
    if (r.status === 'ok') kew = r.data;
    return r;
  };
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
  let two: string | undefined;
  {
    const s = await mw<{ search?: Array<{ id: string; label: string }> }>(`https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&type=item&limit=5&search=${encodeURIComponent(scientificName)}&maxlag=5`);
    if (s.status !== 'ok') return s;
    const bad = failed(s.data);
    if (bad) return bad;
    const exact = [...new Set((s.data.search ?? []).filter((x) => x.label.toLowerCase() === scientificName.toLowerCase()).map((x) => x.id))];
    // Each item with the label is read, and only a taxon's counts (a print or a painting of the plant carries its label
    // too: Q52515621 for Oxalis corniculata). Of the taxa, the ones whose identity is shown are taken, and only one; an
    // item shown by its taxon name alone (`byName`) only when no other is.
    const proven: Array<{ id: string; e: Entity; detail?: string; byName?: true; ipni?: string }> = [];
    const unlike = (id: string, why: string) => notes.push(`not taken: the item labelled ${scientificName}, ${id}, ${why}`);
    for (const id of exact) {
      const e = await entityOf(f, id);
      if (e.status !== 'ok') return e;
      if (!e.data) continue;
      const names = strings(e.data, P.taxonName);
      const keys = strings(e.data, P.gbif).map(Number);
      const ipnis = strings(e.data, P.ipni);
      if (!isTaxonItem(e.data)) continue;
      if (keys.some((k) => k === gbifKey || olderKeys.includes(k))) { proven.push({ id, e: e.data }); continue; }
      if (ipnis.length) {
        const k = await kewOf();
        if (k.status !== 'ok') return k.status === 'none' ? { status: 'none' } : gbifs(k);
        const hit = ipnis.find((i) => k.data.ids.includes(i));
        if (hit) { proven.push({ id, e: e.data, ipni: hit, detail: `found by its label; its IPNI identifier ${hit} is Kew's for ${k.data.label}` }); continue; }
        // Kew's identifier for this name by another author: the homonym's item (round seventy, second pass; R47-5).
        const other = k.data.others?.find((o) => ipnis.includes(o.id));
        if (other) { unlike(id, `carries IPNI ${other.id}, Kew's for ${other.label}, another author's name`); continue; }
        if (k.data.ids.length) { unlike(id, `carries IPNI ${ipnis.join(', ')}, where Kew's for ${k.data.label} is ${k.data.ids.join(' or ')}`); continue; }
        // Kew holds this name by this author under no identifier (or not at all): GBIF's records decide, as for an item with none.
      }
      const g: FetchResult<KeyReading> = keys.length ? await readKeys(f, keys, scientificName, gbifKey) : { status: 'ok', data: { why: [], served: 0 } };
      if (g.status !== 'ok') return g.status === 'none' ? { status: 'none' } : gbifs(g);
      if (g.data.against) { unlike(id, `carries GBIF key ${g.data.why.join('; GBIF key ')}`); continue; }
      if (g.data.proof) { proven.push({ id, e: e.data, detail: `found by its label; its GBIF key ${g.data.proof}` }); continue; }
      if (!g.data.served) {
        const gone = keys.length ? `its GBIF key ${g.data.why.join('; ')}, ` : '';
        if (names.some((n) => n === scientificName)) proven.push({ id, e: e.data, byName: true, ...(gone ? { detail: `found by its label; ${gone}and its taxon name is this name` } : {}) });
        else unlike(id, keys.length ? `carries GBIF key ${g.data.why.join('; GBIF key ')}, and its taxon name is not this one` : 'carries no GBIF key, and its taxon name is not this one');
        continue;
      }
      unlike(id, `carries GBIF key ${g.data.why.join('; GBIF key ')}`);
    }
    // An item shown by its taxon name alone is set aside when another item's identity is shown (Mesembryanthemum
    // parviflorum Jacq.: Q17375709 carries Kew's IPNI for it, Q108737043 the name only).
    const strong = proven.filter((p) => !p.byName);
    let left = strong.length ? strong : proven;
    const one = oneByBasionym(left);
    if (one) left = left.filter((p) => p.id === one);
    if (left.length > 1) two = `not taken: two items answered to the label ${scientificName} (${left.map((p) => p.id).join(', ')})`;
    // An item with two IPNI identifiers links the one that proved it.
    else if (left.length === 1) return { status: 'ok', ...(left[0].detail ? { detail: left[0].detail } : {}), data: { ...crossOf(left[0].id, left[0].e), ...(left[0].ipni ? { ipni: left[0].ipni } : {}) } };
  }
  // Found by IPNI (round seventy; triage-69 B2): the item that carries Kew's identifier for this name and author, asked
  // when no item was proved by key or label, and before the older names (round seventy, the owner's run: Scilla siberica's
  // item Q158944, labelled "Siberian squill", carries Kew's 927545-1, and the older names' search gave Othocallis
  // siberica's item, the item of another combination).
  if (!two && gbifKey) {
    const k = await kewOf();
    if (k.status !== 'ok' && k.status !== 'none') return gbifs(k);
    if (k.status === 'ok' && k.data.ids.length) {
      const q = await mw<{ query?: { search?: Array<{ title: string }> } }>(`https://www.wikidata.org/w/api.php?action=query&format=json&list=search&srlimit=${k.data.ids.length + 1}&srsearch=${encodeURIComponent(`haswbstatement:${k.data.ids.map((i) => `P961=${i}`).join('|')}`)}&maxlag=5`);
      if (q.status !== 'ok') return q;
      const bad = failed(q.data);
      if (bad) return bad;
      const ids = [...new Set((q.data.query?.search ?? []).map((h) => h.title))];
      if (ids.length > 1) two = `not taken: two items carry Kew's IPNI identifier for ${k.data.label} (${ids.join(', ')})`;
      else if (ids.length === 1) {
        const e = await entityOf(f, ids[0]);
        if (e.status !== 'ok') return e;
        const hit = e.data ? strings(e.data, P.ipni).find((i) => k.data.ids.includes(i)) : undefined;
        if (e.data && hit) return { status: 'ok', detail: `found by its IPNI identifier ${hit}, Kew's for ${k.data.label}`, data: { ...crossOf(ids[0], e.data), ipni: hit } };
      }
    }
  }
  // Wikidata files the species under an older name with the same type (Q310510, Ferocactus glaucescens, for Bisnaga
  // glaucescens): found by the GBIF record of that name, in one search, and taken only when one item answers (round
  // sixty-eight, third part). Two items that are not one the other's basionym is no answer.
  if (older.length) {
    let kewPick: string | undefined;
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
      // Two items on one basionym are one plant (Ceropegia sociarum; R47-5).
      const one = oneByBasionym(ids.map((q) => ({ id: q, e: b.data.entities?.[q] ?? {} })));
      if (one) ids = [one];
      // Still two: the one that carries the IPNI identifier of the entry Kew accepts for this species is the one (round
      // seventy, the owner's run: Parrycactus flavovirens, Kew's synonym of Ferocactus flavovirens, found Q309595,
      // Ferocactus flavovirens, carrying Kew's 103628-2, and Q109398281, Bisnaga flavovirens, with no basionym stated).
      if (ids.length > 1 && gbifKey) {
        const k = await kewOf();
        if (k.status !== 'ok' && k.status !== 'none') return gbifs(k);
        if (k.status === 'ok' && k.data.acceptedKeys?.length) {
          const acc = await gbif.kewEntryIpni(f, k.data.acceptedKeys);
          if (acc.status === 'refused' || acc.status === 'error' || acc.status === 'skipped') return gbifs(acc);
          const held = acc.status === 'ok' ? acc.data : [];
          const hit = ids.filter((q) => strings(b.data.entities?.[q] ?? {}, P.ipni).some((i) => held.some((a) => a.id === i)));
          if (hit.length === 1) { ids = hit; kewPick = held.find((a) => strings(b.data.entities?.[hit[0]] ?? {}, P.ipni).includes(a.id))?.label; }
        }
      }
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
          return { status: 'ok', detail: `found by ${named}${kewPick ? `, the item of ${kewPick}, the name Kew accepts for it` : ''}`, data: crossOf(ids[0], e.data) };
        }
        notes.push(`not taken: ${ids[0]}, found by an older name's GBIF record, carries GBIF key ${keys.join(', ')}`);
      }
    }
  }
  if (two) return { status: 'ambiguous', detail: two };
  return notes.length ? { status: 'none', detail: notes.join('; ') } : { status: 'none' };
}

/* ---------- Wikipedia: `./wikipedia.ts` (round seventy, before the round: moved, unchanged) ---------- */
export * from './wikipedia';
