/**
 * The line a species page opens with when it was reached by another name (`?was=`), for the cases the reference holds
 * the name as this species' alone (round eighty-five; the three reviews' W1, P1, C1 and outside review A's 1).
 *
 * Since round eighty-four Kew's accepted name heads every page Kew's World Checklist accepts (the owner's decision 1),
 * and 501 headings changed. The line was written when every heading was GBIF's, and said of each old name "the GBIF
 * backbone accepts this species as <heading>": on the 501 pages that inverts the sources, since GBIF's backbone accepts
 * the old name and Kew holds it as a synonym of the heading. So the line now says whose verdict it is, by the record
 * that holds the name, and never says that GBIF's backbone accepts the heading:
 *
 * - GBIF's own name for the page's key, where Kew's name heads the page (`name.gbif`): GBIF's backbone accepts it, and
 *   Kew's World Checklist holds it as a synonym of the heading, or spells the name otherwise (`distribution.via`);
 * - a name Kew's World Checklist lists for this plant (`name.kew.synonyms`): Kew's verdict, and GBIF's too where its
 *   backbone also lists it;
 * - a name only GBIF's backbone lists: GBIF's verdict, about GBIF's name for the key;
 * - a page without a GBIF key: Kew's alone, as before;
 * - anything else the reference's index lists: the reference's own filing, with no source's verdict claimed.
 *
 * The parts are text with the heading or GBIF's name in italics, so the page renders them without HTML.
 */
import { canonicalSynonym, ranksClash } from '$core/names';

export type Part = { t: string; i?: true; /** a link to another page of the reference (round eighty-six) */ href?: string };

export type WasIn = {
  /** The name the page was reached by. */
  was: string;
  /** The page's heading (Kew's accepted name, or GBIF's where Kew does not decide). */
  heading: string;
  /** GBIF's name for the page's key, where another name heads the page (`name.gbif.scientific`). */
  gbifName?: string | null;
  /** How Kew's entry was reached from GBIF's name (`distribution.via.kind`): 'synonym-of' or 'spelling' say how Kew holds GBIF's name. */
  viaKind?: string | null;
  /** GBIF's backbone's older names of the key, as words (`name.synonyms`, canonical). */
  gbifSynonyms: readonly string[];
  /** Kew's names for the plant (`name.kew.synonyms`); null or undefined when Kew's file was not read for the page. */
  kewSynonyms?: readonly string[] | null;
  /** The address named a binomial of a variety GBIF's record lists. */
  variety?: boolean;
  /** The address named a variety of a binomial GBIF's record lists. */
  ofOlder?: boolean;
  /** GBIF's cached answer files the name under a subspecies or variety of the key. */
  below?: boolean;
  /** The page has no GBIF key (its names are Kew's alone). */
  gbifless?: boolean;
  /**
   * The record's names Kew's file places in another plant (`name.kew.elsewhere`, with their authors as stored), and those
   * of them Kew accepts as species of their own (`name.kew.acceptedElsewhere`): of such a name the line never says Kew
   * "does not list" it (round eighty-six; review-c C1).
   */
  kewElsewhere?: readonly string[] | null;
  kewAcceptedElsewhere?: readonly string[] | null;
  /** The one page of the reference whose Kew older names hold the name, when there is exactly one. */
  kewHolder?: { slug: string; name: string } | null;
  /** Whether a page holds it was not checked: the search file it is read from could not be read (round eighty-six, the final review's U5). */
  kewHolderUnchecked?: boolean;
};

/** Words alone: no case, no hybrid sign, no rank marker, one space. */
export const plainWords = (x: string) => x.toLowerCase().replace(/×\s*/g, '').replace(/\b(var|subsp|ssp|f|fo|forma)\.?\s/g, '').replace(/\s+/g, ' ').trim();

/** Levenshtein distance, for two epithets of one genus that differ only in spelling ("tabulaeforme", "tabuliforme"). */
function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/**
 * Two names that differ only in spelling: the same genus and the same number of words, every epithet within two letters
 * of the other's, and at least one different. "Aeonium tabulaeforme" and "Aeonium tabuliforme" are; "Ceropegia alstonii"
 * and "Hoodia alstonii" are not (another genus), nor are "Agave amica" and "Polianthes tuberosa".
 */
export function onlySpelling(a: string, b: string): boolean {
  const x = plainWords(a).split(' '), y = plainWords(b).split(' ');
  if (x.length !== y.length || x.length < 2 || x[0] !== y[0] || x.join(' ') === y.join(' ')) return false;
  return x.slice(1).every((w, i) => distance(w, y[i + 1]) <= 2);
}

// Never a name of another rank: "Aloe bus var. cus" is not Kew's Aloe bus subsp. cus (round eighty-six, final review U2).
const has = (list: readonly string[] | null | undefined, name: string) => !!list && list.some((x) => plainWords(x) === plainWords(name) && !ranksClash(x, name));
/** The same, for names stored with their authors ("Anacampseros schmidtii (Berger) Poelln."): the name's words alone. */
const hasNamed = (list: readonly string[] | null | undefined, name: string) => !!list && list.some((x) => { const c = canonicalSynonym(x); return !!c && plainWords(c) === plainWords(name) && !ranksClash(c, name); });

/**
 * What Kew's World Checklist holds of a name the record says it places in another plant (round eighty-six; review-c
 * C1): under the one page here that holds it among Kew's older names, linked; as a species of its own; or in another
 * plant than the heading. Never "does not list".
 */
function kewElsewhereTail(w: WasIn, H: Part): Part[] {
  if (w.kewHolder) return [{ t: " Kew's World Checklist holds it as a synonym of " }, { t: w.kewHolder.name, i: true, href: `/species/${w.kewHolder.slug}` }, { t: ', which has its own page here, not of ' }, H, { t: '.' }];
  // Not checked is never said as none (rule 2): which page here holds the name is read from the search's files.
  const unchecked: Part[] = w.kewHolderUnchecked ? [{ t: " Whether a page of the reference holds it was not checked: the reference's search files could not be read just now." }] : [];
  if (hasNamed(w.kewAcceptedElsewhere, w.was)) return [{ t: " Kew's World Checklist accepts it as a species of its own, apart from " }, H, { t: w.kewHolderUnchecked ? '.' : ', and no page of the reference holds it.' }, ...unchecked];
  return [{ t: " Kew's World Checklist holds it for another plant than " }, H, { t: ', which heads this page.' }, ...unchecked];
}

/** The line after the bold old name, as parts; the page renders `<b>{was}</b> ` and then these. */
export function wasLine(w: WasIn): Part[] {
  const H: Part = { t: w.heading, i: true };
  const kewRead = Array.isArray(w.kewSynonyms);
  const gbifName = w.gbifName && plainWords(w.gbifName) !== plainWords(w.heading) ? w.gbifName : null;
  // The name GBIF's backbone files the key under: its own where Kew's heads the page, else the heading (GBIF's).
  const G: Part = gbifName ? { t: gbifName, i: true } : H;
  // A name Kew's file places in another plant: GBIF's filing, then Kew's placement (round eighty-six; review-c C1:
  // "Echinopsis chalaensis … Kew's World Checklist accepts the species as Echinopsis macrogona" left out that Kew accepts
  // E. chalaensis apart).
  const away = hasNamed(w.kewElsewhere, w.was) && !(gbifName && plainWords(w.was) === plainWords(gbifName));
  if (w.below && away) return [{ t: "is, in GBIF's backbone, a synonym of a subspecies or variety of " }, G, { t: gbifName ? ", GBIF's name for this plant." : '.' }, ...kewElsewhereTail(w, H)];
  if (w.below) {
    return gbifName
      ? [{ t: "is, in GBIF's backbone, a synonym of a subspecies or variety of " }, G, { t: ", GBIF's name for this plant. Kew's World Checklist accepts the species as " }, H, { t: ', which heads this page. The reference files species, so the name is shown here.' }]
      : [{ t: "is, in GBIF's backbone, a synonym of a subspecies or variety of " }, H, { t: '. The reference files species, so the name is shown here.' }];
  }
  // The heading's own words, written without its rank ("Conophytum calculus vanzylii", GBIF's form of Kew's subspecies).
  if (plainWords(w.was) === plainWords(w.heading)) return [{ t: "is this plant's name written without its rank. Kew's World Checklist writes it " }, H, { t: ', which heads this page.' }];
  if (w.gbifless) {
    return [{ t: `is ${w.variety ? 'an older name of a variety of this species' : 'an older name of this species'}: Kew's World Checklist files it under ` }, H, { t: ', and the reference files it under that name.' }];
  }
  // GBIF's own name for the key, on a page Kew's name heads: GBIF accepts it; Kew holds it otherwise.
  if (gbifName && plainWords(w.was) === plainWords(gbifName)) {
    if (w.viaKind === 'spelling' || onlySpelling(gbifName, w.heading)) return [{ t: "is GBIF's spelling of this plant's name. Kew's World Checklist spells it " }, H, { t: ', which heads this page.' }];
    if (w.viaKind === 'synonym-of') return [{ t: "is GBIF's name for this plant, and GBIF's backbone accepts it. Kew's World Checklist holds it as a synonym of " }, H, { t: ', which heads this page: the reference takes its names from Kew.' }];
    return [{ t: "is GBIF's name for this plant, and GBIF's backbone accepts it. Kew's World Checklist accepts the plant as " }, H, { t: ', which heads this page: the reference takes its names from Kew.' }];
  }
  const what = w.variety ? 'an older name of a variety of this species' : w.ofOlder ? 'a variety under an older name of this species' : 'an older name of this species';
  if (away) return [{ t: `is ${w.variety ? 'an older name of a variety of this species' : 'an older name of this species'} in GBIF's backbone, which files it under ` }, G, { t: gbifName ? ", GBIF's name for this plant." : '.' }, ...kewElsewhereTail(w, H)];
  const inKew = has(w.kewSynonyms, w.was);
  const inGbif = has(w.gbifSynonyms, w.was) || !!w.variety || !!w.ofOlder;
  if (inKew) {
    if (onlySpelling(w.was, w.heading)) return [{ t: "is another spelling of this plant's name. Kew's World Checklist spells it " }, H, { t: `, which heads this page${inGbif ? "; GBIF's backbone lists the other spelling too" : ''}.` }];
    return [{ t: `is ${what}. Kew's World Checklist holds it as a synonym of ` }, H, { t: `, which heads this page${inGbif ? "; GBIF's backbone lists it as an older name too" : ''}.` }];
  }
  if (inGbif) {
    const lead: Part[] = [{ t: `is ${what} in GBIF's backbone, which files it under ` }, G];
    if (gbifName) return [...lead, { t: ", GBIF's name for this plant. Kew's World Checklist accepts the plant as " }, H, { t: `, which heads this page${kewRead ? ', and does not list this name among its synonyms' : ''}.` }];
    return [...lead, { t: kewRead ? ". Kew's World Checklist does not list it among this species' synonyms." : '.' }];
  }
  return [{ t: `is ${what}, which the reference files under ` }, H, { t: '.' }];
}

/**
 * The line under "Names & registers" for GBIF's own name on a page Kew's name heads (round eighty-five; W1: 416 of the
 * 501 pages listed GBIF's accepted name among "Also known as … (GBIF Backbone)", a GBIF synonym it is not). Null on a
 * page headed by GBIF's own name.
 */
export function gbifNameLine(heading: string, gbif: { scientific?: string; authorship?: string } | null | undefined, viaKind?: string | null): Part[] | null {
  const g = gbif?.scientific;
  if (!g || plainWords(g) === plainWords(heading)) return null;
  const G: Part = { t: `${g}${gbif?.authorship ? ` ${gbif.authorship}` : ''}`, i: true };
  if (viaKind === 'spelling' || onlySpelling(g, heading)) return [G, { t: ": GBIF's backbone spells this plant's name so, and accepts it; Kew's World Checklist spells it " }, { t: heading, i: true }, { t: '.' }];
  return [G, { t: ": the name GBIF's backbone accepts for this plant; Kew's World Checklist " }, ...(viaKind === 'synonym-of' ? [{ t: 'holds it as a synonym of ' }] : [{ t: 'accepts the plant as ' }]), { t: heading, i: true }, { t: '.' }];
}
