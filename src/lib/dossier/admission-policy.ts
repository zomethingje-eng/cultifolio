/**
 * The range test's admission policy, one typed object (round eighty-six; outside review B's 6, review D4 and D8, the plan's
 * A6, B2 and B5). The derivation (`regionTester` in `tdwg-shapes.ts`), the walk's check (`range-check.ts`), the records'
 * words in each page's record of its sources (`rangeTest` in `build.ts`) and the methodology and glossary on /about/how read
 * this one object, so no two of them can state the rule otherwise.
 *
 * Round eighty-five's rule (`POLICY_R85`) let a record that states no country in by the margin and the coast reach: the
 * `ours` test read "no country" as "ours" (outside review B's 6; review D4). Round eighty-six's (`POLICY_R86`):
 *
 *   - a record strictly inside a native region's shape, inside a shapeless native region's box, or on a native region's
 *     minor island is in, as before, whether or not it states a country: the drawing says where it is;
 *   - the margin, the coast reach and the island reach take only a record that states the region's country: a record that
 *     states none is not guessed into a region it does not lie in;
 *   - the shapes are simplified to 0.02° (Douglas-Peucker, `meta.simplified`), so a border is drawn no closer than that, and a
 *     record strictly inside another region's shape within 0.02° of a native shape counts for the native region when its
 *     stated country is that region's and not the other's (Begonia faustinoi's record at Union Juarez, Chiapas, 0.005° over
 *     Guatemala's line). Where both regions are of the record's country (the Free State and KwaZulu-Natal, Albuca
 *     fastigiata's Sentinel records), the record's stated state or province decides where it names one of the two: it
 *     counts when it names the native one, and not when it names the other. A record that names neither is counted: within
 *     the drawing's own tolerance the line cannot tell (review D4);
 *   - the island reach stops at a foreign coast: a record beyond every drawn coast's reach that lies nearer another
 *     country's drawn land than the native region's is not counted for it (the plan's B5). Review D8's open sea inside a
 *     mainland region's box is not settled here (`islandBox`).
 *
 * Pure: no file is read here.
 */

/** Why a record counts for a native region: the four reasons each dossier counts (`occurrences.admitted`). */
export type Admission = 'strict' | 'buffer' | 'coast' | 'island';
export const ADMISSIONS: ReadonlyArray<Admission> = ['strict', 'buffer', 'coast', 'island'];

/**
 * Within a reason, which clause took the record (round eighty-six): said by the dry run and the walk's tallies, never
 * stored apart in a dossier (the border allowance is counted with the margin, `buffer`, as the drawing's own tolerance).
 */
export type AdmissionBy = 'border' | 'border-state' | 'minor-island' | 'country-reach' | 'box';

export interface AdmissionPolicy {
  /** The rule's name, written in every page derived by it (`occurrences.rangeRule`, "shapes rule r86"). */
  rule: string;
  /** How far beyond a native shape's drawn edge a record on no region's land still counts for it, in degrees. */
  marginDeg: number;
  /** How far off a drawn coast a record on no region's land counts for the region whose coast is nearest, in degrees. */
  coastDeg: number;
  /** Beyond the coast reach: how near a native shape a record stating its country counts as on an island too small to draw. */
  islandDeg: number;
  /**
   * Beyond `islandDeg`, inside the native region's box (TDWG's extent: Macauley and Curtis Is. in the Kermadecs'). `'whole'`
   * is round eighty-five's: anywhere in the box, so the open sea inside a mainland region's box was "an island" (review D8:
   * Acer palmatum 0.84° off Honshu, Patellifolia procumbens at whole degrees off Spain). `'beyond-drawing'` (round eighty-six):
   * only the part of TDWG's box the drawn shape's own extent does not reach, where TDWG's polygon holds land Natural Earth
   * does not draw (Macauley, a degree south of Raoul, the Kermadecs' one drawn island). `'none'`: never.
   */
  islandBox: 'whole' | 'beyond-drawing' | 'none';
  /**
   * The island reach (`islandDeg` and the box) stops at another country's drawn land: a record nearer a shape or a minor
   * island of a region whose countries do not include the record's stated country than the native region's is not counted.
   * `'other-region'` would stop at any other region's land, of the same country or not; `'none'` is round eighty-five's.
   */
  islandStopsAt: 'other-country' | 'other-region' | 'none';
  /**
   * Review D4: how far across a drawn border, strictly inside another region's shape, a record still counts for a native
   * region whose country it states (the shapes' own simplification tolerance); 0 for none (round eighty-five).
   */
  borderDeg: number;
  /**
   * Review D4: a border inside one country is decided by the record's stated state or province, where it names one of the
   * two regions; `unnamed` is what a record that names neither gets (`'admit'`: the line cannot tell within its tolerance).
   */
  borderState: { read: boolean; unnamed: 'admit' | 'refuse' };
  /**
   * What a record that states no country is let in by. Inside a shape, inside a shapeless region's box and on a minor
   * island are always in: those are where the record lies, not a guess.
   */
  missingCountry: { margin: boolean; coast: boolean; island: boolean };
  /** A region with no shape (Christmas I., Cocos (Keeling) Is., the South China Sea) is tested by its box and the margin. */
  shapeless: 'box';
}

/** Round eighty-five's rule, as the corpus of 5 November 2026 was derived by it: the dry run's "before". */
export const POLICY_R85: AdmissionPolicy = {
  rule: 'r85',
  marginDeg: 0.05,
  coastDeg: 0.15,
  islandDeg: 0.5,
  islandBox: 'whole',
  islandStopsAt: 'none',
  borderDeg: 0,
  borderState: { read: false, unnamed: 'refuse' },
  missingCountry: { margin: true, coast: true, island: true },
  shapeless: 'box'
};

/** Round eighty-six's rule (the module's comment says each part and why). */
export const POLICY_R86: AdmissionPolicy = {
  rule: 'r86',
  marginDeg: 0.05,
  coastDeg: 0.15,
  islandDeg: 0.5,
  // Review D8 (the open sea inside a mainland region's box) is not settled by the box alone: 'beyond-drawing' also drops
  // real islands the drawing lacks inside a drawn extent (Heron I. in the Capricorn Group, 0.51° off Queensland's drawn
  // coast; the Tuamotus' undrawn atolls): about 60 of the 293 island records review D sampled. Kept whole until the owner decides.
  islandBox: 'whole',
  islandStopsAt: 'other-country',
  borderDeg: 0.02,
  borderState: { read: true, unnamed: 'admit' },
  missingCountry: { margin: false, coast: false, island: false },
  shapeless: 'box'
};

/** The rule the builder derives by and the check reads every page against. */
export const ADMISSION_POLICY: AdmissionPolicy = POLICY_R86;

/** Kilometres for a number of degrees of latitude, as the pages say them ("about 5.6 km"). */
export const kmOf = (deg: number): string => {
  const km = deg * 111.2;
  return km < 20 ? km.toFixed(1).replace(/\.0$/, '') : String(Math.floor(km / 5) * 5);
};
/** "0.05°", as the pages write a reach. */
export const degWords = (deg: number): string => `${deg}°`;

/**
 * A state or province's name as the border allowance compares it (review D4): lower case, without accents, the words
 * "province", "state", "region" and the like, and anything not a letter. "Free State Province" and Natural Earth's "Free
 * State" read alike; "Kwazulu Natal" and "KwaZulu-Natal" too.
 */
export function stateKey(s: string | null | undefined): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(province|provincia|provinz|state|estado|etat|region|departamento|department|dept|prov)\b\.?/g, ' ')
    .replace(/[^a-z]+/g, '');
}

/**
 * The clause each page's record of its sources adds after the shapes' source (`rangeTest`): what took a record in beyond
 * a shape. Round eighty-five's words for its own rule, unchanged.
 */
export function recordWords(p: AdmissionPolicy): string {
  if (p.rule < 'r86') return 'a record within the margin or off a coast counted only on no other region\'s land and in the region\'s own country';
  return `a record within the margin, off a coast or on an island too small to draw counted only when it states the region's country, and only on no other region's land but within ${degWords(p.borderDeg)} of a native shape across a border${p.borderState.read ? ', where its stated state or province does not name the other region' : ''}`;
}

/**
 * The methodology's sentences on /about/how, made from the policy (round eighty-six): the summary, the margin's rule, the
 * border allowance, the coast reach, the islands, and the glossary's two entries.
 */
export function policyWords(p: AdmissionPolicy): { summary: string; margin: string; border: string; coast: string; islands: string; missing: string; glossBuffer: string; glossCoast: string } {
  const none = !p.missingCountry.margin && !p.missingCountry.coast && !p.missingCountry.island;
  return {
    summary: `Each record is tested against Kew's native regions, drawn from Natural Earth's provinces. A record just over a border, off a coast or on an island too small to draw counts only when it states that region's country${p.borderDeg ? `, and a record ${degWords(p.borderDeg)} or less inside a neighbouring region's shape counts for the native one only by its stated country and, where it names one, its state` : ''}.`,
    margin: `A record in no region's shape counts for a native region within the buffer of ${degWords(p.marginDeg)} beyond its edge (about ${kmOf(p.marginDeg)} km), or off its coast within the coast reach. That is only when it states the country of the region it would count for.`,
    border: p.borderDeg
      ? `The shapes are simplified to about 2 km (${degWords(p.borderDeg)}), so a border is drawn no closer than that. A record inside a neighbouring region's shape but within ${degWords(p.borderDeg)} of a native one counts for the native region when its stated country is that region's and not the neighbour's. Where both are of its country (the Free State and KwaZulu-Natal), the state or province the record names decides: it counts when that is the native region's, and not when it is the neighbour's. A record that names neither counts, since within the drawing's own accuracy the line cannot tell.`
      : `A record inside another region's shape is that region's, native or not, however near the native one.`,
    coast: `The coast reach is ${degWords(p.coastDeg)} (about ${kmOf(p.coastDeg)} km). A record in no region's shape, at sea or on an islet the shapes do not draw, counts for the region whose drawn coast is nearest within it, when it states that region's country. A record on another region's land never does: Belgium is no part of France's range, however near.`,
    islands: `A record beyond the coast reach, in no shape, counts for a native region where a source puts land there. That is an island of Natural Earth's minor islands, each given to the region of the nearest shape. Or the record states that region's country and lies within ${degWords(p.islandDeg)} of its shape (about ${kmOf(p.islandDeg)} km)${p.islandBox === 'whole' ? ', or inside its box' : p.islandBox === 'beyond-drawing' ? ", or inside TDWG's box for the region where the drawn shape does not reach (the Kermadecs' Macauley Island)" : ''}${p.islandStopsAt === 'none' ? '' : `, and no ${p.islandStopsAt === 'other-country' ? "other country's" : "other region's"} drawn land lies nearer`}.`,
    missing: none
      ? 'A record that states no country counts only where it lies inside a native shape, inside the box of a native region with no shape, or on a native minor island: no region is guessed for it.'
      : 'A record that states no country is tested by where it lies alone.',
    glossBuffer: `How far beyond a region's drawn edge a record still counts for it: ${degWords(p.marginDeg)}, about ${kmOf(p.marginDeg)} km, the drawing's own accuracy. Only for a record in no region's shape that states that region's country.`,
    glossCoast: `How far off a drawn coast a record at sea, or on an islet too small to draw, still counts for the region whose coast is nearest: ${degWords(p.coastDeg)}, about ${kmOf(p.coastDeg)} km.`
  };
}
