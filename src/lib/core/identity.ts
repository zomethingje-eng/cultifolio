/**
 * A plant's identity and provenance as a botanic garden records them (round eighty-seven, the tracker's t1: the plan's
 * F1, F2, F3 and F6). Every field here is a plain field of an `accession` record, so a version of the app that does not
 * know it folds it as an unknown field and keeps it (round eighty-six's `changeError` passes a field it does not type).
 * Nothing here is a new kind of record: round eighty-six refuses a batch that holds one, whole.
 *
 * - Items (F1): an accession of one genetic origin can hold several plants: offsets, divisions, bulb splits. The plant
 *   first filed keeps the number as it is ("2026-0012"); each plant split off it is an item, a record of its own with the
 *   number and a letter, "2026-0012/A", "2026-0012/B", as IrisBG and Hortis qualify an accession's plants. An item carries
 *   `item` (its letter) and `itemOf` (the record id of the plant that holds the bare number). Items share the accession's
 *   name and provenance (`SHARED_FIELDS`, written to every plant of the accession together) and have their own place,
 *   status, log and photographs.
 * - Deaccession (F1): a plant no longer held keeps its record, with a reason (`deacc`), a day (`deaccOn`) and a note
 *   (`deaccNote`). Nothing is deleted. Its status is set too (dead for died and propagation failed, archived otherwise),
 *   so a version that does not know the reason still takes the plant off the growing list.
 * - Provenance in ITF2's codes (F2): the International Transfer Format for Botanic Garden Plant Records, version 2 (BGCI
 *   and TDWG, 1998; https://www.bgci.org/files/Databases/itf2.pdf): Provenance Type (prot, E.1), Propagation History
 *   (prohis, E.2), Primary Collector's Name (cnam, F.24), Collector's Identifier (cid, F.25), Collection Date (cdat,
 *   F.27), Verification Level (vlev, D.1), Verifier's Name (vnam, D.2), Verification Date (vdat, D.3), Verification
 *   History (vhist, D.5), Identification Qualifier (idql, C.25) and Rank Qualified (rkql, C.24), Accession Status (accsta, B.4).
 * - Field numbers (F3): the existing `fieldNumber`, kept as typed, is the collector's identifier; read here as a
 *   collector's code and a number ("SB 829": SB, 829), never stored twice.
 * - Identification (F6): "cf.", "aff.", "nr." and "sp." stay in the name, as round sixty-one decided (`parseName`'s
 *   qualifier); the ITF2 qualifier is read from it. An "ex" chain of earlier holders (`exChain`), a clone name (`clone`),
 *   and the names a plant had before (`idHistory`), each with the day it stopped being the plant's name.
 *
 * Every reader here validates on read: a value of another shape, a word this version does not know, a text past its cap,
 * is read as not stated, so a damaged or newer record never throws on a page.
 */
import { parseName } from './names';

/* ---------------------------------------------------------------- caps ---------------------------------------------------------------- */

/** The longest text kept in one of these fields; a longer value is cut there when read. */
export const TEXT_MAX = 200;
/** The longest note on a deaccession. */
export const NOTE_MAX = 1000;
/** Earlier holders in an "ex" chain. */
export const EX_MAX = 12;
/** Earlier names kept in a plant's identification history; the oldest go first past it. */
export const HISTORY_MAX = 30;
/** Items of one accession: A to Z, then AA to ZZ. */
export const ITEM_MAX = 26 + 26 * 26;

/* ---------------------------------------------------------------- words ---------------------------------------------------------------- */

/** Why a plant is no longer held (round eighty-seven; F1). The words are db/types.ts's `DeaccReason`, kept in step by a test. */
export const DEACC_REASONS = ['died', 'given', 'lost', 'failed', 'stolen', 'reaccessioned'] as const;
export type DeaccReason = (typeof DEACC_REASONS)[number];
export const DEACC_LABEL: Record<DeaccReason, string> = { died: 'Died', given: 'Given away', lost: 'Lost', failed: 'Propagation failed', stolen: 'Stolen', reaccessioned: 'Reaccessioned' };
/** The status a deaccession sets beside its reason, so a version that does not read the reason takes the plant off the growing list. */
export const deaccStatus = (r: DeaccReason): 'dead' | 'archived' => (r === 'died' || r === 'failed' ? 'dead' : 'archived');
/**
 * ITF2's Accession Status (B.4) for a plant: C, current; D, not current by death; T, by transfer to another record system
 * (given away); O, other (lost, stolen, reaccessioned). A plant marked dead without a deaccession is D; any other is C.
 */
export function accsta(a: object): 'C' | 'D' | 'T' | 'O' {
  const r = deaccOf(a);
  if (r === 'died' || r === 'failed') return 'D';
  if (r === 'given') return 'T';
  if (r) return 'O';
  return (a as { status?: unknown }).status === 'dead' ? 'D' : 'C';
}

/** ITF2 E.1, Provenance Type, with ITF2's meanings in plain words. */
export const PROV_TYPES = ['W', 'Z', 'G', 'U'] as const;
export type ProvType = (typeof PROV_TYPES)[number];
export const PROV_TYPE_LABEL: Record<ProvType, string> = {
  W: 'W: of wild source',
  Z: 'Z: propagated from a wild-source plant in cultivation',
  G: 'G: not of wild source',
  U: 'U: not enough known to say'
};
/** ITF2 E.2, Propagation History; the second letter is optional. */
export const PROP_HISTORIES = ['I', 'S', 'SA', 'SB', 'SC', 'V', 'VA', 'VB', 'U'] as const;
export type PropHistory = (typeof PROP_HISTORIES)[number];
export const PROP_HISTORY_LABEL: Record<PropHistory, string> = {
  I: 'I: an individual wild plant',
  S: 'S: from seed (sexual reproduction)',
  SA: 'SA: from seed, open breeding',
  SB: 'SB: from seed, controlled breeding',
  SC: 'SC: from seed, self-pollinated',
  V: 'V: derived asexually',
  VA: 'VA: by vegetative reproduction',
  VB: 'VB: by apomixis',
  U: 'U: not known'
};
/** ITF2 D.1, Verification Level. */
export const ID_LEVELS = ['U', '0', '1', '2', '3', '4'] as const;
export type IdLevel = (typeof ID_LEVELS)[number];
export const ID_LEVEL_LABEL: Record<IdLevel, string> = {
  U: 'U: not known whether it was checked',
  '0': '0: not determined by any authority',
  '1': '1: compared with other named plants',
  '2': '2: by a competent person with a library or herbarium',
  '3': '3: by a taxonomist revising the group',
  '4': '4: type material, or propagated from it'
};

/** The grower's own provenance words (db/types.ts's `Provenance`). */
type Prov = 'wild' | 'f1' | 'fn' | 'veg' | 'unknown';

/**
 * The ITF2 provenance type the grower's own word says, where the two definitions coincide (round eighty-seven; F2), and
 * null where they do not: "wild-collected" and "F1, raised from wild-collected seed" are both W in ITF2 (E.1: material
 * collected in the wild, "grown on from the original stock"; its grade-1 list puts plants grown from wild-collected seed
 * under W). Cultivated seed and vegetative material are Z or G, which the word does not tell, and "not stated" is not U,
 * which is a statement that too little is known. Never a guess.
 */
export function provTypeRead(p: unknown): ProvType | null {
  return p === 'wild' || p === 'f1' ? 'W' : null;
}
/** The ITF2 propagation history the grower's word says: F1 and cultivated seed are S, vegetative V. "Wild-collected" is I or VA in ITF2, which the word does not tell. */
export function propHistoryRead(p: unknown): PropHistory | null {
  return p === 'f1' || p === 'fn' ? 'S' : p === 'veg' ? 'V' : null;
}

/**
 * Why an ITF2 type and history do not go with each other or with the grower's own provenance word, as a sentence, or null
 * (ITF2 E.2's rules 6 and 7, and the definitions of E.1). The forms and the import refuse such a pair rather than file a
 * record a garden's system would reject.
 */
export function itf2Problem(provenance: unknown, prot: ProvType | null, prohis: PropHistory | null): string | null {
  if (prot === 'W' && prohis === 'U') return 'a plant of wild source (W) has a known propagation history, so it cannot be U (ITF2 E.2, rule 6)';
  if (prohis === 'I' && prot && prot !== 'W') return 'an individual wild plant (I) is of wild source, W (ITF2 E.2, rule 7)';
  const word = provenance as Prov;
  if (prot) {
    const fits: Record<Prov, ProvType[]> = { wild: ['W'], f1: ['W'], fn: ['Z', 'G'], veg: ['W', 'Z', 'G'], unknown: ['W', 'Z', 'G', 'U'] };
    const ok = fits[word] ?? fits.unknown;
    if (!ok.includes(prot)) return `${PROV_TYPE_LABEL[prot]} does not go with the provenance "${PROV_WORD[word] ?? word}"`;
  }
  if (prohis && prohis !== 'U') {
    const seed = prohis.startsWith('S'), veg = prohis.startsWith('V');
    if ((word === 'f1' || word === 'fn') && !seed) return `${PROP_HISTORY_LABEL[prohis]} does not go with the provenance "${PROV_WORD[word]}", which is seed`;
    if (word === 'veg' && !veg) return `${PROP_HISTORY_LABEL[prohis]} does not go with the provenance "${PROV_WORD.veg}"`;
    if (word === 'wild' && seed) return `${PROP_HISTORY_LABEL[prohis]} does not go with the provenance "${PROV_WORD.wild}"; a plant raised from wild seed is "${PROV_WORD.f1}"`;
  }
  return null;
}
const PROV_WORD: Record<Prov, string> = { wild: 'wild-collected', f1: 'F1, raised from wild-collected seed', fn: 'cultivated seed (Fn)', veg: 'vegetative', unknown: 'not stated' };

/* ---------------------------------------------------------------- dates ---------------------------------------------------------------- */

/**
 * A day, a month or a year (round eighty-seven; ITF2 F.27 and D.3 allow a collection or a verification date to lack its
 * day, or its day and month): YYYY-MM-DD, YYYY-MM or YYYY, a real day of the calendar, from 1700 to 2199.
 */
export function isPartialDate(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(v);
  if (!m) return false;
  const y = Number(m[1]);
  if (y < 1700 || y > 2199) return false;
  if (m[2] === undefined) return true;
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return false;
  if (m[3] === undefined) return true;
  const d = Number(m[3]);
  const at = new Date(Date.UTC(y, mo - 1, d));
  return at.getUTCDate() === d && at.getUTCMonth() === mo - 1;
}
/** A partial date in ITF2's syntax: YYYYMMDD, YYYYMM or YYYY (F.27, D.3). */
export const itf2Date = (d: string | null): string | null => (d && isPartialDate(d) ? d.replace(/-/g, '') : null);
/**
 * A partial date as typed or as a sheet gives it: ISO (2019, 2019-03, 2019-03-07) or ITF2 (2019, 201903, 20190307);
 * null when it is neither, or no real day.
 */
export function readPartialDate(text: string | null | undefined): string | null {
  const t = (text ?? '').trim();
  if (!t) return null;
  const itf = /^(\d{4})(\d{2})?(\d{2})?$/.exec(t);
  const iso = itf ? [itf[1], itf[2], itf[3]].filter(Boolean).join('-') : t;
  return isPartialDate(iso) ? iso : null;
}

/* ---------------------------------------------------------------- field numbers ---------------------------------------------------------------- */

/**
 * A field number read as a collector's code and a number (round eighty-seven; F3): "SB 829" is SB and 829, "KK1398" KK
 * and 1398, "MG 1234.5" MG and 1234.5, "Lau 1234" Lau and 1234, "PP 1/23" PP and 1/23. The code is the letters before the
 * first digit (with spaces, "&" and full stops between them); the number is the rest, from that digit. Anything else
 * ("Mesa Garden", "1234" alone, a code over twelve characters) is not read, and the text as typed stands alone. The
 * text as typed is what is stored; this is a reading of it.
 */
export function parseFieldNumber(raw: unknown): { code: string; no: string } | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim().replace(/\s+/g, ' ');
  if (!t || t.length > 40) return null;
  const m = /^(\p{L}[\p{L}&.' ]*?)\s*(\d[\p{L}\d./-]*)$/u.exec(t);
  if (!m) return null;
  const code = m[1].trim();
  if (!code || code.length > 12 || /\d/.test(code)) return null;
  return { code, no: m[2] };
}

/**
 * The BCSS Field Number Database's lookup for a field number (round eighty-seven; F3): a link the grower presses, never a
 * request the page makes. The database is the British Cactus and Succulent Society's
 * (https://fieldnos.bcss.org.uk/fieldno.html); `www.fieldnos.bcss.org.uk` answers 301 to this host with the path and query
 * kept, so the link names this host and spares the hop. The text goes as typed: the database reads "KK2005" and
 * "A 91/I/10a" alike.
 */
export const BCSS_LOOKUP = 'https://fieldnos.bcss.org.uk/fieldno.php?FieldNo=';
export function bcssHref(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  return BCSS_LOOKUP + encodeURIComponent(raw.trim().replace(/\s+/g, ' '));
}

/* ---------------------------------------------------------------- items ---------------------------------------------------------------- */

/** An item's letter: one or two capitals. */
export const isItemLetter = (v: unknown): v is string => typeof v === 'string' && /^[A-Z]{1,2}$/.test(v);
/** The letters in order: A..Z, AA..ZZ. */
export function itemLetter(i: number): string {
  if (i < 26) return String.fromCharCode(65 + i);
  const j = i - 26;
  return String.fromCharCode(65 + Math.floor(j / 26)) + String.fromCharCode(65 + (j % 26));
}
/** An item's number: the accession's and the letter, "2026-0012/A". */
export const itemNumber = (base: string, letter: string) => `${base}/${letter}`;
/**
 * The next free item of an accession: the first letter whose number has never been given (`taken` reads every number
 * ever given here, removed plants' too, so a letter is never given twice). Null past ZZ.
 */
export function nextItem(base: string, taken: (no: string) => boolean): string | null {
  for (let i = 0; i < ITEM_MAX; i++) {
    const l = itemLetter(i);
    if (!taken(itemNumber(base, l))) return l;
  }
  return null;
}
/** The bare number and letter of an item's number, "2026-0012/A", or null. */
export function splitItemNumber(no: string | null | undefined): { base: string; item: string } | null {
  const m = /^(.+)\/([A-Z]{1,2})$/.exec((no ?? '').trim());
  return m ? { base: m[1], item: m[2] } : null;
}

/**
 * The fields a plant shares with the other plants of its accession: its name and how it is identified, and where it came
 * from. An edit to any of them on one plant of an accession is written to every plant of it in the same commit; an item
 * split off takes them as they stand. Place, status, notes, the cover, the watering rhythm, the price and the deaccession
 * are each plant's own.
 */
export const SHARED_FIELDS = ['taxonName', 'taxonKey', 'cultivar', 'nameKind', 'parentage', 'nameAsReceived', 'fieldNumber', 'provenance', 'acquired', 'sourceFrom', 'sourceRef', 'sourceForm', 'sowingId', 'olderOf', 'olderKind', 'olderKindOf', 'provType', 'propHistory', 'collector', 'collected', 'idLevel', 'idBy', 'idOn', 'exChain', 'clone', 'idHistory'] as const;
export const pickShared = (fields: Record<string, unknown>): Record<string, unknown> => Object.fromEntries(Object.entries(fields).filter(([k]) => (SHARED_FIELDS as readonly string[]).includes(k)));

/* ---------------------------------------------------------------- reading a record ---------------------------------------------------------------- */

/** A text field as read: a string, trimmed, cut at its cap; anything else is not stated. */
export function textOf(v: unknown, max = TEXT_MAX): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}
const oneOf = <T extends string>(v: unknown, words: readonly T[]): T | null => (typeof v === 'string' && (words as readonly string[]).includes(v) ? (v as T) : null);
/**
 * A plant's deaccession reason, or null. A plant whose status is growing is held, whatever reason it still carries: round
 * eighty-six's "Mark growing" sets the status alone and leaves the reason, so a plant marked growing there was listed both
 * as growing and as no longer held (round eighty-seven, the stage 3 fixes; review M3). The stale reason is cleared by the
 * plant's next edit (`Collection.putChanges`).
 */
export const deaccOf = (a: object): DeaccReason | null => ((a as { status?: unknown }).status === 'growing' ? null : oneOf((a as { deacc?: unknown }).deacc, DEACC_REASONS));

/** An "ex" chain as read: a list of earlier holders, the most recent first, each a short text; anything else dropped. */
export function exChainOf(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => textOf(x, 80)).filter((x): x is string => !!x).slice(0, EX_MAX);
}
/** An "ex" chain as typed: "ex Devon, ex Mesa Garden", or the holders between semicolons ("Devon; Mesa Garden"). */
export function readExChain(text: string | null | undefined): string[] {
  const t = (text ?? '').trim();
  if (!t) return [];
  const parts = t.includes(';') ? t.split(';') : t.split(/(?:^|[\s,]+)ex\.?\s+/i);
  return parts.map((p) => p.trim().replace(/^ex\.?\s+/i, '').replace(/[\s,]+$/, '').trim()).filter(Boolean).map((p) => p.slice(0, 80)).slice(0, EX_MAX);
}
/** An "ex" chain as said: "ex Devon, ex Mesa Garden". */
export const exChainText = (chain: string[]): string => chain.map((x) => `ex ${x}`).join(', ');

/** One earlier name of a plant: the name, the day it stopped being the plant's name, and how it had been identified. */
export interface EarlierName {
  name: string;
  until: string;
  idLevel?: IdLevel;
  idBy?: string;
  idOn?: string;
}
/** A plant's identification history as read: the entries that are whole, the oldest first, at most `HISTORY_MAX`. */
export function idHistoryOf(v: unknown): EarlierName[] {
  if (!Array.isArray(v)) return [];
  const out: EarlierName[] = [];
  for (const x of v) {
    if (!x || typeof x !== 'object' || Array.isArray(x)) continue;
    const o = x as Record<string, unknown>;
    const name = textOf(o.name), until = isPartialDate(o.until) ? o.until : null;
    if (!name || !until) continue;
    const e: EarlierName = { name, until };
    const lv = oneOf(o.idLevel, ID_LEVELS), by = textOf(o.idBy), on = isPartialDate(o.idOn) ? o.idOn : null;
    if (lv) e.idLevel = lv;
    if (by) e.idBy = by;
    if (on) e.idOn = on;
    out.push(e);
  }
  return out.slice(-HISTORY_MAX);
}
/**
 * The history after a rename (round eighty-seven; F6): the name the plant had, with the day it stopped and how it had
 * been identified, appended. The log keeps the rename's own line as before; this is the same fact as data, so it goes
 * with the plant into a backup, a sheet and an item split off.
 */
export function withEarlierName(history: unknown, a: { taxonName: string; cultivar?: string | null; idLevel?: unknown; idBy?: unknown; idOn?: unknown }, until: string): EarlierName[] {
  const e: EarlierName = { name: `${a.taxonName}${a.cultivar ? ` '${a.cultivar}'` : ''}`.slice(0, TEXT_MAX), until };
  const lv = oneOf(a.idLevel, ID_LEVELS), by = textOf(a.idBy), on = isPartialDate(a.idOn) ? a.idOn : null;
  if (lv) e.idLevel = lv;
  if (by) e.idBy = by;
  if (on) e.idOn = on;
  return [...idHistoryOf(history), e].slice(-HISTORY_MAX);
}
/**
 * The identification history with the earlier names the plant's own rename lines record and the history does not (round
 * eighty-seven, the stage 3 fixes; review M2): a rename made on round eighty-six wrote its line ("Renamed from Copiapoa
 * cinerea to Copiapoa gigantea (…)") and no history entry. A line is read only when it holds " to " once, so the name
 * before it is the earlier name with no guess; a name already in the history is not added again. The entry is dated by the
 * line's day. `added` is whether any was added.
 */
export function withRenameLines(history: unknown, lines: ReadonlyArray<{ d: string; t: string; note?: unknown }>): { list: EarlierName[]; added: boolean } {
  const have = idHistoryOf(history);
  const names = new Set(have.map((e) => e.name));
  const extra: EarlierName[] = [];
  for (const l of lines) {
    if (l.t !== 'note' || typeof l.note !== 'string' || !l.note.startsWith('Renamed from ') || !isPartialDate(l.d)) continue;
    const rest = l.note.slice('Renamed from '.length);
    const at = rest.indexOf(' to ');
    if (at < 1 || rest.indexOf(' to ', at + 1) >= 0) continue;
    const name = rest.slice(0, at).trim().slice(0, TEXT_MAX);
    if (!name || names.has(name)) continue;
    names.add(name);
    extra.push({ name, until: l.d });
  }
  if (!extra.length) return { list: have, added: false };
  const list = [...have, ...extra].sort((a, b) => a.until.localeCompare(b.until)).slice(-HISTORY_MAX);
  return { list, added: list.some((e) => extra.includes(e)) };
}
/** ITF2 D.5's free text: one entry a verification, "; " between them; within one, the name, then "until" the day, then vlev, vdat and vnam. */
export function vhistText(h: EarlierName[]): string {
  return h.map((e) => [e.name, `until ${e.until}`, e.idLevel ? `vlev ${e.idLevel}` : '', e.idOn ? `vdat ${e.idOn}` : '', e.idBy ? `vnam ${e.idBy}` : ''].filter(Boolean).join(', ')).join('; ');
}
/** The text `vhistText` writes, read back; an entry that is not in its shape is left out. */
export function readVhist(text: string | null | undefined): EarlierName[] {
  const out: EarlierName[] = [];
  for (const part of (text ?? '').split(/;\s*/)) {
    const m = /^(.+?), until (\d{4}(?:-\d{2}){0,2})(?:, vlev (\S+))?(?:, vdat (\d{4}(?:-\d{2}){0,2}))?(?:, vnam (.+))?$/.exec(part.trim());
    if (!m) continue;
    out.push({ name: m[1], until: m[2], ...(m[3] ? { idLevel: m[3] } : {}), ...(m[4] ? { idOn: m[4] } : {}), ...(m[5] ? { idBy: m[5] } : {}) } as EarlierName);
  }
  return idHistoryOf(out);
}

/**
 * ITF2's Identification Qualifier (C.25) and Rank Qualified (C.24) read from the name, where the qualifier lives (round
 * sixty-one): "cf." and "aff." are ITF2's own; "nr." is ITF2's "near"; "vel aff." ("or akin to") is nearest "aff.". Each
 * qualifies the species epithet, rank S. "sp." and "spp." are no qualifier: the plant is named to its genus only, and
 * ITF2 then sends no species epithet. Null for a name with none.
 */
export function idqlOf(taxonName: string): { idql: string; rkql: 'S' } | null {
  const q = parseName(taxonName).qualifier;
  if (q === 'cf.' || q === 'aff.') return { idql: q, rkql: 'S' };
  if (q === 'nr.') return { idql: 'near', rkql: 'S' };
  if (q === 'vel aff.') return { idql: 'aff.', rkql: 'S' };
  return null;
}
/** What a qualifier in a name means, in ITF2's words (C.25, after Stearn). */
export const QUALIFIER_MEANS: Record<string, string> = { 'cf.': 'compare with', 'aff.': 'akin to', 'nr.': 'close to', 'vel aff.': 'or akin to', 'sp.': 'a species not named', 'spp.': 'species not named' };

/** Everything this module reads of a plant, validated: what the page, the sheet and the forms show. */
export interface Identity {
  item: string | null;
  itemOf: string | null;
  deacc: DeaccReason | null;
  deaccOn: string | null;
  deaccNote: string | null;
  provType: ProvType | null;
  /** True when the type is read from the grower's provenance word, not stated. */
  provTypeRead: boolean;
  propHistory: PropHistory | null;
  propHistoryRead: boolean;
  collector: string | null;
  collected: string | null;
  idLevel: IdLevel | null;
  idBy: string | null;
  idOn: string | null;
  exChain: string[];
  clone: string | null;
  idHistory: EarlierName[];
  field: { code: string; no: string } | null;
}
export function identityOf(a: Record<string, unknown>): Identity {
  const pt = oneOf(a.provType, PROV_TYPES), ph = oneOf(a.propHistory, PROP_HISTORIES);
  const ptr = pt ? null : provTypeRead(a.provenance), phr = ph ? null : propHistoryRead(a.provenance);
  return {
    item: isItemLetter(a.item) ? a.item : null,
    itemOf: textOf(a.itemOf, 64),
    deacc: deaccOf(a),
    deaccOn: isPartialDate(a.deaccOn) ? a.deaccOn : null,
    deaccNote: textOf(a.deaccNote, NOTE_MAX),
    provType: pt ?? ptr,
    provTypeRead: !pt && !!ptr,
    propHistory: ph ?? phr,
    propHistoryRead: !ph && !!phr,
    collector: textOf(a.collector),
    collected: isPartialDate(a.collected) ? a.collected : null,
    idLevel: oneOf(a.idLevel, ID_LEVELS),
    idBy: textOf(a.idBy),
    idOn: isPartialDate(a.idOn) ? a.idOn : null,
    exChain: exChainOf(a.exChain),
    clone: textOf(a.clone, 80),
    idHistory: idHistoryOf(a.idHistory),
    field: parseFieldNumber(a.fieldNumber)
  };
}

/* ---------------------------------------------------------------- the sheet ---------------------------------------------------------------- */

/**
 * The plants sheet's columns for these fields (round eighty-seven; F2), named as ITF2 names its fields where it has one,
 * so a garden's system reads them: accsta, prot, prohis, cnam, cid, cdat, idql, rkql, vlev, vnam, vdat, vhist. The rest
 * have no ITF2 field and are named in words. Dates in ITF2 columns are in ITF2's syntax (YYYYMMDD, YYYYMM, YYYY); the
 * others are YYYY-MM-DD as the rest of the sheet.
 */
export const SHEET_COLUMNS = ['item of', 'accsta', 'no longer held', 'no longer held on', 'no longer held note', 'prot', 'prohis', 'cnam', 'cid', 'field code', 'cdat', 'idql', 'rkql', 'vlev', 'vnam', 'vdat', 'vhist', 'ex', 'clone'] as const;
export function sheetCells(a: Record<string, unknown> & { taxonName: string }, baseNumber: string | null): Array<string | null> {
  const x = identityOf(a);
  const q = idqlOf(a.taxonName);
  const fieldNo = textOf(a.fieldNumber, TEXT_MAX);
  return [
    x.itemOf ? baseNumber : null,
    accsta(a),
    x.deacc ? DEACC_LABEL[x.deacc].toLowerCase() : null,
    x.deaccOn,
    x.deaccNote,
    x.provType,
    x.propHistory,
    x.collector,
    // ITF2's cid is the collector's own number for the collection; the field number is that, with the collector's code
    // before it, which ITF2 has no field for: the number alone where the code is read, else the text as typed.
    x.field ? x.field.no : fieldNo,
    x.field?.code ?? null,
    itf2Date(x.collected),
    q?.idql ?? null,
    q?.rkql ?? null,
    x.idLevel,
    x.idLevel && x.idLevel !== 'U' && x.idLevel !== '0' ? x.idBy : null, // ITF2 D.2: no verifier for U or 0
    x.idLevel && x.idLevel !== 'U' && x.idLevel !== '0' ? itf2Date(x.idOn) : null,
    x.idHistory.length ? vhistText(x.idHistory) : null,
    x.exChain.length ? exChainText(x.exChain) : null,
    x.clone
  ];
}

/** The fields an import may fill from these columns, as stored. */
export type IdentFields = Partial<{ provType: ProvType; propHistory: PropHistory; collector: string; collected: string; idLevel: IdLevel; idBy: string; idOn: string; idHistory: EarlierName[]; exChain: string[]; clone: string; deacc: DeaccReason; deaccOn: string; deaccNote: string }>;
/** The sheet's text for each, by the import's field name. */
export type IdentCells = Partial<Record<'provType' | 'propHistory' | 'collector' | 'collected' | 'idLevel' | 'idBy' | 'idOn' | 'idHistory' | 'exChain' | 'clone' | 'deacc' | 'deaccOn' | 'deaccNote', string>>;
/**
 * A sheet line's cells for these fields, read (round eighty-seven): each value checked as the forms check it. A value
 * that cannot be read is left out and said, and its text goes in the notes (`kept`), as the import does with every
 * column it cannot read; never guessed, never dropped.
 */
export function readIdentCells(c: IdentCells, provenance: unknown): { fields: IdentFields; problems: string[]; kept: string[] } {
  const fields: IdentFields = {}, problems: string[] = [], kept: string[] = [];
  const bad = (label: string, text: string, why: string) => { problems.push(`${label} "${text}" ${why}; kept in the notes`); kept.push(`${label}: ${text}`); };
  const t = (k: keyof IdentCells) => (c[k] ?? '').trim();
  const word = <T extends string>(k: keyof IdentCells, words: readonly T[], label: string): T | null => {
    const v = t(k);
    if (!v) return null;
    const up = v.toUpperCase();
    if ((words as readonly string[]).includes(up)) return up as T;
    bad(label, v, `is not one of ITF2's codes (${words.join(', ')})`);
    return null;
  };
  const pt = word('provType', PROV_TYPES, 'Provenance type');
  const ph = word('propHistory', PROP_HISTORIES, 'Propagation history');
  const clash = itf2Problem(provenance, pt, ph);
  if (clash) { problems.push(`${clash}; the ITF2 codes are kept in the notes`); kept.push(`ITF2 codes: ${[pt, ph].filter(Boolean).join(' ')}`); }
  else { if (pt) fields.provType = pt; if (ph) fields.propHistory = ph; }
  const lv = word('idLevel', ID_LEVELS, 'Verification level');
  if (lv) fields.idLevel = lv;
  for (const [k, label] of [['collector', 'Collector'], ['idBy', 'Identified by'], ['clone', 'Clone']] as const) {
    const v = t(k);
    if (!v) continue;
    if (v.length > (k === 'clone' ? 80 : TEXT_MAX)) bad(label, v, 'is too long to keep in its field');
    else fields[k] = v;
  }
  for (const [k, label] of [['collected', 'Collected'], ['idOn', 'Identified on'], ['deaccOn', 'No longer held on']] as const) {
    const v = t(k);
    if (!v) continue;
    const d = readPartialDate(v);
    if (d) fields[k] = d;
    else bad(label, v, 'is not a day, a month or a year (2019-03-07, 2019-03, 2019, or 20190307)');
  }
  const ex = t('exChain');
  if (ex) fields.exChain = readExChain(ex);
  const vh = t('idHistory');
  if (vh) {
    const h = readVhist(vh);
    if (h.length) fields.idHistory = h;
    else bad('Earlier names', vh, 'were not read');
  }
  const why = t('deacc');
  if (why) {
    const w = why.toLowerCase();
    const r = DEACC_REASONS.find((x) => x === w || DEACC_LABEL[x].toLowerCase() === w);
    if (r) fields.deacc = r;
    else bad('No longer held', why, `is not one of: ${DEACC_REASONS.map((x) => DEACC_LABEL[x].toLowerCase()).join(', ')}`);
  }
  const note = (c.deaccNote ?? '').trim();
  if (note) fields.deaccNote = note.slice(0, NOTE_MAX);
  return { fields, problems, kept };
}
