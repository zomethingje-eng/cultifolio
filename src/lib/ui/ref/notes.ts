/**
 * The species page's notes under the name, beside the range and among the older names, read from the dossier's
 * structured fields (round seventy-two; triage F13, A2): `name.cited` (A's Kew fill and build), `distribution.via` (B's)
 * and `name.kew` (A's Kew fill). Until a dossier carries them, the notes read the sentences the builder wrote before, so a
 * corpus built before the fields reads as it did. A field that is absent is "not read", never "none": no note claims what
 * an unfilled dossier does not say.
 */
import { kewCitedNote } from '$lib/ui/ref/head';
import { canonicalSynonym } from '$core/names';

/** `name.cited`: the page cites Kew's author rather than the backbone's. */
export type Cited = { gbif: string; kew: string };
/** `distribution.via`: which Kew entry's range the page shows, and how it was reached. */
export type Via = { kind: 'own' | 'older-name' | 'synonym-of' | 'kew-entry' | 'spelling'; entry: string; page?: string; unplaced?: boolean };
/** `name.kew`: Kew's reading of the page's entry, from Kew's files. */
export type KewNames = { entry: string; synonyms: string[]; acceptedElsewhere: string[]; file: string };

type NameLike = { scientific: string; authorship?: string | null; synonyms?: string[]; cited?: Cited | null; kew?: KewNames | null };
type DistLike = { native: unknown[]; source: string; via?: Via | null };

/**
 * The note under the name when the page cites Kew's author: from `name.cited`, else the record's sentence (`kewCitedNote`,
 * the backbone row's "is cited as Kew accepts it"), else none.
 */
export function citedNote(name: NameLike, upstream: Record<string, { detail?: string } | undefined>): string | null {
  const c = name.cited;
  if (c && typeof c.gbif === 'string') {
    const cited = `${name.scientific}${name.authorship ? ` ${name.authorship}` : ''}`;
    const line = `Cited as Kew's World Checklist cites it, ${cited}: GBIF's backbone key for this page carries the name with another author${c.gbif.trim() ? `, ${c.gbif.trim()}` : ''}`;
    return /[.!?]$/.test(line) ? line : `${line}.`;
  }
  return kewCitedNote(upstream);
}

/** What the habitat's "Range source" line says: the line itself and the fixed clause after it, or null for no line. */
export type RangeNote = { text: string; clause: string | null; page: string | null };

const OLD_REACHED = /under the name |, reached by /;
const OLD_SYNONYM = /\bKew holds .+ as a synonym of /;

/**
 * The habitat's range note: from `distribution.via` when the dossier carries it, else from the range source's sentence
 * as before (round sixty-eight: an entry reached by an older name; round seventy-one: an entry Kew holds the name as a
 * synonym of, until now shown only in the record of sources, triage B3). Nothing when the range is the page's own entry.
 */
export function rangeNote(dist: DistLike, name: { scientific: string }): RangeNote | null {
  if (!dist.native.length) return null;
  const v = dist.via;
  if (v && typeof v.kind === 'string') {
    const page = v.page ? String(v.page) : null;
    switch (v.kind) {
      case 'own':
        // An Unplaced name's own range (B8, Aphelandra squarrosa): said beside the map, not only in the record.
        return v.unplaced ? { text: `Kew's entry ${v.entry}`, clause: 'Kew holds this name as unplaced, not placed under an accepted species; the range is the one Kew gives the name', page } : null;
      case 'older-name':
        return { text: `Kew's entry ${v.entry}`, clause: `Kew holds no entry of ${name.scientific} by its author; the range is that of the one Kew entry this species' older names lead to`, page };
      case 'synonym-of':
        return { text: `Kew's entry ${v.entry}`, clause: `Kew holds ${name.scientific} as a synonym of ${v.entry}; the range is that entry's`, page };
      case 'kew-entry':
        return { text: `Kew's entry ${v.entry}`, clause: `the range is that of Kew's entry of these words by another author than the one this page cites`, page };
      case 'spelling':
        return { text: `Kew's entry ${v.entry}`, clause: `Kew spells this name otherwise, by the same author; the range is that entry's`, page };
      default:
        return null;
    }
  }
  if (OLD_REACHED.test(dist.source)) return { text: dist.source, clause: "Kew holds no entry of this page's name by its author; the range is the one Kew entry the species' older names lead to, reached by the older name named here, whose author agrees with Kew's", page: null };
  if (OLD_SYNONYM.test(dist.source)) return { text: dist.source, clause: null, page: null };
  return null;
}

/**
 * The record's older names split by Kew's reading (triage A2): those Kew accepts as species of their own, said apart,
 * and the rest. `kewRead` is false when the dossier has no `name.kew`: then every name stays where it was, and nothing
 * is said of Kew.
 */
export function olderNames(names: string[], name: NameLike): { older: string[]; kewAccepts: string[]; kewRead: boolean } {
  const k = name.kew;
  if (!k || !Array.isArray(k.acceptedElsewhere)) return { older: names, kewAccepts: [], kewRead: false };
  const apart = new Set(k.acceptedElsewhere.map((x) => (canonicalSynonym(x) ?? x).toLowerCase()));
  return { older: names.filter((x) => !apart.has(x.toLowerCase())), kewAccepts: names.filter((x) => apart.has(x.toLowerCase())), kewRead: true };
}

const key = (t: string) => t.replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
const INFRA = /^(subsp|ssp|var|subvar|f|fo|forma|nothosubsp|nothovar)\.?$/;

/**
 * Why a summary quoted under another title is this species' article, when the reason is that the title is one of its
 * older names (triage F6: 51 of 270 such summaries, Callianthe megapotamica's "Abutilon megapotamicum" among them, were
 * kept by that rule and named no proof). The rule is `summaryTitleFits` (sources/wikipedia.ts), read here without the
 * build's network code; a test pins the two together. Null when the title is the page's name or is not an older name.
 */
export function summaryOlderName(title: string, name: { scientific: string; synonyms?: string[] }): string | null {
  const t = key(title);
  if (t === key(name.scientific)) return null;
  const hit = (name.synonyms ?? []).some((s) => {
    const w = s.replace(/×\s*/g, '').split(/\s+/);
    if (INFRA.test(w[2] ?? '')) return false;
    return key(w.slice(0, 2).join(' ')) === t;
  });
  return hit ? 'its title is one of this species\' older names (GBIF Backbone), which is the proof that the article is this species\'' : null;
}

/**
 * The genus a missing species' address names, for the 404's line about the genus, or null when the address is not shaped
 * as a name (round seventy-two; triage F12: `/species/not-a-plant-zzz` said "The reference has no Not"). A name is a
 * genus and an epithet, with at most a rank and its epithet after them (`nameFromSlug`'s "var.", "subsp.", "f."); the
 * genus is letters alone, three or more.
 */
export function addressGenus(asked: string): string | null {
  const w = asked.trim().split(/\s+/).filter(Boolean);
  const epithet = (x: string | undefined) => !!x && /^[a-z][a-z-]+$/.test(x) && !/^(var|subsp|ssp|fo?)$/.test(x);
  // A rank's epithet may be more than one word: a hyphen in a slug is a space here (`copiapoa-cinerea-var-columna-alba`).
  const shaped = w.length === 2 ? epithet(w[1]) : w.length === 3 ? epithet(w[1]) && epithet(w[2]) : w.length >= 4 && w.length <= 6 ? epithet(w[1]) && /^(var|subsp|ssp|fo?)\.$/.test(w[2]) && w.slice(3).every(epithet) : false;
  return shaped && /^[A-Z][a-z]{2,}$/.test(w[0]) ? w[0] : null;
}
