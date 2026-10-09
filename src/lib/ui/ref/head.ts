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
import { licenceLabel, licenceTag, type LicenceTag } from '$core/licence';
import { temp, rain, METRIC, type Units } from '$core/units';

/**
 * The link-preview image's alt, on the front page and on a species page with no photograph: the words `static/og.png`
 * shows, as it shows them. The alt once described a wider line than the image holds, and the species page's fallback
 * a narrower one (round sixty-two; the words review's 2, outside review A2). When the image is redrawn with the list's
 * whole reach, this line changes with it.
 */
export const OG_ALT = 'Cultifolio. A reference for growers of cacti, succulents and bulbs, every figure with its source. Your own plants stay on your device, or sync encrypted. cultifolio.com, no account, open source.';

type M = { tmax: number; tmin: number; precipMm: number; dli?: number };
export interface HeadInput {
  name: { scientific: string; family?: string | null };
  common?: string | null;
  climate: { status: string; months?: M[]; records?: number; extremes?: { minP01: number; years: number } | null };
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
    const yr = m.reduce((a, x) => a + x.precipMm, 0);
    const cold = m.reduce((b, x, i) => (x.tmin < m[b].tmin ? i : b), 0);
    const dl = m.map((x) => x.dli).filter((x): x is number => x != null);
    // The habitat, never "in the wild": the floor is one reanalysis cell at a typical spot, and a link preview unfurls this
    // line (round sixty-two; outside review A3). Each figure by its own name; whole parts are left off the end when the line
    // would pass 155 characters, so no figure is cut from its source.
    const night = c.extremes ? `cold floor ${temp(c.extremes.minP01, u, 1)}, 1 night in 100 at a typical spot (NASA POWER)` : `coldest month, mean nightly low ${temp(m[cold].tmin, u, 1)} (CHELSA)`;
    const wet = `${rain(yr, u)} of rain a year (sum of monthly medians, CHELSA)`;
    const light = dl.length ? `${Math.round(Math.min(...dl))}–${Math.round(Math.max(...dl))} DLI open-sky light (CHELSA)` : '';
    const n = c.records ?? 0;
    const parts = [night, wet, light, `from ${n.toLocaleString('en-US')} in-range record${n === 1 ? '' : 's'}`].filter(Boolean);
    const line = (k: number) => `${h.name.scientific} habitat: ${parts.slice(0, k).join('; ')}.`;
    let k = parts.length;
    while (k > 1 && line(k).length > 155) k--;
    return clip(line(k), 155);
  }
  const has = [h.native ? 'native range' : '', h.photos ? 'photographs' : '', h.summary ? 'a quoted, credited Wikipedia summary' : ''].filter(Boolean);
  const state = c.status === 'pending' ? 'habitat climate pending' : c.status === 'refused' ? 'habitat climate not checked' : '';
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
export function creditParts(p: { attribution: string; licence?: LicenceTag | null }): { lic: string; who: string; named: boolean; disagree: boolean } {
  const lic = p.licence ? licenceLabel(p.licence) : '';
  const who = p.attribution.trim();
  // Spaces made hyphens before tagging: `licenceTag` reads "by-sa" and "by-nc", and "CC BY SA" with spaces was read as
  // CC BY, so an author's line agreeing with the source was said to disagree (round sixty-two; the words review's 4).
  const named = [...who.matchAll(NAMED_LICENCE)].map((x) => licenceTag(x[0].replace(/^cc[\s-]?0$/i, 'cc0').replace(/^(cc[\s-].*)$/i, (t) => t.replace(/[\s_]+/g, '-'))));
  return { lic, who, named: named.length > 0, disagree: !!lic && named.some((t) => t !== p.licence) };
}

/** A tile's credit line: the author and licence where the tile has them, else the source it came from, else nothing. */
export function tileCredit(t: { credit?: string | null; thumb?: string | null }): string | null {
  if (t.credit?.trim()) return t.credit.trim();
  const s = photoSource(t.thumb);
  return s ? `Photo: ${s}` : null;
}
