/**
 * What a species page says of itself to a search engine and a link preview, and the credit lines for photographs shown
 * outside a species page. Pure functions, so the rules are tested apart from the page (round sixty; X).
 *
 * The head: with a climate, the title names what only this page has and the description is the page's own figures, each
 * with its source; without one, a true list of what the page holds. Never the uncredited Wikipedia lead, which a search
 * engine already has from Wikipedia, and never "the cultivation it suggests", which the sheet does not give (the
 * self-review's 14, the round forty-two review A5, product 6).
 */
import { clip } from '$core/text';
import { aLabel } from '$core/arch';
import { licenceLabel, licenceTag, type LicenceTag } from '$core/licence';
import { splitCommonsCredit } from '$dossier/photo-credit';
import { temp, rain, METRIC, type Units } from '$core/units';
import { yearRain } from '$climate/year-rain';

/**
 * The link-preview image's alt, on the front page and on a species page with no photograph: the words `static/app/og.png`
 * shows, as it shows them. The alt once described a wider line than the image holds, and the species page's fallback
 * a narrower one (round sixty-two; the words review's 2, outside review A2). The image is drawn by scripts/dev/og.mjs from
 * scripts/dev/og.html (round sixty-three); change the two together.
 */
export const OG_ALT = 'Cultifolio, species reference. The plants people grow, each with its habitat climate where its records allow one. Every figure names its source. Your own plants stay on your device, or sync encrypted. cultifolio.com, no sign-up, free and open source.';

type M = { tmax: number; tmin: number; precipMm: number; dli?: number };
export interface HeadInput {
  name: { scientific: string; family?: string | null };
  common?: string | null;
  climate: { status: string; months?: M[]; records?: number; extremes?: { minP01: number; years: number } | null; annualRain?: { p50?: number | null } | null };
  native: number;
  photos: number;
  summary: boolean;
}

/** A common name worth adding: not the genus again (Welwitschia's English name is "Welwitschia"). */
const commonOf = (h: HeadInput) => (h.common && h.common.toLowerCase() !== h.name.scientific.split(' ')[0].toLowerCase() ? h.common : null);

export function speciesTitle(h: HeadInput): string {
  const c = commonOf(h);
  const nm = `${h.name.scientific}${c ? ` (${c})` : ''}`;
  if (h.climate.status !== 'ok' || !h.climate.months?.length) return nm;
  const light = h.climate.months.some((x) => x.dli != null);
  // Cold nights only with the daily extremes, whose 1st-percentile night the page leads with; a month's mean night is not
  // one. The parts joined with "and", so a title without light is not a list missing its last word (round sixty-one; visitor 13).
  return `${nm}: ${and(['habitat rain', h.climate.extremes ? 'cold nights' : '', light ? 'light' : ''].filter(Boolean))}`;
}

function and(xs: string[]): string {
  return xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

/**
 * A source's detail as a sentence of its own: capitalised, with its full stop, and with its article when the detail
 * begins by naming the source ("occurrence source did not answer" read "Occurrence source did not answer."), and when
 * it says a source did not answer, when (round sixty-one; visitor 16). A fixed rule over the dossier's string.
 */
export function detailSentence(t: string | null | undefined, fallback: string): string {
  let x = (t ?? '').trim() || fallback.trim();
  if (/^[a-z][\w-]* source\b/.test(x)) x = `the ${x}`;
  if (/(did not answer|refused the request)$/.test(x.replace(/\.$/, ''))) x = `${x.replace(/\.$/, '')} when this page was built`;
  const y = x.charAt(0).toUpperCase() + x.slice(1);
  return /[.!?]$/.test(y) ? y : `${y}.`;
}

/** The meta description, at most 155 characters, cut at a word by `clip`. */
export function speciesDescription(h: HeadInput, u: Units = METRIC): string {
  const c = h.climate;
  if (c.status === 'ok' && c.months?.length === 12) {
    const m = c.months;
    const yr = yearRain(m, c.annualRain); // the median of the cells' own years when the dossier has it (round sixty-three)
    const cold = m.reduce((b, x, i) => (x.tmin < m[b].tmin ? i : b), 0);
    const dl = m.map((x) => x.dli).filter((x): x is number => x != null);
    // The habitat, never "in the wild": the floor is one reanalysis cell at a typical spot, and a link preview unfurls this
    // line (round sixty-two; outside review A3). Each figure by its own name; whole parts are left off the end when the line
    // would pass 155 characters, so no figure is cut from its source.
    const night = c.extremes ? `cold floor ${temp(c.extremes.minP01, u, 1)}, 1 night in 100 at a typical spot (NASA POWER)` : `coldest month, mean nightly low ${temp(m[cold].tmin, u, 1)} (CHELSA)`;
    // The monthly medians added are the median year's total, and said so (round sixty-seven; triage-66 N11).
    const wet = yr.cells ? `${rain(yr.mm, u)} of rain a year (median across the range, CHELSA)` : `${rain(yr.mm, u)} of rain in the median year (CHELSA)`;
    const light = dl.length ? `${Math.round(Math.min(...dl))}–${Math.round(Math.max(...dl))} DLI open-sky light (CHELSA)` : '';
    const n = c.records ?? 0;
    const parts = [night, wet, light, `from ${n.toLocaleString('en-US')} in-range record${n === 1 ? '' : 's'}`].filter(Boolean);
    const line = (k: number) => `${h.name.scientific} habitat: ${parts.slice(0, k).join('; ')}.`;
    let k = parts.length;
    while (k > 1 && line(k).length > 155) k--;
    return clip(line(k), 155);
  }
  const has = [h.native ? 'native range' : '', h.photos ? 'photographs' : '', h.summary ? 'a quoted, credited Wikipedia summary' : ''].filter(Boolean);
  // `unchecked`: a page without a GBIF key, whose records were not asked (round seventy-nine; `$core/no-gbif`).
  const state = c.status === 'pending' ? 'habitat climate pending' : c.status === 'refused' || c.status === 'unchecked' ? 'habitat climate not checked' : '';
  const lead = `${h.name.scientific}${h.name.family ? `, ${h.name.family}` : ''}`;
  const body = has.length ? `${and(has)}, ${has.length === 1 ? 'with its source' : 'each with its source'}` : 'names and registers, each with its source';
  return clip(`${lead}: ${body}${state ? `; ${state}` : ''}.`, 155);
}

/** The photograph host's name, for a tile that carries only a thumbnail address: its source, when nothing more is known. */
export function photoSource(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^https:\/\/(?:inaturalist-open-data\.s3\.amazonaws\.com|static\.inaturalist\.org)\//.test(url)) return 'iNaturalist';
  if (/^https:\/\/upload\.wikimedia\.org\//.test(url)) return 'Wikimedia Commons';
  if (/^https:\/\/api\.gbif\.org\//.test(url)) return 'GBIF';
  return null;
}

/** A licence named inside an author's line: "(CC BY)", "CC-BY-SA 4.0", "CC0", "public domain". */
const NAMED_LICENCE = /\b(?:cc[\s-]?0|cc[\s-]by(?:[\s-](?:sa|nc|nd))*|public domain)\b/gi;

/**
 * A photograph's credit, as the species page's gallery, compare and the hero word it: the author's line, its licence
 * named once. When the author's line names a licence other than the one the source tags it with, the credit says the
 * two disagree, rather than printing "(CC BY) · CC0" as if both held (round sixty-two; outside review A35).
 */
export function photoCredit(p: { attribution: string; licence?: LicenceTag | null }): string {
  const c = creditParts(p);
  return !c.lic || (c.named && !c.disagree) ? c.who : c.disagree ? `${c.who} · the source tags it ${c.lic}: the two licences disagree` : `${c.who} · ${c.lic}`;
}

/** The parts of a credit: the source's licence, the author's line, whether that line names a licence, and whether it names another. */
/**
 * The author's line with the licence words taken out, for a credit that names the licence beside it (round eighty-four;
 * W2, A13: the hero's credit read "CC BY · (c) Oleksandr Shynder, some rights reserved (CC BY)", the licence twice). Only
 * the words that say the licence go: "some rights reserved", "(CC BY)", ", CC BY-SA 4.0,"; the author, the "(c)" and
 * "via GBIF" stay. A line that is nothing but a licence is left whole.
 */
export function withoutLicence(who: string): string {
  const out = who
    .replace(/,?\s*(?:some|no|all) rights reserved/gi, '')
    .replace(/\s*\(\s*(?:cc[\s-]?0|cc[\s-]by(?:[\s-](?:sa|nc|nd))*(?:\s[\d.]+)?|public domain)\s*\)/gi, '')
    .replace(/,\s*(?:cc[\s-]?0|cc[\s-]by(?:[\s-](?:sa|nc|nd))*(?:\s[\d.]+)?|public domain)(?=\s*(?:,|$))/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return out && out !== '(c)' ? out : who;
}

export function creditParts(p: { attribution: string; licence?: LicenceTag | null }): { lic: string; who: string; named: boolean; disagree: boolean; whoAlone: string } {
  const lic = p.licence ? licenceLabel(p.licence) : '';
  const who = shownAttribution(p); // "author not stated" where the line names no one (round eighty-two)
  // Spaces made hyphens before tagging: `licenceTag` reads "by-sa" and "by-nc", and "CC BY SA" with spaces was read as
  // CC BY, so an author's line agreeing with the source was said to disagree (round sixty-two; the words review's 4).
  const named = [...who.matchAll(NAMED_LICENCE)].map((x) => licenceTag(x[0].replace(/^cc[\s-]?0$/i, 'cc0').replace(/^(cc[\s-].*)$/i, (t) => t.replace(/[\s_]+/g, '-'))));
  // The author's line without its licence words, where the licence is said beside it and agrees (round eighty-four).
  const whoAlone = lic && named.length && !named.some((t) => t !== p.licence) ? withoutLicence(who) : who;
  return { lic, who, named: named.length > 0, disagree: !!lic && named.some((t) => t !== p.licence), whoAlone };
}

/**
 * A credit's words for a photograph whose source names no author (round eighty-two; the independent reviews' 26 and 1):
 * "author not stated", never the licence alone. iNaturalist's CC0 line is "no rights reserved", with no name; a line
 * that is only a licence, or starts with its comma, names no one either. The fill gives iNaturalist's CC0 photographs
 * their observer (`cc0Credit`); a Commons or GBIF file with no author keeps these words.
 */
export const AUTHOR_NOT_STATED = 'author not stated';
const LICENCE_ONLY = /^(?:cc[\s-]?0|public domain|pd|cc[\s-]by(?:[\s-]sa)?(?:\s[\d.]+)?)$/i;
export function shownAttribution(p: { attribution: string }): string {
  const a = p.attribution.trim();
  if (!a || LICENCE_ONLY.test(a)) return `${AUTHOR_NOT_STATED}${a ? `, ${a}` : ''}`;
  if (/^(?:\(c\)\s*)?,?\s*no rights reserved(?:\s*\((?:cc0)\))?$/i.test(a)) return `${AUTHOR_NOT_STATED}, no rights reserved`;
  if (/^,/.test(a)) return `${AUTHOR_NOT_STATED}${a}`;
  return a;
}

/** A tile's credit line: the author and licence where the tile has them, else the source it came from, else nothing. */
export function tileCredit(t: { credit?: string | null; thumb?: string | null }): string | null {
  // The index's credit, licence first (`tileCreditOf`; round sixty-three). One that is a licence alone, as an index built
  // before round eighty-two wrote for iNaturalist's CC0 line, says that no author is stated (round eighty-two).
  if (t.credit?.trim()) return `Photo: ${t.credit.trim()}${t.credit.includes(',') ? '' : `, ${AUTHOR_NOT_STATED}`}`;
  const s = photoSource(t.thumb);
  return s ? `Photo: ${s}` : null;
}

/** An author's name in a tile's credit is cut past this many characters, at a word, so the index stays small. */
export const TILE_AUTHOR_MAX = 40;
/** The source's own words around the author in a credit line, which a tile has no room for: the species page keeps them. */
const INAT_LINE = /^(?:\(c\)|©)?\s*(.+?),\s*(?:some|no) rights reserved(?:\s*\(([^)]*)\))?$/i;
const VIA_LINE = /^(.+?),\s*([^,]+?),\s*(?:iNaturalist via GBIF|via GBIF|via Wikimedia Commons)$/;

/**
 * A licence as a credit line words it, tagged: spaces made hyphens as `creditParts` does, and Commons' "Public domain"
 * and "PD-…" as public domain, never CC0, which the tile and the hero once called them (round sixty-nine; triage-68 K3).
 */
const lineTag = (t: string) => licenceTag(t.trim().replace(/^(?:Public domain|PD\b.*)$/i, 'public domain').replace(/^(cc[\s-].*)$/i, (x) => x.replace(/[\s_]+/g, '-')));

/**
 * The credit a tile gives the index's thumbnail, as the index carries it: the licence, then the author, in the species
 * page's words for that photograph (`creditParts`) with the source's own wording around the author left off ("(c) …,
 * some rights reserved (CC BY)" is "CC BY, …"). Licence first, as the species page's hero gives it, because a tile's one
 * line is cut at its end on a phone and the licence must survive the cut. Null, so the tile names the source instead,
 * when the line cannot be said short and true: no licence, an author's line naming another licence than the source's,
 * or a line in no form the build writes (round sixty-three; REVIEW-TRIAGE-61's deferred list).
 */
export function tileCreditOf(p: { attribution: string; licence?: LicenceTag | null } | null | undefined): string | null {
  if (!p) return null;
  const c = creditParts(p);
  if (!c.lic || c.disagree || c.lic === 'restricted' || c.lic === 'licence not stated') return null;
  // A Commons line is split where its licence reads strictly, since a version list ("CC BY-SA 2.5,2.0,1.0") holds commas (round sixty-nine).
  // iNaturalist's CC0 line names no one ("no rights reserved"): the licence alone is the credit, as the species page gives
  // it (round seventy-one; S-F6: 807 tiles, Geissorhiza aspera's on the front page, said "Photo: iNaturalist").
  // Since round eighty-two the tile says so: "CC0, author not stated", never the licence alone (the reviews' 26 and 1).
  if (p.licence === 'cc0' && /^no rights reserved$/i.test(p.attribution.trim())) return `${c.lic}, ${AUTHOR_NOT_STATED}`;
  const raw = p.attribution.trim(); // the source's own line, not the page's "author not stated" words (round eighty-two)
  const cm = splitCommonsCredit(raw);
  const m = cm ? [raw, cm.author, cm.short] : INAT_LINE.exec(raw) ?? VIA_LINE.exec(raw);
  // The licence the line names must be the source's own; "author not stated" is said as that, under CC0 or public domain only (the build drops it otherwise).
  if (!m || (m[2] && lineTag(m[2]) !== p.licence)) return null;
  let who = m[1].trim();
  if (!who) return null;
  if (who.length > TILE_AUTHOR_MAX) who = `${who.slice(0, TILE_AUTHOR_MAX).replace(/[\s,;]+\S*$/, '')}…`;
  return `${c.lic}, ${who}`;
}

/**
 * The header's group, said as the archetype table's listing it is (round seventy-one; S-F7): "· cactus or succulent"
 * under Euphorbia peplus, a weedy annual, and Pseudobombax calcicola, which Kew calls a tree, read as what the plant is.
 * The tier says how it was listed: by name, by its genus or by its family.
 */
export function groupLine(arch: { arch: { lab: string }; tier: 'species' | 'genus' | 'family' }): string {
  return `listed ${arch.tier === 'species' ? 'by name' : `by its ${arch.tier}`} as ${aLabel(arch.arch.lab)}`;
}

/**
 * The evidence line when no georeferenced record lies inside the stated range (round seventy-one; S-F4): with records
 * outside it, the count and that the range and the records disagree. Ixora coccinea's 1,749 records and Ceropegia
 * penduliflora's 49 read "No georeferenced records inside the stated native range." and nothing more.
 */
export function noneInRange(outside: number | null | undefined): { tone: 'warn' | 'muted'; text: string } {
  return outside
    ? { tone: 'warn', text: `No georeferenced record lies inside the stated native range, and ${outside === 1 ? 'the one georeferenced record read lies' : `all ${outside} georeferenced records read lie`} outside it: the range and the records disagree. They are not used, and no map marker or climate is derived from them.` }
    : { tone: 'muted', text: 'No georeferenced records inside the stated native range.' };
}

/**
 * Why the name's author is not GBIF's, for a species on a homonym key (round seventy-one; agent B's need, S-B2): the
 * record of the backbone row says the name is cited as Kew accepts it, and the page says so under the name. Null otherwise.
 */
export function kewCitedNote(upstream: Record<string, { detail?: string } | undefined>, name?: { scientific: string; authorship?: string; cited?: { gbif: string; kew: string } }): string | null {
  // The structured field first (round seventy-two, A; F13): the backbone's citation, and Kew's, which the page shows.
  if (name?.cited) return `GBIF's backbone cites this name as ${name.scientific}${name.cited.gbif.trim() ? ` ${name.cited.gbif.trim()}` : ', with no author'}; the page cites it as Kew's World Checklist cites the entry it links.`;
  // A dossier built before: its record's sentence.
  const d = upstream['gbif.species']?.detail?.trim();
  if (!d || !/is cited as Kew (?:accepts|cites) it/.test(d)) return null;
  return /[.!?]$/.test(d) ? d : `${d}.`;
}
