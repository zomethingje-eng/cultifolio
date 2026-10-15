/**
 * The names that are a species' own, for iNaturalist and for Commons (round seventy, second pass; REVIEW-TRIAGE-69 B7,
 * R47-8). One rule, read by `sources/inat.ts` (the build and `--fill inat-ids`) and by Commons' title rule (`photo-kind.ts`,
 * C's), so the two cannot disagree:
 *   - the accepted name;
 *   - its older names with the same type (`gbif.sameTypeNames`), where they are known;
 *   - every other name GBIF holds as a synonym of this species, at any rank, unless GBIF marks it pro parte or a species
 *     of this reference holds it as its own accepted name.
 * The third is the replacement-name case: Bruyns renamed Stapelia hirsuta L. Ceropegia pulvinata, and Orbea variegata
 * (L.) Haw. Ceropegia mixta, when he moved them to Ceropegia, because "hirsuta" and "variegata" were taken there. GBIF
 * holds the old names as synonyms of the new, on another type than the new names' basionyms, and iNaturalist and Commons
 * file the plants under them; round sixty-nine's same-type rule left both pages without a photograph. A synonym that is
 * another species of this reference (Pinguicula antarctica, a synonym of P. chilensis at GBIF and a page of its own here)
 * is never the species' own.
 *
 * Names are compared as GBIF's canonical names, without authors or rank words, in lower case: iNaturalist's "Stapelia
 * hirsuta hirsuta" is GBIF's canonical "Stapelia hirsuta hirsuta" (var. hirsuta).
 */

import { spellingKey } from './epithet';

/** A synonym as the build reads it from GBIF (`SynonymRow`), or as a dossier stores it (its scientific name). */
export type SynonymLike = string | { name: string; key?: number; rank?: string; status?: string; basionymKey?: number };

/** Words that begin an author, not an epithet: "Aus bus de Wild.", "Aus bus ex Steud.". */
const PARTICLE = new Set(['ex', 'et', 'de', 'des', 'du', 'da', 'del', 'della', 'di', 'van', 'von', 'der', 'den', 'le', 'la', 'f']);
const RANK = /^(subsp\.|ssp\.|var\.|f\.|fo\.|forma|subvar\.|nothosubsp\.|nothovar\.)$/i;

/**
 * A scientific name's canonical form: the genus, the epithet and an infraspecific epithet, without authors or rank words
 * ("Stapelia hirsuta var. affinis (N.E.Br.) N.E.Br." is "Stapelia hirsuta affinis"); null when it does not start as a
 * name ("? bisulca Haw.").
 */
export function canonicalOf(scientificName: string): string | null {
  const w = scientificName.replace(/×\s*/g, '').trim().split(/\s+/);
  if (!/^[A-Z][a-zë-]+$/.test(w[0] ?? '') || !/^[a-zë-]+$/.test(w[1] ?? '')) return null;
  const out = [w[0], w[1]];
  if (w[2] && RANK.test(w[2]) && /^[a-zë-]+$/.test(w[3] ?? '')) out.push(w[3]);
  else if (w[2] && /^[a-zë-]+$/.test(w[2]) && !PARTICLE.has(w[2])) out.push(w[2]); // GBIF's canonical form, with no rank word
  return out.join(' ');
}

export interface OwnNames {
  /** Every name that is the species' own, canonical and in lower case. */
  own: Set<string>;
  /** The same names as `nameKey` reads them: genus, then each epithet by `epithetKey`. */
  keys: Set<string>;
}

/**
 * An epithet as one name's spellings read it: `spellingKey` (gender, "ae", "ii", hyphens), with the ICN's 2024 correction
 * of epithets in "caffr-" to "afr-" (Erythrina caffra is Erythrina afra; Harpephyllum caffrum, Harpephyllum afrum)
 * (round seventy, the owner's run).
 */
export const epithetKey = (e: string) => spellingKey(e.toLowerCase().replace(/^caffr/, 'afr'));
/** A name as own names are compared (round seventy, the owner's run): the genus, then each epithet by `epithetKey`. */
export function nameKey(name: string): string {
  const w = (canonicalOf(name) ?? name).toLowerCase().split(/\s+/);
  return [w[0], ...w.slice(1).map(epithetKey)].join(' ');
}
/** Whether a name is one of the species' own, in any of its spellings: Othonna lineariifolia's "linearifolia" is not, Parodia erinacea's "erinaceus" is. */
export const isOwnName = (o: OwnNames, name: string) => o.own.has(name.toLowerCase()) || o.keys.has(nameKey(name));

/** The species' own names by the rule above. `heldElsewhere` says whether a species of this reference other than this one holds a name as its accepted name. */
export function ownNames(o: { scientific: string; sameType?: readonly string[]; synonyms?: readonly SynonymLike[]; heldElsewhere?: (name: string) => boolean }): OwnNames {
  const own = new Set([o.scientific, ...(o.sameType ?? [])].map((n) => n.toLowerCase()));
  for (const s of o.synonyms ?? []) {
    const name = typeof s === 'string' ? canonicalOf(s) : s.name;
    if (!name || (typeof s !== 'string' && /pro.?parte/i.test(s.status ?? ''))) continue;
    if (o.heldElsewhere?.(name)) continue;
    own.add(name.toLowerCase());
  }
  return { own, keys: new Set([...own].map(nameKey)) };
}

/**
 * A personal epithet's genitive in another gender or number ("burbidgei", "burbidgeae"), and nothing else (round
 * seventy-one; self-review 70 S-B12): the adjective in -ana, -anus or -anum is another name ("Parodia ritteri", "Parodia
 * ritteriana", two species Kew accepts; "Syzygium formosum", "Syzygium formosanum"), so a Wikidata label or GBIF record
 * spelt so is not this name. `epithetsAgree` keeps the adjective for iNaturalist, where Kew decides (`transferTaken`).
 */
export function genitivesAgree(a: string, b: string): boolean {
  if (epithetKey(a) === epithetKey(b)) return true;
  const stem = (e: string) => e.toLowerCase().replace(/(?:iae|ii|ae|i)$/, '');
  const x = stem(a), y = stem(b);
  return x.length >= 4 && x === y;
}
/** Two epithets that are one: by `epithetKey`, or one a personal name's stem and the other its adjective ("selloa", "selloana"). */
export function epithetsAgree(a: string, b: string): boolean {
  if (epithetKey(a) === epithetKey(b)) return true;
  const stem = (e: string) => e.toLowerCase().replace(/(?:ianus|ianum|iana|anus|anum|ana|iae|ii|ae|us|um|a|i)$/, '');
  const x = stem(a), y = stem(b);
  return x.length >= 4 && x === y;
}
